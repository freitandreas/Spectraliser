import { APP_SCHEMA_VERSION, DEFAULT_PEAK_DETECTION, peakDetectionFor, type AppState, type Peak, type SpectrumDataset } from '../types/project'
import { buildPipeline } from './pipelineBlueprint'
import { isSeriesTimeUnit } from '../services/seriesCoordinates'
import { metadataKind } from '../services/metadataFields'
import { migrateLegacyMainScript } from '../services/script/scriptGenerator'
import { normalizeGeneralSettings } from '../services/generalSettings'

type LegacyPeak = Peak & { dataOrigin?: 'processed' | 'original' }
type LegacyDataset = SpectrumDataset & { seriesCoordinate?: { value: number; unit: string } | null }

/** Peaks found only on the unprocessed curve (pre-1.4) are dropped; peaks are auto or manual. */
function migratePeaks(peaks: LegacyPeak[] = []): Peak[] {
  return peaks
    .filter((peak) => peak.dataOrigin !== 'original')
    .map(({ dataOrigin: _dataOrigin, ...peak }) => peak)
}

/** Manual series times (pre-1.5) move into a Time metadata field unless one is already linked. */
function migrateMetadata(value: unknown, legacy: LegacyDataset['seriesCoordinate']): NonNullable<SpectrumDataset['experimentMetadata']> {
  const metadata = normalizeExperimentMetadata(value)
  if (!legacy || !Number.isFinite(legacy.value) || !isSeriesTimeUnit(legacy.unit)) return metadata
  if (Object.keys(metadata).some((key) => metadataKind(key) === 'time')) return metadata
  return { Time: `${legacy.value} ${legacy.unit}`, ...metadata }
}

function migrateDataset({ seriesCoordinate, ...dataset }: LegacyDataset): SpectrumDataset {
  return {
    ...dataset,
    peaks: migratePeaks(dataset.peaks),
    experimentMetadata: migrateMetadata(dataset.experimentMetadata, seriesCoordinate),
    // Steps outside the current blueprint (e.g. the removed derivative) are dropped here.
    pipeline: buildPipeline(dataset.data.abscissa, dataset.pipeline ?? []),
    peakDetection: peakDetectionFor(dataset.spectrumType, dataset.peakDetection ?? { ...DEFAULT_PEAK_DETECTION }),
    units: {
      ...dataset.units,
      xQuantity: dataset.units.xQuantity ?? 'Abscissa',
      yQuantity: dataset.units.yQuantity ?? 'Ordinate',
    },
  }
}

function normalizeExperimentMetadata(value: unknown): NonNullable<SpectrumDataset['experimentMetadata']> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | null] =>
      entry[0].trim().length > 0 && (typeof entry[1] === 'string' || entry[1] === null)),
  )
}

function migrateOverrides(overrides: Record<string, string>): Record<string, string> {
  const main = overrides['main.py']
  return main === undefined ? overrides : { ...overrides, 'main.py': migrateLegacyMainScript(main) }
}

/** Brings a persisted project up to the current schema; unknown versions are normalised too. */
export function migrateProjectState(stored: AppState): AppState {
  // Saves before 1.3.0 also stored worker/script runtime status; it is session-only now.
  const { workerBusy: _busy, workerLastError: _error, scriptOutput: _output, scriptProgress: _progress, ...saved } =
    stored as AppState & Partial<Record<'workerBusy' | 'workerLastError' | 'scriptOutput' | 'scriptProgress', unknown>>
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
  }
}
