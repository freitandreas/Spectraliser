import { describe, expect, it } from 'vitest'
import { metadataRows, newMetadataRow, rowsToMetadata, withKind } from '../src/services/metadataRows'

describe('metadata rows', () => {
  it('round-trips stored metadata and keeps linked header keys', () => {
    const stored = { 'Time / s': '30', Concentration: '2 mM', Temperature: '25 °C', Note: null }
    const rows = metadataRows(stored)
    expect(rows.map((row) => [row.kind, row.name, row.value, row.unit])).toEqual([
      ['time', 'Time', '30', 's'],
      ['concentration', 'Concentration', '2', 'mM'],
      ['custom', 'Temperature', '25', '°C'],
      ['custom', 'Note', '', ''],
    ])
    expect(rowsToMetadata(rows)).toEqual({
      metadata: { 'Time / s': '30 s', Concentration: '2 mM', Temperature: '25 °C', Note: null },
      errors: {},
    })
  })

  it('keeps clock times and offers unused standard kinds first', () => {
    const rows = metadataRows({ Time: '00:01:30' })
    expect(rows[0]).toMatchObject({ kind: 'time', value: '00:01:30' })
    expect(newMetadataRow(rows).kind).toBe('concentration')
    expect(rowsToMetadata(rows).metadata).toEqual({ Time: '00:01:30' })
  })

  it('rejects invalid values, duplicate names and custom names that shadow standard kinds', () => {
    const time = { ...newMetadataRow([]), value: 'soon' }
    const custom = withKind(newMetadataRow([]), 'custom')
    const result = rowsToMetadata([
      time,
      { ...custom, name: 'pH', value: '7' },
      { ...custom, name: 'pH', value: '8' },
      { ...custom, name: 'Concentration', value: '1' },
      { ...custom, name: '', value: '' },
    ])
    expect(result.metadata).toEqual({ pH: '7' })
    expect(Object.keys(result.errors)).toEqual(['0', '2', '3'])
  })
})
