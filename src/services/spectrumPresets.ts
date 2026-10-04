import type { SpectrumType } from '../types/project'
import { escapeHtml, quantityHtml, quantityPlain, quantitySymbol, type QuantityNotation } from './quantityNotation'

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

export type AxisLabelFormat = 'slash' | 'fraction' | 'in'

export const AXIS_LABEL_FORMATS: Array<{ id: AxisLabelFormat; label: string; example: string }> = [
  { id: 'slash', label: 'Quantity / unit', example: 'Wavelength / nm' },
  { id: 'fraction', label: 'Fraction', example: '\\frac{Wavelength}{nm}' },
  { id: 'in', label: 'Quantity in unit', example: 'Wavelength in nm' },
]

function texText(value: string): string {
  return value.replace(/[\\{}$%&#_^~]/g, (char) => (char === '\\' ? '\\backslash ' : `\\${char}`))
}

function texUnit(unit: string): string {
  return canonicalUnit(unit)
    .replace(/[{}$&#_~]/g, (char) => `\\${char}`)
    .replace(/%/g, '\\%')
    .replace(/µ/g, '\\mu ')
    .replace(/\^(-?\d+)/g, '^{$1}')
    .replace(/ /g, '\\,')
}

export type AxisLabelTarget = 'plotly' | 'plain'

/**
 * Renders an axis title in the selected IUPAC-style form. Dimensionless axes show the
 * quantity alone. The fraction form is TeX for Plotly's MathJax renderer; the `plain`
 * target never emits markup or TeX, for WebGL titles, CSV headers and form examples.
 */
export function axisLabel(
  quantity: string,
  unit: string,
  format: AxisLabelFormat = 'slash',
  notation: QuantityNotation = 'name',
  target: AxisLabelTarget = 'plain',
): string {
  const formatted = formatUnit(unit).trim()
  const symbol = quantitySymbol(quantity, notation)
  const name = target === 'plain' ? quantityPlain(quantity, notation) : quantityHtml(quantity, notation)
  if (!formatted) return name
  const unitText = target === 'plain' ? formatted : escapeHtml(formatted)
  if (format === 'in') return `${name} in ${unitText}`
  if (format === 'fraction' && target === 'plotly') {
    const numerator = symbol ? symbol.tex : `\\text{${texText(quantity)}}`
    return `$\\frac{${numerator}}{\\mathrm{${texUnit(unit)}}}$`
  }
  return `${name} / ${unitText}`
}
