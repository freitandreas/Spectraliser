import type { ExperimentMetadata } from '../types/project'
import {
  SERIES_TIME_UNITS,
  convertSeriesCoordinate,
  normaliseTimeUnit,
  parseSeriesCoordinate,
  type SeriesTimeUnit,
} from './seriesCoordinates'

/** Time and concentration have known units and conversions; custom fields keep whatever unit they carry. */
export type MetadataKind = 'time' | 'concentration' | 'custom'

export const METADATA_KIND_OPTIONS: Array<{ id: MetadataKind; label: string }> = [
  { id: 'time', label: 'Time' },
  { id: 'concentration', label: 'Concentration' },
  { id: 'custom', label: 'Custom' },
]

export const KIND_QUANTITY: Record<Exclude<MetadataKind, 'custom'>, string> = {
  time: 'Time',
  concentration: 'Concentration',
}

// Decimal exponents relative to mol/L and g/L, so conversions are exact powers of ten.
// Molar and mass concentrations need a molar mass to interconvert, so they never are.
const MOLAR_FACTORS: Record<string, number> = {
  M: 0, mM: -3, 'µM': -6, nM: -9, pM: -12, 'mol/L': 0, 'mmol/L': -3, 'µmol/L': -6, 'mol/m³': -3,
}
const MASS_FACTORS: Record<string, number> = {
  'g/L': 0, 'mg/L': -3, 'µg/L': -6, 'mg/mL': 0, 'µg/mL': -3, 'ng/mL': -6,
}
export const CONCENTRATION_UNITS = [...Object.keys(MOLAR_FACTORS), ...Object.keys(MASS_FACTORS)]

