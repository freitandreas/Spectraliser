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
  dataOrigin: 'processed' | 'original'
}

export interface PeakDetectionOptions {
  prominence: number
  minDistance: number
  minHeight: number | null
  mode: 'maxima' | 'minima'
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
  peakDetection?: PeakDetectionOptions
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
  viewState: ViewState
  scriptSyncEnabled: boolean
  syncMode: SyncMode
  generatedScript: string
  userScriptOverride: string | null
  pythonFileOverrides?: Record<string, string>
  workerBusy: boolean
  workerLastError: string | null
  scriptOutput: string[]
  scriptProgress: {
    active: boolean
    completed: number
    total: number
    message: string
  }
  autosaveEnabled: boolean
}

export const APP_SCHEMA_VERSION = '1.1.0'

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
