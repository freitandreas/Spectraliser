import { canonicalUnit } from '../spectrumPresets'

export type ConvertibleAbscissaUnit = 'm' | 'cm' | 'mm' | 'µm' | 'um' | 'nm' | 'cm^-1' | '1/cm' | 'Hz' | 'eV' | 'Å' | 's'

const SPEED_OF_LIGHT_M_S = 299_792_458
const HC_EV_NM = 1239.8419843320026

function normalizeUnit(unit: string): ConvertibleAbscissaUnit | null {
  const normalized = canonicalUnit(unit).toLowerCase().replaceAll(' ', '')
  if (['m', 'cm', 'mm', 'µm', 'um', 'nm'].includes(normalized)) return normalized as ConvertibleAbscissaUnit
  if (['cm^-1', '1/cm'].includes(normalized)) return normalized as ConvertibleAbscissaUnit
  if (normalized === 'hz') return 'Hz'
  if (normalized === 'ev') return 'eV'
  if (['å', 'angstrom', 'angstroms'].includes(normalized)) return 'Å'
  if (normalized === 's') return 's'
  return null
}

function toNanometres(value: number, unit: ConvertibleAbscissaUnit): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Abscissa conversions require finite, positive wavelength, wavenumber, frequency, or energy values.')
  }
  if (unit === 'm') return value * 1e9
  if (unit === 'cm') return value * 1e7
  if (unit === 'mm') return value * 1e6
  if (unit === 'µm' || unit === 'um') return value * 1e3
  if (unit === 'nm') return value
  if (unit === 'cm^-1' || unit === '1/cm') return 1e7 / value
  if (unit === 'Hz') return (SPEED_OF_LIGHT_M_S * 1e9) / value
  if (unit === 'Å') return value / 10
  if (unit === 's') throw new Error('Time is not convertible to wavelength, frequency, or spectral energy.')
  return HC_EV_NM / value
}

function fromNanometres(value: number, unit: ConvertibleAbscissaUnit): number {
  if (unit === 'm') return value / 1e9
  if (unit === 'cm') return value / 1e7
  if (unit === 'mm') return value / 1e6
  if (unit === 'µm' || unit === 'um') return value / 1e3
  if (unit === 'nm') return value
  if (unit === 'cm^-1' || unit === '1/cm') return 1e7 / value
  if (unit === 'Hz') return (SPEED_OF_LIGHT_M_S * 1e9) / value
  if (unit === 'Å') return value * 10
  if (unit === 's') throw new Error('Time is not convertible to wavelength, frequency, or spectral energy.')
  return HC_EV_NM / value
}

export function convertAbscissa(values: number[], fromUnit: string, toUnit: string): number[] {
  const from = normalizeUnit(fromUnit)
  const to = normalizeUnit(toUnit)
  if (!from || !to) {
    throw new Error(`Unsupported abscissa conversion: ${fromUnit} -> ${toUnit}`)
  }
  if (from === to || (from === 'µm' && to === 'um') || (from === 'um' && to === 'µm')) {
    return [...values]
  }
  return values.map((value) => fromNanometres(toNanometres(value, from), to))
}

export function canConvertAbscissa(fromUnit: string, toUnit: string): boolean {
  try {
    convertAbscissa([1], fromUnit, toUnit)
    return true
  } catch {
    return false
  }
}
