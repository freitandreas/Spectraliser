import { canonicalUnit } from '../spectrumPresets'

export type ConvertibleAbscissaUnit = 'm' | 'cm' | 'mm' | 'µm' | 'um' | 'nm' | 'cm^-1' | '1/cm'

function normalizeUnit(unit: string): ConvertibleAbscissaUnit | null {
  const normalized = canonicalUnit(unit).toLowerCase().replaceAll(' ', '')
  if (normalized === 'm' || normalized === 'cm' || normalized === 'mm' || normalized === 'µm'
    || normalized === 'um' || normalized === 'nm' || normalized === 'cm^-1' || normalized === '1/cm') {
    return normalized
  }
  return null
}

function toNanometres(value: number, unit: ConvertibleAbscissaUnit): number {
  if (unit === 'm') return value * 1e9
  if (unit === 'cm') return value * 1e7
  if (unit === 'mm') return value * 1e6
  if (unit === 'µm' || unit === 'um') return value * 1e3
  return value
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

  const fromWavenumber = from === 'cm^-1' || from === '1/cm'
  const toWavenumber = to === 'cm^-1' || to === '1/cm'
  if (fromWavenumber !== toWavenumber) {
    return values.map((value) => {
      if (value === 0) throw new Error('Cannot convert a zero wavelength or wavenumber')
      return fromWavenumber
        ? 1e7 / value
        : 1e7 / toNanometres(value, from)
    })
  }

  if (fromWavenumber && toWavenumber) return [...values]

  return values.map((value) => toNanometres(value, from) / toNanometres(1, to))
}

export function canConvertAbscissa(fromUnit: string, toUnit: string): boolean {
  try {
    convertAbscissa([1], fromUnit, toUnit)
    return true
  } catch {
    return false
  }
}