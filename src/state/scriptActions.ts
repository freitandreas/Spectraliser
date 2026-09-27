import { get } from 'svelte/store'
import { transitionSyncState } from '../services/script/syncStateMachine'
import { effectivePythonFiles, type PythonFileName } from '../services/script/scriptGenerator'
import { appState, workerClient, scheduleAutosave, regenerateScript, logScriptDebug, appendScriptOutput } from './projectContext'
import { mergeAssignedPeaks, shouldApplyAssignedPeaks } from './peakMerge'

let activeScriptExecution: Promise<void> | null = null
let latestPendingScript: { scriptCode: string; datasetIds?: string[] } | null = null

export function executeScriptForDatasets(scriptCode: string, datasetIds?: string[]): Promise<void> {
  if (activeScriptExecution) {
    latestPendingScript = { scriptCode, datasetIds }
    return activeScriptExecution
  }

  const execution = runScriptExecution(scriptCode, datasetIds)
  activeScriptExecution = execution
  void execution.then(() => {
    activeScriptExecution = null
    const pending = latestPendingScript
    latestPendingScript = null
    if (pending) void executeScriptForDatasets(pending.scriptCode, pending.datasetIds)
  }, () => {
    activeScriptExecution = null
    const pending = latestPendingScript
    latestPendingScript = null
    if (pending) void executeScriptForDatasets(pending.scriptCode, pending.datasetIds)
  })
  return execution
}

async function runScriptExecution(scriptCode: string, datasetIds?: string[]): Promise<void> {
  const state = get(appState)
  const selected = state.datasets.filter((item) =>
    item.style.visible !== false
    && (!datasetIds || datasetIds.length === 0 || datasetIds.includes(item.id)),
  )

  if (selected.length === 0) {
    return
  }

  logScriptDebug('execute_script_start', {
    selectedCount: selected.length,
    scriptLength: scriptCode.length,
    datasetIds: selected.map((item) => item.id),
    labels: selected.map((item) => item.style.label),
    pipelineLengths: selected.map((item) => item.pipeline.length),
    syncMode: state.syncMode,
    scriptSyncEnabled: state.scriptSyncEnabled,
    userOverrideActive: state.userScriptOverride !== null,
  })
  appendScriptOutput(`Starting script execution for ${selected.length} sample${selected.length === 1 ? '' : 's'}.`)

  appState.update((current) => ({
    ...current,
    workerBusy: true,
    workerLastError: null,
    scriptProgress: {
      active: true,
      completed: 0,
      total: selected.length,
      message: 'Preparing script execution',
    },
  }))

  let appliedCount = 0
  const datasetErrors: string[] = []

  for (const dataset of selected) {
    appState.update((current) => ({
      ...current,
      scriptProgress: {
        ...current.scriptProgress,
        message: `Processing ${dataset.style.label}`,
      },
    }))
    try {
      const response = await workerClient.executeScript({
        spectrumId: dataset.id,
        abscissa: dataset.data.abscissa,
        ordinate: dataset.data.ordinateOriginal,
        metadata: {
          name: dataset.name,
          sourcePath: dataset.sourcePath,
          spectrumType: dataset.spectrumType,
          pipeline: dataset.pipeline,
          units: {
            x: dataset.units.x,
            y: dataset.units.y,
          },
          style: {
            label: dataset.style.label,
            lineColor: dataset.style.lineColor,
            lineWidth: dataset.style.lineWidth,
            scatterSymbol: dataset.style.scatterSymbol,
            visible: dataset.style.visible,
          },
          peakDetectionMode: dataset.peakDetection?.mode ?? 'maxima',
          peakDetection: dataset.peakDetection ?? {
            prominence: 0.01,
            minDistance: 1,
            minHeight: null,
            mode: 'maxima',
          },
        },
        scriptCode,
        scriptFiles: effectivePythonFiles(state.datasets, state.generatedScript, {
          ...state.pythonFileOverrides,
          'main.py': scriptCode,
        }),
        preferFloat32: true,
      })

      if (response.type !== 'result') {
        logScriptDebug('execute_script_non_result', {
          spectrumId: dataset.id,
          responseType: response.type,
        })
        datasetErrors.push(`${dataset.style.label}: ${response.type}`)
        appendScriptOutput(`${dataset.style.label}: worker returned ${response.type}.`)
        continue
      }

      logScriptDebug('execute_script_result', {
        spectrumId: response.spectrumId,
        points: response.ordinateModified.length,
        hasAbscissa: Array.isArray(response.abscissa),
        hasOriginal: Array.isArray(response.ordinateOriginal),
        hasMetadata: Boolean(response.metadata),
        styleLabel: response.metadata?.style?.label ?? null,
        styleColor: response.metadata?.style?.lineColor ?? null,
      })

      appliedCount += 1
      appendScriptOutput(`${dataset.style.label}: processed ${response.ordinateModified.length} points.`)

      appState.update((current) => {
        const datasets = current.datasets.map((item) =>
          item.id === response.spectrumId
            ? {
                ...item,
                name: response.metadata?.name ?? item.name,
                sourcePath: response.metadata?.sourcePath ?? item.sourcePath,
                spectrumType: response.metadata?.spectrumType === 'ir' || response.metadata?.spectrumType === 'raman'
                  ? response.metadata.spectrumType
                  : (response.metadata?.spectrumType === 'uv-vis' ? 'uv-vis' : item.spectrumType),
                units: {
                  ...item.units,
                  x: response.metadata?.units?.x ?? item.units.x,
                  y: response.metadata?.units?.y ?? item.units.y,
                  xQuantity: item.units.xQuantity ?? 'Abscissa',
                  yQuantity: item.units.yQuantity ?? 'Ordinate',
                },
                style: {
                  ...item.style,
                  ...(response.metadata?.style ?? {}),
                },
                data: {
                  ...item.data,
                  abscissa: response.abscissa ?? item.data.abscissa,
                  ordinateOriginal: response.ordinateOriginal ?? item.data.ordinateOriginal,
                  ordinateModified: response.ordinateModified,
                  precision: response.precision,
                },
                peaks: shouldApplyAssignedPeaks(
                  response.peaks,
                  response.metadata?.spectrumType ?? item.spectrumType,
                )
                  ? mergeAssignedPeaks(item.peaks, response.peaks ?? [])
                  : item.peaks,
              }
            : item,
        )

        const nextState = {
          ...current,
          datasets,
          updatedAt: new Date().toISOString(),
          scriptProgress: {
            ...current.scriptProgress,
            completed: appliedCount,
            message: `Processed ${dataset.style.label}`,
          },
        }
        scheduleAutosave(nextState)
        return nextState
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown script execution failure'
      datasetErrors.push(`${dataset.style.label}: ${message}`)
      appendScriptOutput(`${dataset.style.label}: ${message}`)
      logScriptDebug('execute_script_error', {
        spectrumId: dataset.id,
        label: dataset.style.label,
        message,
      })
    }
  }

  appState.update((current) => ({
    ...current,
    workerBusy: false,
    workerLastError: datasetErrors.length > 0
      ? `Script applied to ${appliedCount}/${selected.length} samples. First error: ${datasetErrors[0]}`
      : null,
    scriptProgress: {
      active: false,
      completed: appliedCount,
      total: selected.length,
      message: datasetErrors.length > 0 ? 'Execution finished with errors' : 'Execution finished',
    },
  }))
  appendScriptOutput(datasetErrors.length > 0
    ? `Execution finished with errors (${appliedCount}/${selected.length} samples applied).`
    : `Execution finished successfully (${appliedCount} sample${appliedCount === 1 ? '' : 's'} applied).`)
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
