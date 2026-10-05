import { get } from 'svelte/store'
import { transitionSyncState, type SyncEvent } from '../services/script/syncStateMachine'
import type { AppState } from '../types/project'
import { effectivePythonFiles, type PythonFileName } from '../services/script/scriptGenerator'
import { appState, workerClient, persist, regenerateScript } from './projectContext'
import { appendScriptOutput, patchRuntime } from './runtimeState'
import { computePrecision } from './computeSettings'
import { ExecutionCache, scriptExecutionKey } from './executionCache'
import { applyScriptResult } from './scriptResult'
import { buildRunScript, runnerMetadata, runnerScriptFiles } from '../services/script/runScript'
import { afterPaint } from './activityState'
import type { BatchSampleResult } from '../worker/messages'

export interface ScriptExecutionOptions {
  /** Report in the output panel when every sample is already up to date. */
  announceSkip?: boolean
}

interface ScriptExecutionRequest {
  datasetIds?: string[]
  options: ScriptExecutionOptions
}

const executionCache = new ExecutionCache()
let activeScriptExecution: Promise<void> | null = null
let latestPendingScript: ScriptExecutionRequest | null = null

/**
 * Runs the script for every visible sample whose script inputs changed since its
 * applied result. Requests arriving during a run collapse into one follow-up run.
 */
export function executeScriptForDatasets(
  datasetIds?: string[],
  options: ScriptExecutionOptions = {},
): Promise<void> {
  if (activeScriptExecution) {
    latestPendingScript = { datasetIds, options }
    return activeScriptExecution
  }

  const execution = runScriptExecution({ datasetIds, options })
  activeScriptExecution = execution
  const runPending = () => {
    activeScriptExecution = null
    const pending = latestPendingScript
    latestPendingScript = null
    if (pending) void executeScriptForDatasets(pending.datasetIds, pending.options)
  }
  void execution.then(runPending, runPending)
  return execution
}

/** Forces the next run for one sample, e.g. after peak detection replaced its script-assigned peaks. */
export function invalidateScriptResult(datasetId: string): void {
  executionCache.forget(datasetId)
}

/** Forgets applied results, e.g. when a new session starts. */
export function resetScriptExecutionCache(): void {
  executionCache.clear()
}

function finishExecution(appliedCount: number, total: number, errors: string[]): void {
  patchRuntime({
    workerBusy: false,
    workerLastError: errors.length > 0
      ? `Script applied to ${appliedCount}/${total} samples. First error: ${errors[0]}`
      : null,
    scriptProgress: {
      active: false,
      completed: appliedCount,
      total,
      message: errors.length > 0 ? 'Execution finished with errors' : 'Execution finished',
    },
  })
  appendScriptOutput(errors.length > 0
    ? `Execution finished with errors (${appliedCount}/${total} samples applied).`
    : `Execution finished successfully (${appliedCount} sample${appliedCount === 1 ? '' : 's'} applied).`)
}

/** Samples per worker request: small enough for steady progress, large enough to amortise the Python start-up. */
const CHUNK_MAX_SAMPLES = 8
const CHUNK_MAX_POINTS = 60_000

