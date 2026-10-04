import type { SpectrumDataset, SpectrumType } from '../types/project'
import { escapeHtml, quantityHtml, quantityPlain, quantityTex, type QuantityNotation } from './quantityNotation'

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

type OrdinateScale = 'fraction' | 'percent' | 'arbitrary'

function ordinateScale(unit: string): OrdinateScale {
  if (isPercentUnit(unit)) return 'percent'
  return ['', '1', '-'].includes(canonicalUnit(unit).toLowerCase()) ? 'fraction' : 'arbitrary'
}

/**
 * Factor turning ordinate values in `fromUnit` into `toUnit`, or null when the values
 * stay as they are. Percent and dimensionless fractions differ by 100; arbitrary units
 * (a.u., counts, …) carry no absolute scale, so converting them to or from percent is
 * rejected instead of inventing one.
 */
export function ordinateUnitFactor(fromUnit: string, toUnit: string): number | null {
  const from = ordinateScale(fromUnit)
  const to = ordinateScale(toUnit)
  if (from === to || (from !== 'percent' && to !== 'percent')) return null
  if (from === 'arbitrary' || to === 'arbitrary') {
    throw new Error(`Ordinate values in ${formatUnit(fromUnit) || '(no unit)'} have no absolute scale and cannot be converted to ${formatUnit(toUnit) || '(no unit)'}.`)
  }
  return to === 'percent' ? 100 : 0.01
}

/** Modified data of a sample with an enabled normalisation step is a normalised quantity (subscript "norm"). */
export function isNormalised(dataset: Pick<SpectrumDataset, 'pipeline'>): boolean {
  return dataset.pipeline.some((step) => step.type === 'normalization' && step.enabled)
}

export type AxisLabelFormat = 'slash' | 'fraction' | 'in'

export const AXIS_LABEL_FORMATS: Array<{ id: AxisLabelFormat; label: string; example: string }> = [
  { id: 'slash', label: 'Quantity / unit', example: 'Wavelength / nm' },
  { id: 'fraction', label: 'Fraction', example: '\\frac{Wavelength}{nm}' },
  { id: 'in', label: 'Quantity in unit', example: 'Wavelength in nm' },
]

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
 * quantity alone; `subscript` adds a descriptive subscript such as "norm". The fraction
 * form is TeX for Plotly's MathJax renderer; the `plain` target never emits markup or
 * TeX, for WebGL titles, CSV headers and form examples.
 */
export function axisLabel(
  quantity: string,
  unit: string,
  format: AxisLabelFormat = 'slash',
  notation: QuantityNotation = 'name',
  target: AxisLabelTarget = 'plain',
  subscript?: string,
): string {
  const formatted = formatUnit(unit).trim()
  const name = target === 'plain' ? quantityPlain(quantity, notation, subscript) : quantityHtml(quantity, notation, subscript)
  if (!formatted) return name
  const unitText = target === 'plain' ? formatted : escapeHtml(formatted)
  if (format === 'in') return `${name} in ${unitText}`
  if (format === 'fraction' && target === 'plotly') {
    return `$\\frac{${quantityTex(quantity, notation, subscript)}}{\\mathrm{${texUnit(unit)}}}$`
  }
  return `${name} / ${unitText}`
}
