import type { ExperimentMetadata } from '../types/project'
import {
  CONCENTRATION_UNITS,
  KIND_QUANTITY,
  defaultUnitForKind,
  metadataKind,
  normaliseConcentrationUnit,
  splitFieldKey,
  type MetadataKind,
} from './metadataFields'
import { normaliseTimeUnit } from './seriesCoordinates'

export interface MetadataRow {
  /** Key the value was stored under; kept so linked CSV headers such as `Time / s` survive edits. */
  key: string
  kind: MetadataKind
  name: string
  value: string
  unit: string
}

const NUMBER_WITH_UNIT = /^([-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/
const CLOCK_ONLY = /^\d{1,3}:[0-5]\d:[0-5]\d(?:\.\d+)?$/

export function isClockValue(value: string): boolean {
  return CLOCK_ONLY.test(value.trim())
}

function knownUnit(kind: MetadataKind, raw: string): string | null {
  if (kind === 'time') return normaliseTimeUnit(raw)
  if (kind === 'concentration') return normaliseConcentrationUnit(raw)
  return raw.trim()
}

export function metadataRows(metadata: ExperimentMetadata | undefined): MetadataRow[] {
  return Object.entries(metadata ?? {}).map(([key, raw]) => {
    const kind = metadataKind(key)
    const header = splitFieldKey(key)
    const text = raw?.trim() ?? ''
    const match = isClockValue(text) ? null : NUMBER_WITH_UNIT.exec(text)
    const unitText = match ? match[2].trim() || header.unit : header.unit
    const unit = (unitText && knownUnit(kind, unitText)) || (kind === 'custom' ? unitText : defaultUnitForKind(kind))
    return { key, kind, name: kind === 'custom' ? key : KIND_QUANTITY[kind], value: match ? match[1] : text, unit }
  })
}

export function newMetadataRow(existing: MetadataRow[]): MetadataRow {
  const used = new Set(existing.map((row) => row.kind))
  const kind: MetadataKind = !used.has('time') ? 'time' : !used.has('concentration') ? 'concentration' : 'custom'
  return { key: '', kind, name: kind === 'custom' ? '' : KIND_QUANTITY[kind], value: '', unit: defaultUnitForKind(kind) }
}

export function withKind(row: MetadataRow, kind: MetadataKind): MetadataRow {
  if (kind === row.kind) return row
  return { ...row, kind, name: kind === 'custom' ? '' : KIND_QUANTITY[kind], unit: defaultUnitForKind(kind) }
}

export interface RowsResult {
  metadata: ExperimentMetadata
  /** Error per row index; rows with errors (or an unnamed custom row) are left out. */
  errors: Record<number, string>
}

/** Serialises rows to `value unit` strings; empty values are kept as explicitly missing (null). */
export function rowsToMetadata(rows: MetadataRow[]): RowsResult {
  const metadata: ExperimentMetadata = {}
  const errors: Record<number, string> = {}
  rows.forEach((row, index) => {
    const value = row.value.trim()
    let key = row.key
    if (row.kind === 'custom') {
      key = row.name.trim()
      if (!key) {
        if (value) errors[index] = 'Name this field.'
        return
      }
      if (metadataKind(key) !== 'custom') {
        errors[index] = `Use the ${KIND_QUANTITY[metadataKind(key) as 'time' | 'concentration']} option for this field.`
        return
      }
    } else if (!key || metadataKind(key) !== row.kind) {
      key = KIND_QUANTITY[row.kind]
    }
    if (key in metadata) {
      errors[index] = 'This field already exists.'
      return
    }
    if (!value) {
      metadata[key] = null
      return
    }
    if (row.kind !== 'custom') {
      if (row.kind === 'time' && isClockValue(value)) {
        metadata[key] = value
        return
      }
      const number = Number(value.replace(',', '.'))
      if (!NUMBER_WITH_UNIT.test(value) || !Number.isFinite(number) || NUMBER_WITH_UNIT.exec(value)![2]) {
        errors[index] = row.kind === 'time' ? 'Enter a number or HH:MM:SS.' : 'Enter a number.'
        return
      }
      const allowed = row.kind === 'time' ? normaliseTimeUnit(row.unit) : CONCENTRATION_UNITS.includes(row.unit) ? row.unit : null
      if (!allowed) {
        errors[index] = 'Choose a unit.'
        return
      }
      metadata[key] = `${value} ${allowed}`
      return
    }
    metadata[key] = row.unit.trim() ? `${value} ${row.unit.trim()}` : value
  })
  return { metadata, errors }
}
