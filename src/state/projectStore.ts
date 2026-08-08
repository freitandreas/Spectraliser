import { derived, get, writable } from 'svelte/store'
import {
  APP_SCHEMA_VERSION,
  DEFAULT_STYLE,
  type AppState,
  type SpectrumDataset,
  type TransformDefinition,
} from '../types/project'
import { generatePythonScript } from '../services/script/scriptGenerator'
import { transitionSyncState } from '../services/script/syncStateMachine'
import { createWorkerClient } from '../services/worker/workerClient'
import { loadAutosave, saveAutosave } from '../services/persistence/autosave'
import type { ParsedSpectrum } from '../services/import/parsers'

const defaultPipeline: TransformDefinition[] = [
  {
    id: 'smooth-1',
    type: 'smoothing',
    scope: 'individual',
    enabled: true,
    params: { window_length: 15, polyorder: 2 },
  },
  {
    id: 'normalize-1',
    type: 'normalization',
    scope: 'individual',
    enabled: true,
    params: { mode: 'minmax' },
  },
]

function buildInitialDataset(): SpectrumDataset {
  const abscissa = Array.from({ length: 300 }, (_, index) => 200 + index)
  const ordinateOriginal = abscissa.map((x) => {
    const center = 280
    const sigma = 25
    return Math.exp(-((x - center) ** 2) / (2 * sigma ** 2)) + 0.05 * Math.sin(x / 20)
  })

  return {
    id: 'sample-01',
    name: 'Sample_01.csv',
    sourcePath: 'Sample_01.csv',
    spectrumType: 'uv-vis',
    units: {
      x: 'nm',
      y: 'Absorbance',
    },
    data: {
      abscissa,
      ordinateOriginal,
      ordinateModified: [...ordinateOriginal],
      precision: 'float32',
    },
    pipeline: defaultPipeline,
    style: {
      ...DEFAULT_STYLE,
      label: 'Sample 01 (Processed)',
    },
  }
}

function buildInitialState(): AppState {
  const datasets = [buildInitialDataset()]
  return {
    version: APP_SCHEMA_VERSION,
    projectName: 'Spectraliser Session',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    datasets,
    viewState: {
      zoomRangeX: [200, 500],
      zoomRangeY: [0, 1.2],
      activeTab: 'sample_view',
      selectedSpectrumId: datasets[0].id,
    },
    scriptSyncEnabled: true,
    syncMode: 'gui_synchronized',
    generatedScript: generatePythonScript(datasets),
    userScriptOverride: null,
    workerBusy: false,
    workerLastError: null,
    autosaveEnabled: true,
  }
}

function createDatasetFromParsed(input: {
  name: string
  parsed: ParsedSpectrum
  label?: string
  sourcePath?: string
  resolvedLabel?: string
}): SpectrumDataset {
  const id = crypto.randomUUID()

  return {
    id,
    name: input.name,
    sourcePath: input.sourcePath ?? input.name,
    spectrumType: 'uv-vis',
    units: {
      x: 'nm',
      y: 'Absorbance',
    },
    data: {
      abscissa: input.parsed.abscissa,
      ordinateOriginal: input.parsed.ordinate,
      ordinateModified: [...input.parsed.ordinate],
      precision: 'float32',
    },
    pipeline: structuredClone(defaultPipeline),
    style: {
      ...DEFAULT_STYLE,
      lineColor: `hsl(${Math.floor(Math.random() * 360)} 80% 62%)`,
      label: input.resolvedLabel
        ?? (input.label?.trim().length
          ? input.label
          : `${input.name} (Processed)`),
    },
  }
}

function resolveUniqueLabels(existing: string[], incoming: string[]): string[] {
  const used = new Set(existing)
  return incoming.map((raw) => {
    const base = raw.trim().length > 0 ? raw.trim() : 'Series'
    let candidate = base
    let index = 2
    while (used.has(candidate)) {
      candidate = `${base} (${index})`
      index += 1
    }
    used.add(candidate)
    return candidate
  })
}

const appState = writable<AppState>(buildInitialState())

