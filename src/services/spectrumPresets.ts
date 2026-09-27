import type { SpectrumType } from '../types/project'

export const BLANK_UNIT = ''

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
}

/** Render ASCII exponents as unicode, so `cm^-1` shows as `cm⁻¹`. */
export function formatUnit(unit: string): string {
  return unit.replace(/\^(-?)(\d+)/g, (_match, sign: string, digits: string) =>
    (sign ? '⁻' : '') + [...digits].map((digit) => SUPERSCRIPT_DIGITS[digit] ?? digit).join(''),
  )
}

/** Collapse unicode exponents and micro signs so units compare reliably. */
export function canonicalUnit(unit: string): string {
  return unit
    .trim()
    .replaceAll('μ', 'µ')
    .replace(/[⁻−]/g, '^-')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (char) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(char)))
    .replace(/\^-\^?/g, '^-')
}

export function isPercentUnit(unit: string): boolean {
  return canonicalUnit(unit).replaceAll(' ', '').includes('%')
}

export const ABSCISSA_QUANTITIES = [
  'Wavelength', 'Wavenumber', 'Raman shift', 'Frequency', 'Energy', 'Time',
] as const

export const ORDINATE_QUANTITIES = [
  'Absorbance', 'Transmittance', 'Reflectance', 'Intensity', 'Counts', 'Normalised intensity',
] as const

export const ABSCISSA_UNITS = ['nm', 'µm', 'cm⁻¹', 'm', 'Hz', 'eV', 's'] as const
export const ORDINATE_UNITS = [BLANK_UNIT, '%', 'a.u.', 'counts'] as const

export interface AxisMetadata {
  xQuantity: string
  x: string
  yQuantity: string
  y: string
}

export const SPECTRUM_AXIS_DEFAULTS: Record<SpectrumType, AxisMetadata> = {
  'uv-vis': { xQuantity: 'Wavelength', x: 'nm', yQuantity: 'Absorbance', y: BLANK_UNIT },
  ir: { xQuantity: 'Wavenumber', x: 'cm⁻¹', yQuantity: 'Transmittance', y: '%' },
  raman: { xQuantity: 'Raman shift', x: 'cm⁻¹', yQuantity: 'Intensity', y: 'a.u.' },
}

export function axisDefaultsFor(spectrumType: SpectrumType): AxisMetadata {
  return SPECTRUM_AXIS_DEFAULTS[spectrumType] ?? SPECTRUM_AXIS_DEFAULTS['uv-vis']
}

/** Percent ordinates hold the same values scaled by 100. */
export function percentScaleFactor(fromUnit: string, toUnit: string): number | null {
  const from = isPercentUnit(fromUnit)
  const to = isPercentUnit(toUnit)
  if (from === to) return null
  return to ? 100 : 0.01
}

/** Renders `quantity / unit`, dropping the divisor for dimensionless axes. */
export function axisLabel(quantity: string, unit: string, subscript = ''): string {
  const name = subscript ? `${quantity} (${subscript})` : quantity
  const formatted = formatUnit(unit).trim()
  return formatted ? `${name} / ${formatted}` : name
}
