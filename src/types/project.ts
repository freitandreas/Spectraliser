export type SpectrumType = 'uv-vis' | 'ir' | 'raman'

export type TransformScope = 'no' | 'individual' | 'global'

export type SyncMode = 'gui_synchronized' | 'desync_active'

export type NormalizationMode = 'minmax' | 'vector' | 'area' | 'peak'

export interface SpectrumUnits {
  x: string
  y: string
}

export interface SpectrumStyle {
  lineColor: string
  lineWidth: number
  scatterSymbol: string
  label: string
  visible?: boolean
}

export interface DataSeries {
  abscissa: number[]
  ordinateOriginal: number[]
  ordinateModified: number[]
  precision: 'float32' | 'float64'
}

export interface TransformDefinition {
  id: string
  type:
    | 'crop'
    | 'baseline'
    | 'smoothing'
    | 'inversion'
    | 'normalization'
    | 'derivative'
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
  viewState: ViewState
  scriptSyncEnabled: boolean
  syncMode: SyncMode
  generatedScript: string
  userScriptOverride: string | null
  workerBusy: boolean
  workerLastError: string | null
  autosaveEnabled: boolean
}

export const APP_SCHEMA_VERSION = '1.0.0'

export const DEFAULT_STYLE: SpectrumStyle = {
  lineColor: '#4fc1ff',
  lineWidth: 2,
  scatterSymbol: 'circle',
  label: 'Spectrum',
}