const workerClient = createWorkerClient()
let autosaveTimer: number | null = null
let lastGeneratedScriptSignature = ''

function logScriptDebug(event: string, details: Record<string, unknown>): void {
  console.debug(`[script-debug] ${event}`, details)
}

workerClient.init().catch((error: unknown) => {
  appState.update((state) => ({
    ...state,
    workerLastError: error instanceof Error ? error.message : 'Failed to initialize Pyodide worker',
  }))
})

void loadAutosave().then((saved) => {
  if (saved) {
    const regenerated = generatePythonScript(saved.datasets)
    const nextState = saved.scriptSyncEnabled
      ? {
          ...saved,
          generatedScript: regenerated,
        }
      : saved

    appState.set(nextState)
    logScriptDebug('autosave_loaded', {
      datasetCount: nextState.datasets.length,
      syncMode: nextState.syncMode,
      scriptSyncEnabled: nextState.scriptSyncEnabled,
      userOverrideActive: nextState.userScriptOverride !== null,
      regeneratedApplied: nextState.scriptSyncEnabled,
    })
  }
})

function scheduleAutosave(nextState: AppState): void {
  if (!nextState.autosaveEnabled) {
    return
  }

  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer)
  }

  autosaveTimer = window.setTimeout(() => {
    void saveAutosave(nextState)
  }, 350)
}

function regenerateScript(datasets: SpectrumDataset[]): string {
  const script = generatePythonScript(datasets)
  const signature = [
    datasets.length,
    datasets[0]?.style.label ?? '',
    script.length,
    script.slice(0, 200),
  ].join('|')

  if (signature !== lastGeneratedScriptSignature) {
    lastGeneratedScriptSignature = signature
    logScriptDebug('generated_script', {
      datasetCount: datasets.length,
      firstDataset: datasets[0]?.style.label ?? null,
      lineUsesMetaStyle: script.includes("(meta or {}).get('style', {}).get('lineColor'"),
      nameUsesMetaStyle: script.includes("(meta or {}).get('style', {}).get('label'"),
      includesSamplesArray: script.includes('SAMPLES = json.loads('),
      includesSampleLoop: script.includes('for sample_meta in samples:'),
    })
  }

  return script
}

function commitDatasets(
  state: AppState,
  datasets: SpectrumDataset[],
): AppState {
  if (!state.scriptSyncEnabled) {
    logScriptDebug('skip_regenerate_sync_disabled', {
      datasetCount: datasets.length,
      syncMode: state.syncMode,
      userOverrideActive: state.userScriptOverride !== null,
    })
  }

  const nextState = {
    ...state,
    datasets,
    generatedScript: state.scriptSyncEnabled ? regenerateScript(datasets) : state.generatedScript,
    updatedAt: new Date().toISOString(),
  }

  scheduleAutosave(nextState)
  return nextState
}

function toPositiveOdd(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 3) {
    return fallback
  }

  const rounded = Math.round(value)
  return rounded % 2 === 0 ? rounded + 1 : rounded
}

