import { describe, expect, it } from 'vitest'
import { convertAbscissa } from '../src/services/import/unitConversion'
import { validateImportOptions } from '../src/services/import/importWizard'
import { defaultImportOptions } from '../src/services/import/importWizard'
import { normalizeImportedSeries } from '../src/services/import/normalize'

describe('import normalization', () => {
  it('converts between wavelength, wavenumber, frequency, and energy units', () => {
    expect(convertAbscissa([500], 'nm', 'cm^-1')[0]).toBeCloseTo(20_000)
    expect(convertAbscissa([500], 'nm', 'eV')[0]).toBeCloseTo(2.4796839687)
    expect(convertAbscissa([500], 'nm', 'Hz')[0]).toBeCloseTo(5.99584916e14)
  })

  it('normalizes imported coordinates and percent ordinates into the chosen axis units', () => {
    const result = normalizeImportedSeries({
      label: 'T',
      abscissa: [1000, 2000],
      ordinate: [50, 75],
      xUnit: 'cm^-1',
      yUnit: '%',
      xQuantity: 'Wavenumber',
      yQuantity: 'Transmittance',
      spectrumType: 'ir',
    }, 'ir', {
      xQuantity: 'Wavelength',
      xUnit: 'nm',
      yQuantity: 'Transmittance',
      yUnit: '',
    })

    expect(result.abscissa).toEqual([10_000, 5_000])
    expect(result.ordinate).toEqual([0.5, 0.75])
    expect(result.xUnit).toBe('nm')
  })

  it('does not treat Raman shift as absolute wavenumber for wavelength conversion', () => {
    expect(() => normalizeImportedSeries({
      label: 'Raman',
      abscissa: [100, 200],
      ordinate: [1, 2],
      xUnit: 'cm^-1',
      xQuantity: 'Raman shift',
      spectrumType: 'raman',
    }, 'raman', {
      xQuantity: 'Wavelength',
      xUnit: 'nm',
      yQuantity: 'Intensity',
      yUnit: 'a.u.',
    })).toThrow(/excitation-laser metadata/)
  })

  it('defaults to an explicit spectrum type and accepts valid options without a confirmation step', () => {
    expect(defaultImportOptions.spectrumType).toBe('uv-vis')
    expect(validateImportOptions(defaultImportOptions)).toEqual([])
  })
})
