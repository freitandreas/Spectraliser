import type { ExperimentMetadata, SpectrumDataset } from '../../types/project'

export type MetadataMatchField = 'id' | 'name' | 'sourcePath' | 'label'
export type MetadataDelimiter = ',' | ';' | '\t'

export interface MetadataTable {
  headers: string[]
  rows: string[][]
}

export interface MetadataImportOptions {
  delimiter: MetadataDelimiter
  matchField: MetadataMatchField
  keyColumn: string
}

export interface MetadataImportResult {
  datasets: SpectrumDataset[]
  errors: string[]
  matchedCount: number
  unmatchedKeys: string[]
  unmatchedDatasetLabels: string[]
}

/** Parses an RFC-4180-style delimited table, including escaped quotes and quoted newlines. */
export function parseMetadataTable(content: string, delimiter: MetadataDelimiter): MetadataTable {
  const source = content.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let closedQuote = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          closedQuote = true
        }
      } else {
        field += character
      }
      continue
    }

    if (closedQuote && character !== delimiter && character !== '\n' && character !== '\r') {
      throw new Error(`Unexpected character after a quoted field at character ${index + 1}.`)
    }
    if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === '"') {
      throw new Error(`Unexpected quote at character ${index + 1}.`)
    } else if (character === delimiter) {
      row.push(field)
      field = ''
      closedQuote = false
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row)
      row = []
      field = ''
      closedQuote = false
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('The table contains an unterminated quoted field.')
  row.push(field)
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row)
  if (!rows.length) return { headers: [], rows: [] }

  const headers = rows[0]!.map((header) => header.trim())
  if (headers.some((header) => !header)) throw new Error('Every metadata column must have a non-empty header.')
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index)
  if (duplicates.length) throw new Error(`Duplicate column header(s): ${[...new Set(duplicates)].join(', ')}.`)
  if (headers.length < 2) throw new Error('The table must contain a dataset key column and at least one metadata column.')

  const oversizedRow = rows.slice(1).findIndex((cells) =>
    cells.slice(headers.length).some((cell) => cell.trim().length > 0),
  )
  if (oversizedRow >= 0) {
    throw new Error(`Row ${oversizedRow + 2} contains more cells than the header row.`)
  }

  const bodyRows = rows.slice(1).map((cells) =>
    headers.map((_, column) => cells[column] ?? ''),
  )
  return { headers, rows: bodyRows }
}

function datasetKey(dataset: SpectrumDataset, field: MetadataMatchField): string {
  if (field === 'id') return dataset.id
  if (field === 'name') return dataset.name
  if (field === 'sourcePath') return dataset.sourcePath
  return dataset.style.label
}

export function validateAndLinkMetadata(
  datasets: SpectrumDataset[],
  table: MetadataTable,
  options: MetadataImportOptions,
): MetadataImportResult {
  const errors: string[] = []
  const keyIndex = table.headers.indexOf(options.keyColumn)
  if (keyIndex < 0) errors.push(`Dataset key column "${options.keyColumn}" is not present in the table.`)
  const metadataHeaders = table.headers.filter((_, index) => index !== keyIndex)
  if (!metadataHeaders.length) errors.push('Select a dataset key column and include at least one metadata column.')

  const targetByKey = new Map<string, SpectrumDataset>()
  const duplicateDatasetKeys = new Set<string>()
  for (const dataset of datasets) {
    const key = datasetKey(dataset, options.matchField)
    if (targetByKey.has(key)) duplicateDatasetKeys.add(key)
    else targetByKey.set(key, dataset)
  }
  if (duplicateDatasetKeys.size) {
    errors.push(
      `Matching by ${options.matchField} is ambiguous for: ${[...duplicateDatasetKeys].map((key) => JSON.stringify(key)).join(', ')}. Choose a unique dataset key field.`,
    )
  }

  const seenRows = new Set<string>()
  const rowsByDatasetId = new Map<string, ExperimentMetadata>()
  const unmatchedKeys: string[] = []
  table.rows.forEach((row, rowIndex) => {
    if (keyIndex < 0) return
    const key = row[keyIndex] ?? ''
    const displayRow = rowIndex + 2
    if (!key.trim()) {
      errors.push(`Row ${displayRow} has a missing dataset key.`)
      return
    }
    if (seenRows.has(key)) {
      errors.push(`Row ${displayRow} repeats dataset key ${JSON.stringify(key)}.`)
      return
    }
    seenRows.add(key)
    const dataset = targetByKey.get(key)
    if (!dataset) {
      unmatchedKeys.push(key)
      errors.push(`Row ${displayRow} dataset key ${JSON.stringify(key)} does not exactly match a dataset ${options.matchField}.`)
      return
    }
    rowsByDatasetId.set(dataset.id, Object.fromEntries(
      metadataHeaders.map((header) => {
        const value = row[table.headers.indexOf(header)] ?? ''
        return [header, value.trim().length ? value : null]
      }),
    ))
  })

  if (errors.length) {
    return {
      datasets,
      errors,
      matchedCount: 0,
      unmatchedKeys,
      unmatchedDatasetLabels: datasets.map((dataset) => dataset.style.label),
    }
  }

  const nextDatasets = datasets.map((dataset) => {
    const incoming = rowsByDatasetId.get(dataset.id)
    return incoming
      ? { ...dataset, experimentMetadata: { ...dataset.experimentMetadata, ...incoming } }
      : dataset
  })
  return {
    datasets: nextDatasets,
    errors: [],
    matchedCount: rowsByDatasetId.size,
    unmatchedKeys: [],
    unmatchedDatasetLabels: datasets
      .filter((dataset) => !rowsByDatasetId.has(dataset.id))
      .map((dataset) => dataset.style.label),
  }
}
