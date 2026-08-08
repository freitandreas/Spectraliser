import * as XLSX from 'xlsx'

export interface ImportOptions {
  delimiter: ',' | ';' | '\t' | '|' | 'custom'
  customDelimiter?: string
  decimalSeparator: '.' | ','
  startRow: number
  hasHeader: boolean
  xColumn: number
  yColumn: number
}

export interface ParsedSpectrum {
  abscissa: number[]
  ordinate: number[]
}

export interface ParsedSpectrumSeries extends ParsedSpectrum {
  label: string
}

export interface ParsedSpectrumCollection {
  series: ParsedSpectrumSeries[]
}

function normalizeDecimal(raw: string, decimalSeparator: '.' | ','): string {
  if (decimalSeparator === ',') {
    return raw.replace(',', '.')
  }

  return raw
}

function parseNumber(raw: string, decimalSeparator: '.' | ','): number | null {
  const normalized = normalizeDecimal(raw.trim(), decimalSeparator)
  if (normalized.length === 0) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function parseDelimitedRows(content: string, options: ImportOptions): string[][] {
  const lines = splitLines(content)
  const delimiter = options.delimiter === 'custom' ? options.customDelimiter ?? ',' : options.delimiter
  return lines.filter((line) => line.trim().length > 0).map((line) => line.split(delimiter))
}

function buildSeriesFromRows(
  rows: string[][],
  options: ImportOptions,
): ParsedSpectrumCollection {
  const start = Math.max(0, options.startRow)
  const headerRow = options.hasHeader ? rows[start] ?? [] : []
  const dataStart = options.hasHeader ? start + 1 : start
  const dataRows = rows.slice(dataStart)

  let maxColumns = 0
  for (const row of dataRows) {
    if (row.length > maxColumns) {
      maxColumns = row.length
    }
  }

  const yColumns: number[] = []
  for (let col = 0; col < maxColumns; col += 1) {
    if (col === options.xColumn) {
      continue
    }

    let numericFound = false
    for (const row of dataRows) {
      const value = parseNumber(String(row[col] ?? ''), options.decimalSeparator)
      if (value !== null) {
        numericFound = true
        break
      }
    }

    if (numericFound) {
      yColumns.push(col)
    }
  }

  if (yColumns.length === 0) {
    yColumns.push(options.yColumn)
  }

  const series: ParsedSpectrumSeries[] = yColumns.map((yColumn) => {
    const abscissa: number[] = []
    const ordinate: number[] = []

    for (const row of dataRows) {
      const x = parseNumber(String(row[options.xColumn] ?? ''), options.decimalSeparator)
      const y = parseNumber(String(row[yColumn] ?? ''), options.decimalSeparator)
      if (x === null || y === null) {
        continue
      }

      abscissa.push(x)
      ordinate.push(y)
    }

    const headerLabel = String(headerRow[yColumn] ?? '').trim()
    const label = headerLabel.length > 0 ? headerLabel : `Series ${yColumn + 1}`

    return {
      label,
      abscissa,
      ordinate,
    }
  })

  return {
    series: series.filter((item) => item.abscissa.length > 0 && item.ordinate.length > 0),
  }
}

export function parseDelimitedCollection(
  content: string,
  options: ImportOptions,
): ParsedSpectrumCollection {
  return buildSeriesFromRows(parseDelimitedRows(content, options), options)
}

export function parseDelimited(content: string, options: ImportOptions): ParsedSpectrum {
  const collection = parseDelimitedCollection(content, options)
  const first = collection.series[0]
  if (!first) {
    return { abscissa: [], ordinate: [] }
  }

  return {
    abscissa: first.abscissa,
    ordinate: first.ordinate,
  }
}

export function parseXlsxCollection(
  arrayBuffer: ArrayBuffer,
  options: ImportOptions,
): ParsedSpectrumCollection {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const firstSheet = workbook.SheetNames[0]

  if (!firstSheet) {
    return { series: [] }
  }

  const worksheet = workbook.Sheets[firstSheet]
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
    header: 1,
    raw: false,
  })

  const stringRows = rows.map((row) => row.map((cell) => String(cell ?? '')))
  return buildSeriesFromRows(stringRows, options)
}

export function parseXlsx(arrayBuffer: ArrayBuffer, options: ImportOptions): ParsedSpectrum {
  const collection = parseXlsxCollection(arrayBuffer, options)
  const first = collection.series[0]
  if (!first) {
    return { abscissa: [], ordinate: [] }
  }

  return {
    abscissa: first.abscissa,
    ordinate: first.ordinate,
  }
}
