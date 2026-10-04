import { describe, expect, it } from 'vitest'
import {
  axisDefaultsFor,
  axisLabel,
  canonicalUnit,
  formatUnit,
  isPercentUnit,
  ordinateUnitFactor,
} from '../src/services/spectrumPresets'
import { canConvertAbscissa, convertAbscissa } from '../src/services/import/unitConversion'

describe('unit formatting', () => {
  it('renders ASCII exponents as unicode superscripts', () => {
    expect(formatUnit('cm^-1')).toBe('cm⁻¹')
    expect(formatUnit('m^2')).toBe('m²')
    expect(formatUnit('nm')).toBe('nm')
  })

  it('treats unicode and ASCII wavenumbers as the same unit', () => {
    expect(canonicalUnit('cm⁻¹')).toBe('cm^-1')
    expect(canConvertAbscissa('cm⁻¹', 'nm')).toBe(true)
    expect(convertAbscissa([1e7], 'cm⁻¹', 'nm')).toEqual([1])
  })

  it('omits the divisor for dimensionless axes', () => {
    expect(axisLabel('Absorbance', '')).toBe('Absorbance')
    expect(axisLabel('Wavenumber', 'cm^-1')).toBe('Wavenumber / cm⁻¹')
  })
})

describe('percent ordinates', () => {
  it('detects percent units', () => {
    expect(isPercentUnit('%')).toBe(true)
    expect(isPercentUnit('a.u.')).toBe(false)
  })

  it('scales data by 100 when switching to percent and back', () => {
    expect(ordinateUnitFactor('', '%')).toBe(100)
    expect(ordinateUnitFactor('%', '')).toBe(0.01)
    expect(ordinateUnitFactor('%', '%')).toBeNull()
    expect(ordinateUnitFactor('a.u.', '')).toBeNull()
    expect(ordinateUnitFactor('counts', 'a.u.')).toBeNull()
  })

  it('rejects percent conversions of units without an absolute scale', () => {
    expect(() => ordinateUnitFactor('a.u.', '%')).toThrow(/no absolute scale/)
    expect(() => ordinateUnitFactor('%', 'counts')).toThrow(/no absolute scale/)
  })
})

describe('spectrum type defaults', () => {
  it('uses technique specific quantities and units', () => {
    expect(axisDefaultsFor('ir')).toMatchObject({ xQuantity: 'Wavenumber', x: 'cm⁻¹' })
    expect(axisDefaultsFor('raman')).toMatchObject({ xQuantity: 'Raman shift', x: 'cm⁻¹' })
    expect(axisDefaultsFor('uv-vis')).toMatchObject({ xQuantity: 'Wavelength', x: 'nm', y: '' })
  })
})
