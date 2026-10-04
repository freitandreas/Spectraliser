import { finiteRange } from '../numeric'
import * as XLSX from 'xlsx'
import type { SpectrumType } from '../../types/project'

export interface ImportOptions {
  delimiter: ',' | ';' | '\t' | '|' | 'custom'
  customDelimiter?: string
  decimalSeparator: '.' | ','
  startRow: number
  hasHeader: boolean
  xColumn: number
  yColumn: number
  spectrumType?: SpectrumType
  axisMetadata?: {
    xQuantity: string
    xUnit: string
    yQuantity: string
    yUnit: string
  }
  seriesLabelOverrides?: string[]
  seriesLabelOverridesByFile?: Record<number, string[]>
}

export interface ParsedSpectrum {
  abscissa: number[]
  ordinate: number[]
  xUnit?: string
  yUnit?: string
  xQuantity?: string
  yQuantity?: string
  spectrumType?: SpectrumType
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

function inferHeaderUnit(raw: string): string | undefined {
  const angstrom = raw.match(/Å|angstroms?/i)
  if (angstrom) return 'Å'
  const matches = raw.match(/\(([^)]+)\)|\b(cm\s*(?:\^?\s*-?1|⁻¹|−1)|nm|µm|μm|um|microns?|mm|m|hz|ev|s|%)\b/ig)
  if (!matches?.length) return undefined
  const token = (matches[matches.length - 1] ?? '').replace(/[()]/g, '').trim()
  if (/cm/i.test(token)) return /⁻|−/.test(token) ? 'cm⁻¹' : 'cm^-1'
  if (/^microns?$/i.test(token)) return 'µm'
  if (/^(?:u|µ|μ)m$/i.test(token)) return 'µm'
  return token
}

/**
 * Ordinate unit stated in a column header, or undefined when none is recognisable.
 * Series headers often carry a time or sample name ("10 s", "Sample m-xylene"), so
 * only genuine ordinate units are accepted here.
 */
export function inferOrdinateUnit(header: string): string | undefined {
  // Unit positions only: "(%)", "[%]", "/ %", "in %", "%T", "T%"; not "50% EtOH".
  if (/(?:^|[\s([/])%\s*(?:[)\]]|$)|%T\b|\bT\s?%/i.test(header)) return '%'
  if (/\ba\.\s?u\.?|[([]\s*a\.?\s?u\.?\s*[)\]]|\barb(?:itrary|\.)?\s*units?\b/i.test(header)) return 'a.u.'
  if (/\bcounts?\b|\bcps\b/i.test(header)) return 'counts'
  const bracketed = header.match(/[([]\s*([^)\]]*?)\s*[)\]]\s*$/)?.[1]
  if (bracketed !== undefined && ['', '-', '1'].includes(bracketed)) return ''
  return undefined
}

function inferXQuantity(header: string, unit?: string): string | undefined {
  const text = header.toLowerCase()
  if (/raman/.test(text)) return 'Raman shift'
  if (/wavenumber|wave\s*number/.test(text) || /cm/i.test(unit ?? '')) return 'Wavenumber'
  if (/wavelength|lambda|λ/.test(text) || /^(?:å|angstroms?|nm|µm|um|microns?|mm|m)$/i.test(unit ?? '')) return 'Wavelength'
  if (/frequency/.test(text) || /^hz$/i.test(unit ?? '')) return 'Frequency'
  if (/energy/.test(text) || /^ev$/i.test(unit ?? '')) return 'Energy'
  if (/time/.test(text) || /^s$/i.test(unit ?? '')) return 'Time'
  return undefined
}

function inferYQuantity(header: string): string | undefined {
  const text = header.toLowerCase()
  if (/absorb/.test(text)) return 'Absorbance'
  if (/transmitt/.test(text)) return 'Transmittance'
  if (/reflect/.test(text)) return 'Reflectance'
  if (/count/.test(text)) return 'Counts'
  if (/normal/.test(text) && /intens/.test(text)) return 'Normalised intensity'
  if (/intens|signal|response/.test(text)) return 'Intensity'
  return undefined
}

function inferSpectrumType(xHeader: string, xUnit?: string, values?: number[]): SpectrumType | undefined {
  const text = `${xHeader} ${xUnit ?? ''}`.toLowerCase()
  if (/raman/.test(text)) return 'raman'
  if (/wavenumber|wave\s*number/.test(text) || /cm/i.test(xUnit ?? '')) return 'ir'
  if (/wavelength|absorbance|uv[\s-]?vis/.test(text)) return 'uv-vis'
  const range = finiteRange(values ?? [])
  if (range && range[0] < range[1]) {
    const [min, max] = range
    if (min >= 350 && max <= 5000 && max - min >= 1000) return 'ir'
    if (min >= 100 && max <= 1200) return 'uv-vis'
  }
  return undefined
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

    const xHeader = String(headerRow[options.xColumn] ?? '').trim()
    const yHeader = String(headerRow[yColumn] ?? '').trim()
    const inferredXUnit = inferHeaderUnit(xHeader)
    const inferredYUnit = inferOrdinateUnit(yHeader)

    const headerLabel = yHeader.length > 0 ? yHeader : `Series ${yColumn + 1}`
    const label = headerLabel.length > 0 ? headerLabel : `Series ${yColumn + 1}`
    const detectedSpectrumType = inferSpectrumType(xHeader, inferredXUnit, abscissa)

    return {
      label,
      abscissa,
      ordinate,
      xUnit: inferredXUnit,
      yUnit: inferredYUnit,
      xQuantity: inferXQuantity(xHeader, inferredXUnit),
      yQuantity: inferYQuantity(yHeader),
      spectrumType: detectedSpectrumType,
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
    xUnit: first.xUnit,
    yUnit: first.yUnit,
    xQuantity: first.xQuantity,
    yQuantity: first.yQuantity,
    spectrumType: first.spectrumType,
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
    xUnit: first.xUnit,
    yUnit: first.yUnit,
    xQuantity: first.xQuantity,
    yQuantity: first.yQuantity,
    spectrumType: first.spectrumType,
  }
}
