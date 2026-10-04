import { APP_SCHEMA_VERSION, type AppState, type PeakDetectionOptions, type SpectrumDataset } from '../types/project'
import { buildPipeline } from './pipelineBlueprint'
import { isSeriesTimeUnit } from '../services/seriesCoordinates'
import { migrateLegacyMainScript } from '../services/script/scriptGenerator'
import { normalizeGeneralSettings } from '../services/generalSettings'

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
    seriesCoordinate: dataset.seriesCoordinate
      && Number.isFinite(dataset.seriesCoordinate.value)
      && isSeriesTimeUnit(dataset.seriesCoordinate.unit)
      ? dataset.seriesCoordinate
      : null,
    units: {
      ...dataset.units,
      xQuantity: dataset.units.xQuantity ?? 'Abscissa',
      yQuantity: dataset.units.yQuantity ?? 'Ordinate',
    },
  }
}

function migrateOverrides(overrides: Record<string, string>): Record<string, string> {
  const main = overrides['main.py']
  return main === undefined ? overrides : { ...overrides, 'main.py': migrateLegacyMainScript(main) }
}

/** Brings a persisted project up to the current schema; unknown versions are normalised too. */
export function migrateProjectState(saved: AppState): AppState {
  const datasets = saved.datasets.map(migrateDataset)
  const storedTypes = [...new Set(datasets.map((dataset) => dataset.spectrumType))]
  const projectSpectrumType = storedTypes.length === 1 ? storedTypes[0] : null

  return {
    ...saved,
    version: APP_SCHEMA_VERSION,
    datasets,
    projectSpectrumType,
    generalSettings: normalizeGeneralSettings(saved.generalSettings, datasets, projectSpectrumType),
    generatedScript: migrateLegacyMainScript(saved.generatedScript ?? ''),
    userScriptOverride: saved.userScriptOverride ? migrateLegacyMainScript(saved.userScriptOverride) : saved.userScriptOverride ?? null,
    pythonFileOverrides: migrateOverrides(saved.pythonFileOverrides
      ?? (saved.userScriptOverride ? { 'main.py': saved.userScriptOverride } : {})),
    scriptOutput: saved.scriptOutput ?? [],
    scriptProgress: { active: false, completed: 0, total: 0, message: '' },
    workerBusy: false,
    workerLastError: null,
  }
}