function buildPipelineCode(dataset: SpectrumDataset): string {
  const steps: string[] = ["df['ordinate_modified'] = df['ordinate_original']"]

  for (const item of dataset.pipeline.filter((entry) => entry.enabled)) {
    if (item.type === 'crop') {
      const xMin = Number(item.params.x_min ?? Math.min(...dataset.data.abscissa))
      const xMax = Number(item.params.x_max ?? Math.max(...dataset.data.abscissa))
      steps.push(`mask = (df['abscissa'] >= ${xMin}) & (df['abscissa'] <= ${xMax})`)
      steps.push("df = df.loc[mask].reset_index(drop=True)")
      continue
    }

    if (item.type === 'baseline') {
      const order = Math.max(1, Number(item.params.order ?? 3))
      steps.push(
        `coeff = np.polyfit(df['abscissa'], df['ordinate_modified'], deg=${order})`,
      )
      steps.push("baseline = np.polyval(coeff, df['abscissa'])")
      steps.push("df['ordinate_modified'] = df['ordinate_modified'] - baseline")
      continue
    }

    if (item.type === 'smoothing') {
      const windowLength = toPositiveOdd(Number(item.params.window_length ?? 15), 15)
      const polyOrder = Math.max(1, Number(item.params.polyorder ?? 2))
      steps.push(
        `df['ordinate_modified'] = signal.savgol_filter(df['ordinate_modified'], window_length=${windowLength}, polyorder=${polyOrder})`,
      )
      continue
    }

    if (item.type === 'inversion') {
      steps.push("df['ordinate_modified'] = -1.0 * df['ordinate_modified']")
      continue
    }

    if (item.type === 'normalization') {
      const mode = String(item.params.mode ?? 'minmax').toLowerCase()
      if (mode === 'vector') {
        steps.push("norm = np.linalg.norm(df['ordinate_modified'])")
        steps.push("if norm != 0:\n    df['ordinate_modified'] = df['ordinate_modified'] / norm")
        continue
      }

      if (mode === 'area') {
        steps.push("area = np.trapezoid(np.abs(df['ordinate_modified']), df['abscissa'])")
        steps.push("if area != 0:\n    df['ordinate_modified'] = df['ordinate_modified'] / area")
        continue
      }

      if (mode === 'peak') {
        steps.push("peak = np.max(np.abs(df['ordinate_modified']))")
        steps.push("if peak != 0:\n    df['ordinate_modified'] = df['ordinate_modified'] / peak")
        continue
      }

      steps.push("y_min = df['ordinate_modified'].min()")
      steps.push("y_max = df['ordinate_modified'].max()")
      steps.push(
        "if y_max != y_min:\n    df['ordinate_modified'] = (df['ordinate_modified'] - y_min) / (y_max - y_min)",
      )
      continue
    }

    if (item.type === 'derivative') {
      const order = Math.max(1, Number(item.params.order ?? 1))
      steps.push(`for _ in range(${order}):\n    df['ordinate_modified'] = np.gradient(df['ordinate_modified'])`)
    }
  }

  return steps.join('\n')
}

async function rerunPipeline(datasetId: string): Promise<void> {
  const state = get(appState)
  const dataset = state.datasets.find((item) => item.id === datasetId)
  if (!dataset) {
    return
  }

  appState.update((current) => ({
    ...current,
    workerBusy: true,
    workerLastError: null,
  }))

  const pipelineCode = buildPipelineCode(dataset)

  try {
    const response = await workerClient.executePipeline({
      spectrumId: dataset.id,
      abscissa: dataset.data.abscissa,
      ordinate: dataset.data.ordinateOriginal,
      pipelineCode,
      preferFloat32: true,
    })

    if (response.type !== 'result') {
      appState.update((current) => ({
        ...current,
        workerBusy: false,
      }))
      return
    }

    appState.update((current) => {
      const datasets = current.datasets.map((item) =>
        item.id === response.spectrumId
          ? {
              ...item,
              data: {
                ...item.data,
                ordinateModified: response.ordinateModified,
                precision: response.precision,
              },
            }
          : item,
      )

      const nextState = {
        ...current,
        datasets,
        workerBusy: false,
        updatedAt: new Date().toISOString(),
      }
      scheduleAutosave(nextState)
      return nextState
    })
  } catch (error) {
    appState.update((current) => ({
      ...current,
      workerBusy: false,
      workerLastError: error instanceof Error ? error.message : 'Worker execution failed',
    }))
  }
}

