import { describe, expect, it } from 'vitest'
import { convertAbscissa } from '../src/services/import/unitConversion'
import { validateImportOptions } from '../src/services/import/importWizard'
import { defaultImportOptions } from '../src/services/import/importWizard'
import { normalizeImportedSeries } from '../src/services/import/normalize'
import { inferOrdinateUnit, parseDelimitedCollection } from '../src/services/import/parsers'

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

  it('reads only genuine ordinate units from series headers', () => {
    expect(inferOrdinateUnit('Transmittance (%)')).toBe('%')
    expect(inferOrdinateUnit('%T')).toBe('%')
    expect(inferOrdinateUnit('T / %')).toBe('%')
    expect(inferOrdinateUnit('Intensity (a.u.)')).toBe('a.u.')
    expect(inferOrdinateUnit('Absorbance [-]')).toBe('')
    expect(inferOrdinateUnit('10 s')).toBeUndefined()
    expect(inferOrdinateUnit('Sample m-xylene')).toBeUndefined()
    expect(inferOrdinateUnit('50% EtOH')).toBeUndefined()
    expect(inferOrdinateUnit('Au nanoparticles')).toBeUndefined()
  })

  it('keeps percent transmittance from time-labelled series at its measured scale', () => {
    const collection = parseDelimitedCollection('cm-1,10 s,20 s\n1000,95,90\n1100,40,45\n', {
      ...defaultImportOptions,
      spectrumType: 'ir',
    })
    expect(collection.series).toHaveLength(2)
    const axes = { xQuantity: 'Wavenumber', xUnit: 'cm⁻¹', yQuantity: 'Transmittance', yUnit: '%' }
    for (const series of collection.series) {
      expect(series.yUnit).toBeUndefined()
      expect(Math.max(...normalizeImportedSeries(series, 'ir', axes).ordinate)).toBeLessThanOrEqual(100)
    }
  })

  it('infers fractional transmittance from the value range when no unit is stated', () => {
    const result = normalizeImportedSeries({
      label: 'T', abscissa: [1000, 1100], ordinate: [0.95, 0.4], yQuantity: 'Transmittance', spectrumType: 'ir',
    }, 'ir', { xQuantity: 'Wavenumber', xUnit: 'cm^-1', yQuantity: 'Transmittance', yUnit: '%' })
    expect(result.ordinate).toEqual([95, 40])
  })

  it('rejects arbitrary-unit data for a percent axis instead of rescaling it', () => {
    expect(() => normalizeImportedSeries({
      label: 'I', abscissa: [1000, 1100], ordinate: [5, 7], yUnit: 'a.u.', spectrumType: 'ir',
    }, 'ir', { xQuantity: 'Wavenumber', xUnit: 'cm^-1', yQuantity: 'Transmittance', yUnit: '%' })).toThrow(/no absolute scale/)
  })
})
