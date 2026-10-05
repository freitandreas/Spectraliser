import { DEFAULT_PEAK_COLUMNS, type PeakColumn } from './reportContent'

export type ExportFormat =
  | 'python'
  | 'plot-image'
  | 'excel-table'
  | 'latex-table'
  | 'pdf-report'
  | 'latex-report'
  | 'html'
  | 'csv'
  | 'json'

export type ExportPreset = 'slide' | 'paper-column' | 'paper-page' | 'custom'
export type ExportBackground = 'white' | 'transparent' | 'dark'

export interface ExportSettings {
  format: ExportFormat
  preset: ExportPreset
  widthCm: number
  heightCm: number
  dpi: number
  fontFamily: string
  fontSizePt: number
  background: ExportBackground
  /** Draws the detected peaks of every exported series. */
  showPeaks: boolean
  /** Columns of the peak tables in reports and table exports. */
  peakColumns: PeakColumn[]
}

export const EXPORT_PRESETS: Record<Exclude<ExportPreset, 'custom'>, { label: string; widthCm: number; heightCm: number }> = {
  slide: { label: 'Presentation slide (16:9)', widthCm: 25.4, heightCm: 14.29 },
  'paper-column': { label: 'Paper column (single)', widthCm: 8.5, heightCm: 5.7 },
  'paper-page': { label: 'Paper page (full width)', widthCm: 17.8, heightCm: 11.9 },
}

export const EXPORT_SIZE_LIMITS_CM = { min: 2, max: 80 } as const

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'plot-image',
  preset: 'slide',
  widthCm: EXPORT_PRESETS.slide.widthCm,
  heightCm: EXPORT_PRESETS.slide.heightCm,
  dpi: 300,
  fontFamily: 'Arial',
  fontSizePt: 12,
  background: 'white',
  showPeaks: false,
  peakColumns: [...DEFAULT_PEAK_COLUMNS],
}

/** CSS reference resolution; fonts in pt map to layout pixels at this density. */
export const CSS_DPI = 96
const CM_PER_INCH = 2.54

/** Figure size in layout (CSS) pixels: the physical size at 96 dpi, so font sizes match the document. */
export function exportLayoutSize(settings: Pick<ExportSettings, 'widthCm' | 'heightCm'>): { width: number; height: number } {
  return {
    width: Math.round(settings.widthCm / CM_PER_INCH * CSS_DPI),
    height: Math.round(settings.heightCm / CM_PER_INCH * CSS_DPI),
  }
}

/** Pixel size of the exported raster image at the chosen resolution. */
export function exportPixelSize(settings: ExportSettings): { width: number; height: number } {
  return {
    width: Math.round(settings.widthCm / CM_PER_INCH * settings.dpi),
    height: Math.round(settings.heightCm / CM_PER_INCH * settings.dpi),
  }
}

export function exportImageScale(settings: ExportSettings): number {
  const layout = exportLayoutSize(settings)
  return exportPixelSize(settings).width / layout.width
}

export function formatCm(value: number): string {
  return String(Number(value.toFixed(2)))
}