async function executeScriptForDatasets(scriptCode: string, datasetIds?: string[]): Promise<void> {
  const state = get(appState)
  const selected = datasetIds && datasetIds.length > 0
    ? state.datasets.filter((item) => datasetIds.includes(item.id))
    : state.datasets

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

  appState.update((current) => ({
    ...current,
    workerBusy: true,
    workerLastError: null,
  }))

  let appliedCount = 0
  const datasetErrors: string[] = []

  for (const dataset of selected) {
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
        },
        scriptCode,
        preferFloat32: true,
      })

      if (response.type !== 'result') {
        logScriptDebug('execute_script_non_result', {
          spectrumId: dataset.id,
          responseType: response.type,
        })
        datasetErrors.push(`${dataset.style.label}: ${response.type}`)
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
                  x: response.metadata?.units?.x ?? item.units.x,
                  y: response.metadata?.units?.y ?? item.units.y,
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
              }
            : item,
        )

        const nextState = {
          ...current,
          datasets,
          updatedAt: new Date().toISOString(),
        }
        scheduleAutosave(nextState)
        return nextState
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown script execution failure'
      datasetErrors.push(`${dataset.style.label}: ${message}`)
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
  }))
}

function updateDatasetMetadata(
  datasetId: string,
  partial: {
    name?: string
    sourcePath?: string
    spectrumType?: SpectrumDataset['spectrumType']
    units?: Partial<SpectrumDataset['units']>
  },
): void {
  appState.update((state) => {
    logScriptDebug('metadata_update', {
      datasetId,
      partial,
      syncMode: state.syncMode,
      scriptSyncEnabled: state.scriptSyncEnabled,
    })

    const datasets = state.datasets.map((dataset) => {
      if (dataset.id !== datasetId) {
        return dataset
      }

      return {
        ...dataset,
        name: partial.name ?? dataset.name,
        sourcePath: partial.sourcePath ?? dataset.sourcePath,
        spectrumType: partial.spectrumType ?? dataset.spectrumType,
        units: {
          ...dataset.units,
          ...(partial.units ?? {}),
        },
      }
    })

    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'GUI_EDIT' },
    )

    const generatedScript = syncResult.scriptSyncEnabled
      ? regenerateScript(datasets)
      : state.generatedScript

    const nextState = {
      ...state,
      datasets,
      generatedScript,
      updatedAt: new Date().toISOString(),
      syncMode: syncResult.mode,
      scriptSyncEnabled: syncResult.scriptSyncEnabled,
    }

    scheduleAutosave(nextState)
    return nextState
  })
}

function updateStyle(datasetId: string, partial: Partial<SpectrumDataset['style']>): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => {
      if (dataset.id !== datasetId) {
        return dataset
      }

      return {
        ...dataset,
        style: {
          ...dataset.style,
          ...partial,
        },
      }
    })

    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'GUI_EDIT' },
    )

    const generatedScript = syncResult.scriptSyncEnabled
      ? regenerateScript(datasets)
      : state.generatedScript

    const nextState = {
      ...state,
      datasets,
      generatedScript,
      updatedAt: new Date().toISOString(),
      syncMode: syncResult.mode,
      scriptSyncEnabled: syncResult.scriptSyncEnabled,
    }

    scheduleAutosave(nextState)
    return nextState
  })
}

function updateTransform(
  datasetId: string,
  transformId: string,
  partial: Partial<TransformDefinition>,
): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => {
      if (dataset.id !== datasetId) {
        return dataset
      }

      const pipeline = dataset.pipeline.map((step) => {
        if (step.id !== transformId) {
          return step
        }

        return {
          ...step,
          ...partial,
          params: {
            ...step.params,
            ...(partial.params ?? {}),
          },
        }
      })

      return {
        ...dataset,
        pipeline,
      }
    })

    return commitDatasets(state, datasets)
  })

  void rerunPipeline(datasetId)
}

function updateTransformGlobal(
  transformId: string,
  partial: Partial<TransformDefinition>,
): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => {
      const pipeline = dataset.pipeline.map((step) => {
        if (step.id !== transformId) {
          return step
        }

        return {
          ...step,
          ...partial,
          params: {
            ...step.params,
            ...(partial.params ?? {}),
          },
        }
      })

      return {
        ...dataset,
        pipeline,
      }
    })

    return commitDatasets(state, datasets)
  })

  const selectedDatasetId = get(appState).viewState.selectedSpectrumId
  if (selectedDatasetId) {
    void rerunPipeline(selectedDatasetId)
  }
}

