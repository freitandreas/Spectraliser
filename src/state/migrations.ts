import { APP_SCHEMA_VERSION, type AppState, type PeakDetectionOptions, type SpectrumDataset } from '../types/project'
import { buildPipeline } from './pipelineBlueprint'

const DEFAULT_PEAK_DETECTION: PeakDetectionOptions = {
  prominence: 0.01,
  minDistance: 1,
  minHeight: null,
  mode: 'maxima',
}

function migrateDataset(dataset: SpectrumDataset): SpectrumDataset {
  return {
    ...dataset,
    peaks: dataset.peaks ?? [],
    // Steps outside the current blueprint (e.g. the removed derivative) are dropped here.
    pipeline: buildPipeline(dataset.data.abscissa, dataset.pipeline ?? []),
    peakDetection: dataset.peakDetection ?? { ...DEFAULT_PEAK_DETECTION },
    units: {
      ...dataset.units,
      xQuantity: dataset.units.xQuantity ?? 'Abscissa',
      yQuantity: dataset.units.yQuantity ?? 'Ordinate',
    },
  }
}

/** Brings a persisted project up to the current schema; unknown versions are normalised too. */
export function migrateProjectState(saved: AppState): AppState {
  const datasets = saved.datasets.map(migrateDataset)
  const storedTypes = [...new Set(datasets.map((dataset) => dataset.spectrumType))]

  return {
    ...saved,
    version: APP_SCHEMA_VERSION,
    datasets,
    projectSpectrumType: storedTypes.length === 1 ? storedTypes[0] : null,
    pythonFileOverrides: saved.pythonFileOverrides
      ?? (saved.userScriptOverride ? { 'main.py': saved.userScriptOverride } : {}),
    scriptOutput: saved.scriptOutput ?? [],
    scriptProgress: { active: false, completed: 0, total: 0, message: '' },
    workerBusy: false,
    workerLastError: null,
  }
}
