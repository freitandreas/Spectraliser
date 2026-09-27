import { get, writable } from 'svelte/store'
import {
  APP_SCHEMA_VERSION,
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
    peakDetection: { prominence: 0.01, minDistance: 1, minHeight: null, mode: 'maxima' },
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
    workerBusy: false,
    workerLastError: null,
    scriptOutput: [],
    scriptProgress: { active: false, completed: 0, total: 0, message: '' },
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
      xQuantity: defaults.xQuantity,
      yQuantity: defaults.yQuantity,
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
    peakDetection: { prominence: 0.01, minDistance: 1, minHeight: null, mode: 'maxima' },
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
let lastGeneratedScriptSignature = ''

export function logScriptDebug(event: string, details: Record<string, unknown>): void {
  console.debug(`[script-debug] ${event}`, details)
}

export function appendScriptOutput(message: string): void {
  appState.update((state) => ({
    ...state,
    scriptOutput: [...state.scriptOutput, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-300),
  }))
}

workerClient.init().catch((error: unknown) => {
  appState.update((state) => ({
    ...state,
    workerLastError: error instanceof Error ? error.message : 'Failed to initialize Pyodide worker',
  }))
})

void loadAutosave().then((saved) => {
  if (!saved) {
    return
  }

  const migrated = migrateProjectState(saved)
  const nextState = migrated.scriptSyncEnabled
    ? { ...migrated, generatedScript: generatePythonScript(migrated.datasets) }
    : migrated

  appState.set(nextState)
  logScriptDebug('autosave_loaded', {
    datasetCount: nextState.datasets.length,
    syncMode: nextState.syncMode,
    scriptSyncEnabled: nextState.scriptSyncEnabled,
    userOverrideActive: nextState.userScriptOverride !== null,
    regeneratedApplied: nextState.scriptSyncEnabled,
  })
})

export function scheduleAutosave(nextState: AppState): void {
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

export function regenerateScript(datasets: SpectrumDataset[]): string {
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
      includesSamplesArray: script.includes('SAMPLES = json.loads('),
    })
  }

  return script
}

export function commitDatasets(
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
