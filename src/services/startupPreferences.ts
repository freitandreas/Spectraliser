import type { SpectrumType } from '../types/project'
import type { QuantityNotation } from './quantityNotation'
import {
  ABSCISSA_QUANTITIES,
  ABSCISSA_UNITS,
  ORDINATE_QUANTITIES,
  ORDINATE_UNITS,
  axisDefaultsFor,
  BLANK_UNIT,
  type AxisLabelFormat,
} from './spectrumPresets'
import { SERIES_TIME_UNITS, type SeriesTimeUnit } from './seriesCoordinates'

export type { AxisLabelFormat } from './spectrumPresets'
export type PlotStyleTemplate = 'grid' | 'minimal' | 'framed'
export type PlotSeriesMode = 'lines' | 'lines+markers' | 'markers'
export type PlotMode = 'overlay' | 'heatmap' | 'surface3d'
/** Numeric precision of arrays handed to the Python worker. */
export type ComputePrecision = 'float32' | 'float64'

export interface SeriesInterpolationPreferences {
  enabled: boolean
  /** Generated intermediate spectra inserted between each pair of neighbouring measured series. */
  steps: number
}

export interface PlotStylePreferences {
  template: PlotStyleTemplate
  showGrid: boolean
  showBorder: boolean
  lineWidth: number
  seriesMode: PlotSeriesMode
  plotMode: PlotMode
  axisLabelFormat: AxisLabelFormat
  /** Show quantities by IUPAC symbol (λ, A) or by full name in plots and tables. */
  quantityNotation: QuantityNotation
  seriesUnit: SeriesTimeUnit
  seriesInterpolation: SeriesInterpolationPreferences
}

export interface StartupAxisPreferences {
  xQuantity: string
  xUnit: string
  yQuantity: string
  yUnit: string
}

export interface StartupPreferences {
  spectrumType: SpectrumType
  axes: StartupAxisPreferences
  plotStyle: PlotStylePreferences
  computePrecision: ComputePrecision
}

export const MAX_INTERPOLATION_STEPS = 20

export const DEFAULT_STARTUP_PREFERENCES: StartupPreferences = {
  spectrumType: 'uv-vis',
  axes: axisDefaultsForPreference('uv-vis'),
  plotStyle: {
    ...preferencesForTemplate('grid'),
  },
  computePrecision: 'float32',
}

const STORAGE_KEY = 'spectraliser.startup-preferences.v1'
export const UNITS_BY_QUANTITY: Record<string, string[]> = {
  Wavelength: ['nm', 'µm', 'm'],
  Wavenumber: ['cm⁻¹'],
  'Raman shift': ['cm⁻¹'],
  Frequency: ['Hz'],
  Energy: ['eV'],
  Time: ['s'],
}

export function preferencesForTemplate(template: PlotStyleTemplate): PlotStylePreferences {
  return {
    template,
    showGrid: template !== 'minimal',
    showBorder: template === 'framed',
    lineWidth: template === 'framed' ? 2.5 : 2,
    seriesMode: 'lines',
    plotMode: 'overlay',
    axisLabelFormat: 'slash',
    quantityNotation: 'name',
    seriesUnit: 's',
    seriesInterpolation: { enabled: false, steps: 1 },
  }
}

function isSpectrumType(value: unknown): value is SpectrumType {
  return value === 'uv-vis' || value === 'ir' || value === 'raman'
}

