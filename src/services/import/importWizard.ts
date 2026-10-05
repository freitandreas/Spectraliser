import type { ImportOptions } from './parsers'

export const defaultImportOptions: ImportOptions = {
  delimiter: ',',
  decimalSeparator: '.',
  startRow: 0,
  hasHeader: true,
  xColumn: 0,
  yColumn: 1,
  spectrumType: 'uv-vis',
}

export function detectDelimitedFormat(content: string): Pick<ImportOptions, 'delimiter' | 'decimalSeparator'> {
  const lines = content.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim()).slice(0, 100)
  const candidates = [',', ';', '\t', '|'] as const
  let best = { delimiter: defaultImportOptions.delimiter, decimalSeparator: defaultImportOptions.decimalSeparator }
  let bestScore = 0
  for (const delimiter of candidates) {
    const rows = lines.map((line) => {
      const fields: string[] = []
      let quoted = false
      let field = ''
      for (const character of line) {
        if (character === '"') quoted = !quoted
        if (character === delimiter && !quoted) {
          fields.push(field)
          field = ''
        } else {
          field += character
        }
      }
      return [...fields, field]
    })
    const decimalSeparator = delimiter !== ',' && rows.some((row) =>
      row.some((field) => /^[+-]?\d+,\d+(?:e[+-]?\d+)?$/i.test(field.trim().replace(/^"|"$/g, ''))),
    ) ? ',' : '.'
    const numericRows = rows.filter((row) => row.length >= 2 && row.every((field) => {
      const value = field.trim().replace(/^"|"$/g, '').replace(decimalSeparator, '.')
      return value !== '' && Number.isFinite(Number(value))
    })).length
    const counts = new Map<number, number>()
    for (const row of rows) {
      if (row.length > 1) counts.set(row.length, (counts.get(row.length) ?? 0) + 1)
    }
    const consistentRows = Math.max(0, ...counts.values())
    const score = numericRows * 1000 + consistentRows
    if (score > bestScore) {
      bestScore = score
      best = { delimiter, decimalSeparator }
    }
  }
  return best
}

export function validateImportOptions(options: ImportOptions): string[] {
  const issues: string[] = []

  if (options.startRow < 0) {
    issues.push('Start row must be greater or equal to 0.')
  }

  if (options.xColumn < 0 || options.yColumn < 0) {
    issues.push('Column indexes must be greater or equal to 0.')
  }

  if (options.delimiter === 'custom' && !options.customDelimiter) {
    issues.push('Custom delimiter is required when delimiter mode is custom.')
  }

  return issues
}
