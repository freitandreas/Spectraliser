import { get } from 'svelte/store'
import { transitionSyncState } from '../services/script/syncStateMachine'
import { effectivePythonFiles, type PythonFileName } from '../services/script/scriptGenerator'
import { appState, workerClient, scheduleAutosave, regenerateScript, logScriptDebug, appendScriptOutput } from './projectContext'
import { computePrecision } from './computeSettings'
import { ExecutionCache, scriptExecutionKey } from './executionCache'
import { applyScriptResult } from './scriptResult'
import { buildRunScript, runnerMetadata, runnerScriptFiles } from '../services/script/runScript'

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
  appState.update((current) => ({
    ...current,
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
  }))
  appendScriptOutput(errors.length > 0
    ? `Execution finished with errors (${appliedCount}/${total} samples applied).`
    : `Execution finished successfully (${appliedCount} sample${appliedCount === 1 ? '' : 's'} applied).`)
}

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

  const sampleIds = selected.map(({ dataset }) => dataset.id)
  const labels = new Map(selected.map(({ dataset }) => [dataset.id, dataset.style.label]))
  const keys = new Map(selected.map(({ dataset, key }) => [dataset.id, key]))
  logScriptDebug('execute_script_start', {
    selectedCount: selected.length,
    skippedCount: candidates.length - selected.length,
    datasetIds: sampleIds,
    precision,
    syncMode: state.syncMode,
  })
  appendScriptOutput(`Running processing for ${selected.length} changed sample${selected.length === 1 ? '' : 's'} (${precision}); ${candidates.length - selected.length} unchanged skipped.`)

  appState.update((current) => ({
    ...current,
    workerBusy: true,
    workerLastError: null,
    scriptProgress: {
      active: true,
      completed: 0,
      total: selected.length,
      message: `Processing ${selected.length} sample${selected.length === 1 ? '' : 's'}`,
    },
  }))

  let appliedCount = 0
  const errors: string[] = []
  try {
    const response = await workerClient.executeBatch({
      runScript: buildRunScript(sampleIds),
      scriptFiles,
      samples: selected.map(({ dataset }) => ({
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
      const label = labels.get(result.id) ?? result.id
      if ('error' in result) {
        errors.push(`${label}: ${result.error}`)
        appendScriptOutput(`${label}: ${result.error}`)
        continue
      }
      let outcome = ''
      appState.update((current) => {
        const item = current.datasets.find((candidate) => candidate.id === result.id)
        // Inputs edited during the run make this result obsolete; the follow-up run replaces it.
        if (!item || scriptExecutionKey(item, scriptFiles, precision) !== keys.get(result.id)) {
          outcome = `${label}: inputs changed during execution; result discarded.`
          return current
        }
        let updated
        try {
          updated = applyScriptResult(item, result)
        } catch (error) {
          outcome = `${label}: ${error instanceof Error ? error.message : String(error)}`
          errors.push(outcome)
          return current
        }
        appliedCount += 1
        executionCache.remember(updated.id, keys.get(result.id) ?? '')
        const removed = result.ordinateModified.filter((value) => Number.isNaN(value)).length
        outcome = `${label}: processed ${result.ordinateModified.length - removed} points${removed ? ` (${removed} outside the crop window)` : ''}.`
        const nextState = {
          ...current,
          datasets: current.datasets.map((candidate) => candidate.id === updated.id ? updated : candidate),
          updatedAt: new Date().toISOString(),
          scriptProgress: { ...current.scriptProgress, completed: appliedCount, message: `Processed ${label}` },
        }
        scheduleAutosave(nextState)
        return nextState
      })
      appendScriptOutput(outcome)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown script execution failure'
    errors.push(message)
    appendScriptOutput(`Execution failed: ${message}`)
    logScriptDebug('execute_script_error', { datasetIds: sampleIds, message })
  } finally {
    finishExecution(appliedCount, selected.length, errors)
  }
}

export function setScriptOverride(value: string): void {
  setPythonFileOverride('main.py', value)
}

export function setPythonFileOverride(fileName: PythonFileName, value: string): void {
  appState.update((state) => {
    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'SCRIPT_MANUAL_EDIT' },
    )

    const nextState = {
      ...state,
      userScriptOverride: fileName === 'main.py' ? value : state.userScriptOverride,
      pythonFileOverrides: {
        ...state.pythonFileOverrides,
        [fileName]: value,
      },
      syncMode: syncResult.mode,
      scriptSyncEnabled: syncResult.scriptSyncEnabled,
      updatedAt: new Date().toISOString(),
    }

    logScriptDebug('script_override_updated', {
      scriptLength: value.length,
      syncMode: nextState.syncMode,
      scriptSyncEnabled: nextState.scriptSyncEnabled,
    })

    scheduleAutosave(nextState)
    return nextState
  })
}

export function revertScriptToGuiState(): void {
  appState.update((state) => {
    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'REVERT_TO_GUI' },
    )

    const nextState = {
      ...state,
      generatedScript: regenerateScript(state.datasets),
      userScriptOverride: null,
      pythonFileOverrides: {},
      syncMode: syncResult.mode,
      scriptSyncEnabled: syncResult.scriptSyncEnabled,
      updatedAt: new Date().toISOString(),
    }

    logScriptDebug('revert_to_gui_state', {
      datasetCount: state.datasets.length,
      syncMode: nextState.syncMode,
      scriptSyncEnabled: nextState.scriptSyncEnabled,
    })

    scheduleAutosave(nextState)
    return nextState
  })
}

export function confirmOverwriteForGuiEdits(): void {
  appState.update((state) => {
    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'CONFIRM_OVERWRITE' },
    )

    const nextState = {
      ...state,
      userScriptOverride: null,
      pythonFileOverrides: {},
      generatedScript: regenerateScript(state.datasets),
      syncMode: syncResult.mode,
      scriptSyncEnabled: syncResult.scriptSyncEnabled,
      updatedAt: new Date().toISOString(),
    }

    scheduleAutosave(nextState)
    return nextState
  })
}