function chunkByPoints<T extends { dataset: { data: { abscissa: ArrayLike<number> } } }>(items: T[]): T[][] {
  const chunks: T[][] = []
  let current: T[] = []
  let points = 0
  for (const item of items) {
    const size = item.dataset.data.abscissa.length
    if (current.length > 0 && (current.length >= CHUNK_MAX_SAMPLES || points + size > CHUNK_MAX_POINTS)) {
      chunks.push(current)
      current = []
      points = 0
    }
    current.push(item)
    points += size
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/**
 * Sends the changed samples to the worker in chunks so progress advances and the UI can
 * repaint between them, then applies every result in one store update: one re-render and
 * one autosave regardless of the number of samples.
 */
async function runScriptExecution({ datasetIds, options }: ScriptExecutionRequest): Promise<void> {
  const state = get(appState)
  const precision = get(computePrecision)
  const scriptFiles = runnerScriptFiles(effectivePythonFiles(state.datasets, state.generatedScript, state.pythonFileOverrides ?? {}))
  executionCache.retainOnly(state.datasets.map((item) => item.id))

  const candidates = state.datasets.filter((item) =>
    item.style.visible !== false
    && (!datasetIds || datasetIds.length === 0 || datasetIds.includes(item.id)),
  )
  const selected = candidates
    .map((dataset) => ({ dataset, key: scriptExecutionKey(dataset, scriptFiles, precision) }))
    .filter(({ dataset, key }) => !executionCache.isCurrent(dataset.id, key))

  if (selected.length === 0) {
    if (options.announceSkip && candidates.length > 0) {
      appendScriptOutput('All visible samples are up to date; nothing to execute.')
    }
    return
  }

  const labels = new Map(selected.map(({ dataset }) => [dataset.id, dataset.style.label]))
  const keys = new Map(selected.map(({ dataset, key }) => [dataset.id, key]))
  const total = selected.length
  appendScriptOutput(`Running processing for ${total} changed sample${total === 1 ? '' : 's'} (${precision}); ${candidates.length - total} unchanged skipped.`)

  patchRuntime({
    workerBusy: true,
    workerLastError: null,
    scriptProgress: { active: true, completed: 0, total, message: `Processing ${total} sample${total === 1 ? '' : 's'}` },
  })
  await afterPaint()

  let appliedCount = 0
  const errors: string[] = []
  const results: Array<Extract<BatchSampleResult, { ordinateModified: unknown }>> = []
  try {
    let processed = 0
    for (const chunk of chunkByPoints(selected)) {
      const response = await workerClient.executeBatch({
        runScript: buildRunScript(chunk.map(({ dataset }) => dataset.id)),
        scriptFiles,
        samples: chunk.map(({ dataset }) => ({
          id: dataset.id,
          abscissa: dataset.data.abscissa,
          ordinate: dataset.data.ordinateOriginal,
          metadata: runnerMetadata(dataset),
        })),
        preferFloat32: precision === 'float32',
      })
      if (response.type !== 'batch_result') {
        const message = response.type === 'error' ? response.message : `worker returned ${response.type}`
        errors.push(message)
        appendScriptOutput(`Execution failed: ${message}`)
        return
      }
      for (const result of response.results) {
        if ('error' in result) {
          const label = labels.get(result.id) ?? result.id
          errors.push(`${label}: ${result.error}`)
          appendScriptOutput(`${label}: ${result.error}`)
        } else {
          results.push(result)
        }
      }
      processed += chunk.length
      const last = labels.get(chunk[chunk.length - 1].dataset.id) ?? ''
      patchRuntime((runtime) => ({ scriptProgress: { ...runtime.scriptProgress, completed: processed, message: `Processed ${last}` } }))
      await afterPaint()
    }

    const outcomes: string[] = []
    appState.update((current) => {
      const updates = new Map<string, AppState['datasets'][number]>()
      for (const result of results) {
        const label = labels.get(result.id) ?? result.id
        const item = current.datasets.find((candidate) => candidate.id === result.id)
        // Inputs edited during the run make this result obsolete; the follow-up run replaces it.
        if (!item || scriptExecutionKey(item, scriptFiles, precision) !== keys.get(result.id)) {
          outcomes.push(`${label}: inputs changed during execution; result discarded.`)
          continue
        }
        try {
          const updated = applyScriptResult(item, result)
          updates.set(updated.id, updated)
          executionCache.remember(updated.id, keys.get(result.id) ?? '')
          const removed = result.ordinateModified.filter((value) => Number.isNaN(value)).length
          outcomes.push(`${label}: processed ${result.ordinateModified.length - removed} points${removed ? ` (${removed} outside the crop window)` : ''}.`)
        } catch (error) {
          const message = `${label}: ${error instanceof Error ? error.message : String(error)}`
          errors.push(message)
          outcomes.push(message)
        }
      }
      appliedCount = updates.size
      if (updates.size === 0) return current
      return persist({ ...current, datasets: current.datasets.map((candidate) => updates.get(candidate.id) ?? candidate) })
    })
    appendScriptOutput(...outcomes)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown script execution failure'
    errors.push(message)
    appendScriptOutput(`Execution failed: ${message}`)
  } finally {
    finishExecution(appliedCount, total, errors)
  }
}

export function setScriptOverride(value: string): void {
  setPythonFileOverride('main.py', value)
}

export function setPythonFileOverride(fileName: PythonFileName, value: string): void {
  applySyncEvent({ type: 'SCRIPT_MANUAL_EDIT' }, (state) => ({
    userScriptOverride: fileName === 'main.py' ? value : state.userScriptOverride,
    pythonFileOverrides: { ...state.pythonFileOverrides, [fileName]: value },
  }))
}

/** Discards manual script edits and returns to the script generated from the GUI state. */
function resetToGeneratedScript(event: SyncEvent): void {
  applySyncEvent(event, (state) => ({
    generatedScript: regenerateScript(state.datasets),
    userScriptOverride: null,
    pythonFileOverrides: {},
  }))
}

export function revertScriptToGuiState(): void {
  resetToGeneratedScript({ type: 'REVERT_TO_GUI' })
}

export function confirmOverwriteForGuiEdits(): void {
  resetToGeneratedScript({ type: 'CONFIRM_OVERWRITE' })
}

function applySyncEvent(event: SyncEvent, patch: (state: AppState) => Partial<AppState>): void {
  appState.update((state) => {
    const sync = transitionSyncState({ mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled }, event)
    return persist({ ...state, ...patch(state), syncMode: sync.mode, scriptSyncEnabled: sync.scriptSyncEnabled })
  })
}
