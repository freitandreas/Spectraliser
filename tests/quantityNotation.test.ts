import { describe, expect, it } from 'vitest'
import { axisLabel } from '../src/services/spectrumPresets'
import { quantityHtml, quantityPlain } from '../src/services/quantityNotation'

describe('quantity notation', () => {
  it('uses full names by default and symbols on request', () => {
    expect(quantityPlain('Wavenumber', 'name')).toBe('Wavenumber')
    expect(quantityPlain('Wavelength', 'symbol')).toBe('λ')
    expect(quantityHtml('Absorbance', 'symbol')).toBe('<i>A</i>')
    expect(quantityPlain('Unknown quantity', 'symbol')).toBe('Unknown quantity')
  })

  it('escapes markup in names and subscripts', () => {
    expect(quantityHtml('<b>', 'name')).toBe('&#60;b&#62;')
  })
})

describe('axisLabel targets', () => {
  it('keeps plain labels free of markup and TeX', () => {
    expect(axisLabel('Wavenumber', 'cm^-1', 'fraction')).toBe('Wavenumber / cm⁻¹')
    expect(axisLabel('Wavenumber', 'cm^-1', 'in', 'symbol')).toBe('ν̃ in cm⁻¹')
  })

  it('renders TeX fractions with the full unit for Plotly', () => {
    expect(axisLabel('Wavenumber', 'cm⁻¹', 'fraction', 'name', 'plotly')).toBe('$\\frac{\\text{Wavenumber}}{\\mathrm{cm^{-1}}}$')
    expect(axisLabel('Wavenumber', 'cm⁻¹', 'fraction', 'symbol', 'plotly')).toBe('$\\frac{\\tilde{\\nu}}{\\mathrm{cm^{-1}}}$')
  })

  it('renders symbols as italic HTML in Plotly slash labels', () => {
    expect(axisLabel('Wavelength', 'nm', 'slash', 'symbol', 'plotly')).toBe('<i>λ</i> / nm')
    expect(axisLabel('Absorbance', '', 'fraction', 'symbol', 'plotly')).toBe('<i>A</i>')
  })
})