function setScriptOverride(value: string): void {
  appState.update((state) => {
    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'SCRIPT_MANUAL_EDIT' },
    )

    const nextState = {
      ...state,
      userScriptOverride: value,
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

function revertScriptToGuiState(): void {
  appState.update((state) => {
    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'REVERT_TO_GUI' },
    )

    const nextState = {
      ...state,
      generatedScript: regenerateScript(state.datasets),
      userScriptOverride: null,
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

function confirmOverwriteForGuiEdits(): void {
  appState.update((state) => {
    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'CONFIRM_OVERWRITE' },
    )

    const nextState = {
      ...state,
      userScriptOverride: null,
      generatedScript: regenerateScript(state.datasets),
      syncMode: syncResult.mode,
      scriptSyncEnabled: syncResult.scriptSyncEnabled,
      updatedAt: new Date().toISOString(),
    }

    scheduleAutosave(nextState)
    return nextState
  })
}

function importDataset(input: { name: string; parsed: ParsedSpectrum; sourcePath?: string }): void {
  importDatasets([
    {
      name: input.name,
      parsed: input.parsed,
    },
  ])
}

function importDatasets(inputs: Array<{ name: string; parsed: ParsedSpectrum; label?: string; sourcePath?: string }>): void {
  if (inputs.length === 0) {
    return
  }

  appState.update((state) => {
    const existingLabels = state.datasets.map((dataset) => dataset.style.label)
    const requestedLabels = inputs.map((input) => {
      if (input.label?.trim().length) {
        return input.label
      }
      return `${input.name} (Processed)`
    })
    const resolvedLabels = resolveUniqueLabels(existingLabels, requestedLabels)

    const imported = inputs.map((input, index) =>
      createDatasetFromParsed({
        ...input,
        resolvedLabel: resolvedLabels[index],
      }),
    )
    const datasets = [...state.datasets, ...imported]
    const selected = imported[imported.length - 1]?.id ?? state.viewState.selectedSpectrumId
    const nextState = commitDatasets(state, datasets)
    return {
      ...nextState,
      viewState: {
        ...nextState.viewState,
        selectedSpectrumId: selected,
        activeTab: selected ? 'sample_view' : nextState.viewState.activeTab,
      },
    }
  })
}

function selectDataset(datasetId: string): void {
  appState.update((state) => ({
    ...state,
    viewState: {
      ...state.viewState,
      activeTab: 'sample_view',
      selectedSpectrumId: datasetId,
    },
  }))
}

function setActiveTab(activeTab: AppState['viewState']['activeTab']): void {
  appState.update((state) => ({
    ...state,
    viewState: {
      ...state.viewState,
      activeTab,
    },
  }))
}

function removeDataset(datasetId: string): void {
  appState.update((state) => {
    const datasets = state.datasets.filter((dataset) => dataset.id !== datasetId)
    const nextSelected = state.viewState.selectedSpectrumId === datasetId
      ? datasets[0]?.id ?? null
      : state.viewState.selectedSpectrumId
    const nextActiveTab = state.viewState.selectedSpectrumId === datasetId
      ? (nextSelected ? 'sample_view' : 'script_view')
      : state.viewState.activeTab

    const nextState = commitDatasets(state, datasets)
    return {
      ...nextState,
      viewState: {
        ...nextState.viewState,
        selectedSpectrumId: nextSelected,
        activeTab: nextActiveTab,
      },
    }
  })
}

function snapshot(): AppState {
  return get(appState)
}

export const projectStore = {
  subscribe: appState.subscribe,
  rerunPipeline,
  executeScriptForDatasets,
  updateDatasetMetadata,
  updateStyle,
  updateTransform,
  updateTransformGlobal,
  setScriptOverride,
  revertScriptToGuiState,
  confirmOverwriteForGuiEdits,
  importDataset,
  importDatasets,
  selectDataset,
  setActiveTab,
  removeDataset,
  snapshot,
}

export const activeDataset = derived(appState, (state) => {
  return state.datasets.find((dataset) => dataset.id === state.viewState.selectedSpectrumId) ?? null
})