function normalizePlotStyle(value: unknown): PlotStylePreferences {
  const raw = value && typeof value === 'object' ? value as Partial<PlotStylePreferences> : {}
  const template: PlotStyleTemplate = raw.template === 'minimal' || raw.template === 'framed' ? raw.template : 'grid'
  const defaults = preferencesForTemplate(template)
  const rawInterpolation = raw.seriesInterpolation && typeof raw.seriesInterpolation === 'object'
    ? raw.seriesInterpolation as Partial<SeriesInterpolationPreferences>
    : {}
  return {
    template,
    showGrid: typeof raw.showGrid === 'boolean' ? raw.showGrid : defaults.showGrid,
    showBorder: typeof raw.showBorder === 'boolean' ? raw.showBorder : defaults.showBorder,
    lineWidth: typeof raw.lineWidth === 'number' && Number.isFinite(raw.lineWidth)
      ? Math.min(6, Math.max(1, raw.lineWidth))
      : defaults.lineWidth,
    seriesMode: raw.seriesMode === 'lines+markers' || raw.seriesMode === 'markers' ? raw.seriesMode : 'lines',
    plotMode: raw.plotMode === 'heatmap' || raw.plotMode === 'surface3d' ? raw.plotMode : 'overlay',
    axisLabelFormat: raw.axisLabelFormat === 'fraction' || raw.axisLabelFormat === 'in' ? raw.axisLabelFormat : 'slash',
    quantityNotation: raw.quantityNotation === 'symbol' ? 'symbol' : 'name',
    seriesUnit: SERIES_TIME_UNITS.includes(raw.seriesUnit as SeriesTimeUnit) ? raw.seriesUnit as SeriesTimeUnit : 's',
    seriesInterpolation: {
      enabled: rawInterpolation.enabled === true,
      steps: typeof rawInterpolation.steps === 'number' && Number.isFinite(rawInterpolation.steps)
        ? Math.min(MAX_INTERPOLATION_STEPS, Math.max(1, Math.round(rawInterpolation.steps)))
        : defaults.seriesInterpolation.steps,
    },
  }
}

/**
 * Accepts every saved shape since v1. Removed fields (auto-detect, label template,
 * import interpolation) are ignored; a saved `auto` spectrum type falls back to UV-Vis.
 */
export function normalizeStartupPreferences(value: unknown): StartupPreferences {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const spectrumType: SpectrumType = isSpectrumType(saved.spectrumType) ? saved.spectrumType : 'uv-vis'
  const rawAxes = saved.axes && typeof saved.axes === 'object' ? saved.axes as Partial<StartupAxisPreferences> : {}
  const axesDefaults = axisDefaultsFor(spectrumType)
  const xQuantity = ABSCISSA_QUANTITIES.includes(rawAxes.xQuantity as (typeof ABSCISSA_QUANTITIES)[number])
    ? rawAxes.xQuantity!
    : axesDefaults.xQuantity
  const yQuantity = ORDINATE_QUANTITIES.includes(rawAxes.yQuantity as (typeof ORDINATE_QUANTITIES)[number])
    ? rawAxes.yQuantity!
    : axesDefaults.yQuantity
  const xAllowedUnits = UNITS_BY_QUANTITY[xQuantity] ?? [...ABSCISSA_UNITS]
  const xUnit = typeof rawAxes.xUnit === 'string' && xAllowedUnits.includes(rawAxes.xUnit)
    ? rawAxes.xUnit
    : (xAllowedUnits.includes(axesDefaults.x) ? axesDefaults.x : xAllowedUnits[0] ?? axesDefaults.x)
  const yUnit = typeof rawAxes.yUnit === 'string' && ORDINATE_UNITS.includes(rawAxes.yUnit as (typeof ORDINATE_UNITS)[number])
    ? rawAxes.yUnit
    : axesDefaults.y

  return {
    spectrumType,
    axes: { xQuantity, xUnit, yQuantity, yUnit },
    plotStyle: normalizePlotStyle(saved.plotStyle),
    computePrecision: saved.computePrecision === 'float64' ? 'float64' : 'float32',
  }
}

export function loadStartupPreferences(): StartupPreferences {
  if (typeof localStorage === 'undefined') return structuredClone(DEFAULT_STARTUP_PREFERENCES)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeStartupPreferences(JSON.parse(raw)) : structuredClone(DEFAULT_STARTUP_PREFERENCES)
  } catch {
    return structuredClone(DEFAULT_STARTUP_PREFERENCES)
  }
}

export function saveStartupPreferences(preferences: StartupPreferences): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeStartupPreferences(preferences)))
}

export function hasCompletedStartupWizard(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const value: unknown = JSON.parse(raw)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  } catch {
    return false
  }
}

export function axisDefaultsForPreference(type: SpectrumType): StartupAxisPreferences {
  const defaults = axisDefaultsFor(type)
  return {
    xQuantity: defaults.xQuantity,
    xUnit: defaults.x,
    yQuantity: defaults.yQuantity,
    yUnit: defaults.y || BLANK_UNIT,
  }
}
