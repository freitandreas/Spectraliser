import { get, writable } from 'svelte/store'
import {
  APP_SCHEMA_VERSION,
  DEFAULT_PEAK_DETECTION,
  DEFAULT_STYLE,
  getSpectrumStyleDefaults,
  type AppState,
  type SpectrumDataset,
} from '../types/project'
import { generatePythonScript } from '../services/script/scriptGenerator'
import { createWorkerClient } from '../services/worker/workerClient'
import { loadAutosave, saveAutosave } from '../services/persistence/autosave'
import { axisDefaultsFor } from '../services/spectrumPresets'
import { buildPipeline } from './pipelineBlueprint'
import { migrateProjectState } from './migrations'
import { deriveGeneralSettings } from '../services/generalSettings'
import { transitionSyncState } from '../services/script/syncStateMachine'
import { patchRuntime } from './runtimeState'
import type { ParsedSpectrum } from '../services/import/parsers'

export { buildPipeline }


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
      xQuantity: 'Wavelength',
      yQuantity: 'Absorbance',
    },
    data: {
      abscissa,
      ordinateOriginal,
      ordinateModified: [...ordinateOriginal],
      precision: 'float32',
    },
    pipeline: buildPipeline(abscissa),
    style: {
      ...DEFAULT_STYLE,
      ...getSpectrumStyleDefaults('uv-vis'),
      label: 'Sample 01 (Processed)',
    },
    peaks: [],
    experimentMetadata: {},
    peakDetection: { ...DEFAULT_PEAK_DETECTION },
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
    projectSpectrumType: 'uv-vis',
    generalSettings: deriveGeneralSettings(datasets, 'uv-vis'),
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
    pythonFileOverrides: {},
    autosaveEnabled: true,
  }
}

export function createDatasetFromParsed(input: {
  name: string
  parsed: ParsedSpectrum
  label?: string
  sourcePath?: string
  resolvedLabel?: string
}): SpectrumDataset {
  const id = crypto.randomUUID()
  const spectrumType = input.parsed.spectrumType ?? 'uv-vis'
  const defaults = axisDefaultsFor(spectrumType)
  const unitsX = input.parsed.xUnit ?? defaults.x
  const unitsY = input.parsed.yUnit ?? defaults.y

  return {
    id,
    name: input.name,
    sourcePath: input.sourcePath ?? input.name,
    spectrumType,
    units: {
      x: unitsX,
      y: unitsY,
      xQuantity: input.parsed.xQuantity ?? defaults.xQuantity,
      yQuantity: input.parsed.yQuantity ?? defaults.yQuantity,
    },
    data: {
      abscissa: input.parsed.abscissa,
      ordinateOriginal: input.parsed.ordinate,
      ordinateModified: [...input.parsed.ordinate],
      precision: 'float32',
    },
    pipeline: buildPipeline(input.parsed.abscissa),
    style: {
      ...DEFAULT_STYLE,
      ...getSpectrumStyleDefaults(spectrumType),
      lineColor: `hsl(${Math.floor(Math.random() * 360)} 80% 62%)`,
      label: input.resolvedLabel
        ?? (input.label?.trim().length
          ? input.label
          : `${input.name} (Processed)`),
    },
    peaks: [],
    experimentMetadata: {},
    peakDetection: { ...DEFAULT_PEAK_DETECTION },
  }
}

export function resolveProjectSpectrumType(
  existing: SpectrumDataset[],
  incoming: SpectrumDataset[],
): { spectrumType: SpectrumDataset['spectrumType'] | null; error: string | null } {
  const types = [...existing, ...incoming].map((dataset) => dataset.spectrumType)
  const uniqueTypes = [...new Set(types)]

  if (uniqueTypes.length > 1) {
    return {
      spectrumType: null,
      error: 'This project already contains a different spectrum type. Import datasets of one consistent type only.',
    }
  }

  return { spectrumType: uniqueTypes[0] ?? null, error: null }
}

export function resolveUniqueLabels(existing: string[], incoming: string[]): string[] {
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

export const appState = writable<AppState>(buildInitialState())

export const workerClient = createWorkerClient()
let autosaveTimer: number | null = null

workerClient.init().catch((error: unknown) => {
  patchRuntime({ workerLastError: error instanceof Error ? error.message : 'Failed to initialize Pyodide worker' })
})

void loadAutosave().then((saved) => {
  if (!saved) return
  const migrated = migrateProjectState(saved)
  appState.set(migrated.scriptSyncEnabled
    ? { ...migrated, generatedScript: generatePythonScript(migrated.datasets) }
    : migrated)
})

/** Debounced; the state is read when the timer fires, so the latest project is always the one saved. */
export function scheduleAutosave(): void {
  if (autosaveTimer !== null) window.clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null
    const state = get(appState)
    if (state.autosaveEnabled) void saveAutosave(state)
  }, 350)
}

/** Stamps a changed project and schedules its autosave. */
export function persist(state: AppState): AppState {
  scheduleAutosave()
  return { ...state, updatedAt: new Date().toISOString() }
}

/** Applies a project mutation; returning the input state unchanged skips stamping and saving. */
export function updateProject(mutate: (state: AppState) => AppState): void {
  appState.update((state) => {
    const next = mutate(state)
    return next === state ? state : persist(next)
  })
}

export function mapDataset(
  datasets: SpectrumDataset[],
  datasetId: string,
  mutate: (dataset: SpectrumDataset) => SpectrumDataset,
): SpectrumDataset[] {
  let changed = false
  const next = datasets.map((dataset) => {
    if (dataset.id !== datasetId) return dataset
    const updated = mutate(dataset)
    changed ||= updated !== dataset
    return updated
  })
  return changed ? next : datasets
}

/** Changes one sample without touching the generated script (peaks, detection settings, labels). */
export function updateDataset(datasetId: string, mutate: (dataset: SpectrumDataset) => SpectrumDataset): void {
  updateProject((state) => {
    const datasets = mapDataset(state.datasets, datasetId, mutate)
    return datasets === state.datasets ? state : { ...state, datasets }
  })
}

export function regenerateScript(datasets: SpectrumDataset[]): string {
  return generatePythonScript(datasets)
}

/** Replaces the datasets and regenerates the script while it is synchronised with the GUI. */
export function commitDatasets(state: AppState, datasets: SpectrumDataset[]): AppState {
  return persist({
    ...state,
    datasets,
    generatedScript: state.scriptSyncEnabled ? regenerateScript(datasets) : state.generatedScript,
  })
}

/** A GUI edit that may desynchronise a manually edited script (see the sync state machine). */
export function commitGuiEdit(state: AppState, datasets: SpectrumDataset[]): AppState {
  const sync = transitionSyncState({ mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled }, { type: 'GUI_EDIT' })
  return commitDatasets({ ...state, syncMode: sync.mode, scriptSyncEnabled: sync.scriptSyncEnabled }, datasets)
}
