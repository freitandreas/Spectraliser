import type { ProjectGeneralSettings } from '../services/generalSettings'

export type SpectrumType = 'uv-vis' | 'ir' | 'raman'

export type TransformScope = 'no' | 'individual' | 'global'

export type SyncMode = 'gui_synchronized' | 'desync_active'

export type NormalizationMode = 'minmax' | 'vector' | 'area' | 'peak'

export interface SpectrumUnits {
  x: string
  y: string
  xQuantity: string
  yQuantity: string
}

export interface SpectrumStyle {
  lineColor: string
  lineWidth: number
  scatterSymbol: string
  label: string
  visible?: boolean
  abscissaInverted?: boolean
  ordinateInverted?: boolean
}

export interface DataSeries {
  abscissa: number[]
  ordinateOriginal: number[]
  ordinateModified: number[]
  precision: 'float32' | 'float64'
}

/** Imported experiment fields; blank cells are retained explicitly as null. */
export type ExperimentMetadata = Record<string, string | null>

export interface Peak {
  id: string
  index: number
  x: number
  y: number
  label: string
  source: 'auto' | 'manual'
  labelEdited?: boolean
  prominence?: number
  intensity?: 'weak' | 'medium' | 'strong'
  confidence?: 'high' | 'medium' | 'low'
  alternatives?: string[]
  enabled: boolean
}

export interface PeakDetectionOptions {
  prominence: number
  minDistance: number
  minHeight: number | null
  mode: 'maxima' | 'minima'
  /** Derive prominence and min distance from the noise level and band widths on every detection. */
  auto?: boolean
}

export const DEFAULT_PEAK_DETECTION: PeakDetectionOptions = {
  prominence: 0.01,
  minDistance: 1,
  minHeight: null,
  mode: 'maxima',
  auto: true,
}

/** IR bands are always read as dips, so IR peak detection is fixed to minima. */
export function peakModeFor(spectrumType: SpectrumType, requested: PeakDetectionOptions['mode'] = 'maxima'): PeakDetectionOptions['mode'] {
  return spectrumType === 'ir' ? 'minima' : requested
}

/** Detection options with the mode the spectrum type requires; minima carry a negative prominence. */
export function peakDetectionFor(spectrumType: SpectrumType, options?: PeakDetectionOptions): PeakDetectionOptions {
  const base = options ?? DEFAULT_PEAK_DETECTION
  const mode = peakModeFor(spectrumType, base.mode)
  if (options && mode === options.mode) return options
  return { ...base, mode, prominence: mode === 'minima' ? -Math.abs(base.prominence) : Math.abs(base.prominence) }
}

export interface TransformDefinition {
  id: string
  type:
    | 'crop'
    | 'baseline'
    | 'smoothing'
    | 'inversion'
    | 'normalization'
    | 'peak_localisation'
  scope: TransformScope
  enabled: boolean
  params: Record<string, number | string | boolean>
}

export interface SpectrumDataset {
  id: string
  name: string
  sourcePath: string
  spectrumType: SpectrumType
  units: SpectrumUnits
  data: DataSeries
  pipeline: TransformDefinition[]
  style: SpectrumStyle
  peaks: Peak[]
  /** Fields such as Time or Concentration; values carry their unit (`30 s`, `0.5 mM`). */
  experimentMetadata?: ExperimentMetadata
  peakDetection?: PeakDetectionOptions
  /** Detected peaks the user deleted since the last detection run; reset by a new detection. */
  removedPeakCount?: number
}

export interface ViewState {
  zoomRangeX: [number, number] | null
  zoomRangeY: [number, number] | null
  activeTab: 'sample_view' | 'script_view' | 'peak_table' | 'fit'
  selectedSpectrumId: string | null
}

export interface AppState {
  version: string
  projectName: string
  createdAt: string
  updatedAt: string
  datasets: SpectrumDataset[]
  projectSpectrumType?: SpectrumType | null
  /** Values samples follow unless they were given their own; absent in projects saved before 1.2. */
  generalSettings?: ProjectGeneralSettings
  viewState: ViewState
  scriptSyncEnabled: boolean
  syncMode: SyncMode
  generatedScript: string
  userScriptOverride: string | null
  pythonFileOverrides?: Record<string, string>
  autosaveEnabled: boolean
}

export const APP_SCHEMA_VERSION = '1.5.0'

export const DEFAULT_STYLE: SpectrumStyle = {
  lineColor: '#4fc1ff',
  lineWidth: 2,
  scatterSymbol: 'circle',
  label: 'Spectrum',
  abscissaInverted: false,
  ordinateInverted: false,
}

export function getSpectrumStyleDefaults(
  spectrumType: SpectrumType,
  existing: Partial<SpectrumStyle> = {},
): Partial<SpectrumStyle> {
  return {
    abscissaInverted: existing.abscissaInverted ?? (spectrumType === 'ir'),
    ordinateInverted: existing.ordinateInverted ?? false,
  }
}