const NUMBER_WITH_UNIT = /^([-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/
const CLOCK_ONLY = /^\d{1,3}:[0-5]\d:[0-5]\d(?:\.\d+)?$/

export interface MetadataQuantity {
  value: number
  unit: string
}

/** Splits `Time / s`, `Concentration (mM)`, `c [µM]` or `Time in min` into the field name and its header unit. */
export function splitFieldKey(key: string): { name: string; unit: string } {
  const match = /^(.*?\S)\s*(?:\/\s*([^/]+?)|\(([^()]+)\)|\[([^[\]]+)\]|\s+in\s+(\S+))\s*$/.exec(key.trim())
  if (!match) return { name: key.trim(), unit: '' }
  return { name: match[1], unit: (match[2] ?? match[3] ?? match[4] ?? match[5] ?? '').trim() }
}

export function metadataKind(key: string): MetadataKind {
  const name = splitFieldKey(key).name.toLowerCase()
  if (/^(time|t|elapsed time|delay|time delay|reaction time)$/.test(name)) return 'time'
  if (/^(concentration|conc\.?|c)$/.test(name)) return 'concentration'
  return 'custom'
}

export function normaliseConcentrationUnit(raw: string): string | null {
  let unit = raw.trim().replace(/μ/g, 'µ').replace(/^u(?=(?:M|mol|g)\b|M$)/, 'µ')
  unit = unit.replace(/\s*(?:·|\*|\s)\s*([mµ]?L)\s*(?:⁻¹|\^-1|-1)$/i, '/$1')
  unit = unit.replace(/\/l$/, '/L').replace(/\/ml$/i, '/mL').replace(/\/dm(?:³|3)$/, '/L').replace(/\/m3$/, '/m³')
  return CONCENTRATION_UNITS.includes(unit) ? unit : null
}

export function unitsForKind(kind: MetadataKind): readonly string[] {
  if (kind === 'time') return SERIES_TIME_UNITS
  if (kind === 'concentration') return CONCENTRATION_UNITS
  return []
}

export function defaultUnitForKind(kind: MetadataKind): string {
  if (kind === 'time') return 's'
  if (kind === 'concentration') return 'mM'
  return ''
}

/** Parses a stored value; a unit in the value wins over the header unit, and time also accepts HH:MM:SS. */
export function parseMetadataQuantity(key: string, raw: string | null | undefined): MetadataQuantity | null {
  const text = raw?.trim()
  if (!text) return null
  const kind = metadataKind(key)
  if (kind === 'time' && CLOCK_ONLY.test(text)) return parseSeriesCoordinate(text)
  const match = NUMBER_WITH_UNIT.exec(text)
  if (!match) return null
  const value = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(value)) return null
  const rawUnit = match[2].trim() || splitFieldKey(key).unit
  if (kind === 'custom') return { value, unit: rawUnit }
  const unit = kind === 'time' ? normaliseTimeUnit(rawUnit) : normaliseConcentrationUnit(rawUnit)
  return unit ? { value, unit } : null
}

/** Returns null when the units cannot be interconverted (unknown units, or molar ↔ mass concentration). */
export function convertMetadataValue(kind: MetadataKind, value: number, from: string, to: string): number | null {
  if (from === to) return value
  if (kind === 'time') {
    const source = normaliseTimeUnit(from)
    const target = normaliseTimeUnit(to)
    return source && target ? convertSeriesCoordinate(value, source, target) : null
  }
  if (kind === 'concentration') {
    for (const factors of [MOLAR_FACTORS, MASS_FACTORS]) {
      if (!(from in factors && to in factors)) continue
      const shift = factors[from] - factors[to]
      return shift >= 0 ? value * 10 ** shift : value / 10 ** -shift
    }
  }
  return null
}

/** Axis field ids are `time`, `concentration`, or the name of a custom field. */
export function fieldKind(field: string): MetadataKind {
  return field === 'time' || field === 'concentration' ? field : 'custom'
}

export function fieldQuantity(field: string): string {
  const kind = fieldKind(field)
  return kind === 'custom' ? field : KIND_QUANTITY[kind]
}

export function findMetadataEntry(metadata: ExperimentMetadata | undefined, field: string): [string, string | null] | null {
  const kind = fieldKind(field)
  for (const entry of Object.entries(metadata ?? {})) {
    const entryKind = metadataKind(entry[0])
    if (kind !== 'custom' ? entryKind === kind : entryKind === 'custom' && splitFieldKey(entry[0]).name === field) return entry
  }
  return null
}

/** Custom field names that hold a number for at least one dataset, so they can serve as a series axis. */
export function numericCustomFields(metadataList: Array<ExperimentMetadata | undefined>): string[] {
  const names = new Set<string>()
  for (const metadata of metadataList) {
    for (const [key, raw] of Object.entries(metadata ?? {})) {
      if (metadataKind(key) === 'custom' && parseMetadataQuantity(key, raw)) names.add(splitFieldKey(key).name)
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right))
}

export interface SeriesAxisSource {
  label: string
  metadata?: ExperimentMetadata
}

export type ResolvedSeriesCoordinates =
  | { kind: 'measured'; values: number[]; quantity: string; unit: string }
  | { kind: 'index'; values: number[]; quantity: string; missing: string[]; problem: 'missing' | 'duplicates' | 'units' }

/**
 * Places every series on the chosen third axis. A metadata value takes precedence; only time falls back
 * to a value read from the series label. Anything missing, ambiguous or unconvertible falls back to series
 * order instead of guessing.
 */
export function resolveSeriesAxis(sources: SeriesAxisSource[], field: string, targetUnit: string): ResolvedSeriesCoordinates {
  const kind = fieldKind(field)
  const quantity = fieldQuantity(field)
  const order = sources.map((_, index) => index + 1)
  const parsed = sources.map((source) => {
    const entry = findMetadataEntry(source.metadata, field)
    if (entry && entry[1]?.trim()) return parseMetadataQuantity(entry[0], entry[1])
    return kind === 'time' ? parseSeriesCoordinate(source.label) : null
  })
  const missing = sources.filter((_, index) => parsed[index] === null).map((source) => source.label)
  if (missing.length) return { kind: 'index', values: order, quantity, missing, problem: 'missing' }

  const unit = kind === 'custom' ? parsed[0]!.unit : targetUnit
  const values = parsed.map((item) => convertMetadataValue(kind, item!.value, item!.unit, unit))
  if (values.some((value) => value === null)) {
    const mismatched = sources.filter((_, index) => values[index] === null).map((source) => source.label)
    return { kind: 'index', values: order, quantity, missing: mismatched, problem: 'units' }
  }
  if (new Set(values).size !== values.length) return { kind: 'index', values: order, quantity, missing: [], problem: 'duplicates' }
  return { kind: 'measured', values: values as number[], quantity, unit }
}

export function isSupportedSeriesUnit(field: string, unit: string): boolean {
  return unitsForKind(fieldKind(field)).includes(unit as SeriesTimeUnit)
}
