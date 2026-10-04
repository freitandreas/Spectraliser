import { describe, expect, it } from 'vitest'
import { parseMetadataTable, validateAndLinkMetadata } from '../src/services/metadata/importMetadata'
import { buildDataset } from './fixtures'

describe('experiment metadata import', () => {
  it('parses quoted CSV values, escaped quotes, newlines, and missing cells', () => {
    const table = parseMetadataTable(
      '\uFEFFseries,operator,note,temperature\n"A, 1",Ana,"said ""hello""\nthere",\n',
      ',',
    )

    expect(table.headers).toEqual(['series', 'operator', 'note', 'temperature'])
    expect(table.rows).toEqual([['A, 1', 'Ana', 'said "hello"\nthere', '']])
  })

  it('links multi-series rows by exact unique series labels and keeps blanks missing', () => {
    const first = buildDataset({
      id: 'dataset-1',
      name: 'run.csv',
      sourcePath: 'run.csv',
      style: { lineColor: '#fff', lineWidth: 2, scatterSymbol: 'circle', label: 'Series A' },
      experimentMetadata: { retained: 'yes', temperature: 'old' },
    })
    const second = buildDataset({
      id: 'dataset-2',
      name: 'run.csv',
      sourcePath: 'run.csv',
      style: { lineColor: '#fff', lineWidth: 2, scatterSymbol: 'circle', label: 'Series B' },
    })
    const table = parseMetadataTable('series,temperature,operator\nSeries A,25,Ana\nSeries B,,Bo\n', ',')

    const result = validateAndLinkMetadata([first, second], table, {
      delimiter: ',',
      matchField: 'label',
      keyColumn: 'series',
    })

    expect(result.errors).toEqual([])
    expect(result.matchedCount).toBe(2)
    expect(result.datasets.map((dataset) => dataset.experimentMetadata)).toEqual([
      { retained: 'yes', temperature: '25', operator: 'Ana' },
      { temperature: null, operator: 'Bo' },
    ])
    expect(first.experimentMetadata).toEqual({ retained: 'yes', temperature: 'old' })
  })

  it('rejects unmatched and duplicate row keys without partially linking', () => {
    const dataset = buildDataset({ style: { ...buildDataset().style, label: 'known' } })
    const unmatched = parseMetadataTable('sample,value\nunknown,1\n', ',')
    const missingResult = validateAndLinkMetadata([dataset], unmatched, {
      delimiter: ',',
      matchField: 'label',
      keyColumn: 'sample',
    })
    expect(missingResult.errors.join(' ')).toContain('does not exactly match')
    expect(missingResult.unmatchedKeys).toEqual(['unknown'])
    expect(missingResult.datasets[0]?.experimentMetadata).toBeUndefined()

    const duplicate = parseMetadataTable('sample,value\nknown,1\nknown,2\n', ',')
    const duplicateResult = validateAndLinkMetadata([dataset], duplicate, {
      delimiter: ',',
      matchField: 'label',
      keyColumn: 'sample',
    })
    expect(duplicateResult.errors.join(' ')).toContain('repeats dataset key')
    expect(duplicateResult.matchedCount).toBe(0)
  })

  it('rejects ambiguous target keys, missing IDs, duplicate headers, and malformed quotes', () => {
    const first = buildDataset({ id: 'a', name: 'same.csv', sourcePath: 'same.csv' })
    const second = buildDataset({ id: 'b', name: 'same.csv', sourcePath: 'same.csv' })
    const table = parseMetadataTable('file,value\nsame.csv,1\n', ',')
    expect(validateAndLinkMetadata([first, second], table, {
      delimiter: ',',
      matchField: 'sourcePath',
      keyColumn: 'file',
    }).errors.join(' ')).toContain('ambiguous')

    const missing = parseMetadataTable('file,value\n,1\n', ',')
    expect(validateAndLinkMetadata([first], missing, {
      delimiter: ',',
      matchField: 'id',
      keyColumn: 'file',
    }).errors.join(' ')).toContain('missing dataset key')
    expect(() => parseMetadataTable('id,value,value\nx,1,2\n', ',')).toThrow('Duplicate column header')
    expect(() => parseMetadataTable('id,value\nx,"unfinished\n', ',')).toThrow('unterminated')
    expect(() => parseMetadataTable('id,value\nx,"quoted"tail\n', ',')).toThrow('after a quoted field')
  })

  it('retains unmatched datasets as explicitly unlinked metadata', () => {
    const first = buildDataset({ id: 'one', style: { ...buildDataset().style, label: 'one' } })
    const second = buildDataset({ id: 'two', style: { ...buildDataset().style, label: 'two' } })
    const table = parseMetadataTable('series,note\none,measured\n', ',')
    const result = validateAndLinkMetadata([first, second], table, {
      delimiter: ',',
      matchField: 'label',
      keyColumn: 'series',
    })
    expect(result.matchedCount).toBe(1)
    expect(result.unmatchedDatasetLabels).toEqual(['two'])
    expect(result.datasets[1]?.experimentMetadata).toBeUndefined()
  })
})
