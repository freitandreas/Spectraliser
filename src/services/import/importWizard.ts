import type { ImportOptions } from './parsers'

export const defaultImportOptions: ImportOptions = {
  delimiter: ',',
  decimalSeparator: '.',
  startRow: 0,
  hasHeader: true,
  xColumn: 0,
  yColumn: 1,
  spectrumType: 'auto',
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
