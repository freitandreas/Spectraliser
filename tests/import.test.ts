import { createDatasetFromParsed, resolveProjectSpectrumType } from '../src/state/projectContext'
import { describe, expect, it } from 'vitest'
import { parseDelimited, parseDelimitedCollection } from '../src/services/import/parsers'
import { canConvertAbscissa, convertAbscissa } from '../src/services/import/unitConversion'

describe('parseDelimited', () => {
  it('converts wavelength and wavenumber values deterministically', () => {
    expect(convertAbscissa([200, 2], 'nm', 'µm')).toEqual([0.2, 0.002])
    expect(convertAbscissa([1000, 2000], 'cm^-1', 'nm')).toEqual([10000, 5000])
    expect(canConvertAbscissa('nm', 'cm^-1')).toBe(true)
    expect(canConvertAbscissa('seconds', 'nm')).toBe(false)
  })

  it('respects start row and header', () => {
    const result = parseDelimited('x,y\nheader,header\n200,0.1\n201,0.2\n', {
      delimiter: ',',
      decimalSeparator: '.',
      startRow: 1,
      hasHeader: true,
      xColumn: 0,
      yColumn: 1,
    })

    expect(result.abscissa).toEqual([200, 201])
    expect(result.ordinate).toEqual([0.1, 0.2])
  })

  it('parses comma decimals when configured', () => {
    const result = parseDelimited('200;0,55\n201;0,65\n', {
      delimiter: ';',
      decimalSeparator: ',',
      startRow: 0,
      hasHeader: false,
      xColumn: 0,
      yColumn: 1,
    })

    expect(result.ordinate).toEqual([0.55, 0.65])
  })

  it('captures series labels and inferred units from headers', () => {
    const collection = parseDelimitedCollection('Wavelength (nm),Absorbance\n200,0.1\n201,0.2\n', {
      delimiter: ',',
      decimalSeparator: '.',
      startRow: 0,
      hasHeader: true,
      xColumn: 0,
      yColumn: 1,
    })

    expect(collection.series[0]?.label).toBe('Absorbance')
    expect(collection.series[0]?.xUnit).toBe('nm')
    expect(collection.series[0]?.yUnit).toBe('Absorbance')
  })

  it('detects IR headers and preserves the spectrum type when creating imported datasets', () => {
    const parsed = parseDelimited('Wavenumber (cm^-1),Absorbance\n1000,0.5\n1100,0.6\n', {
      delimiter: ',',
      decimalSeparator: '.',
      startRow: 0,
      hasHeader: true,
      xColumn: 0,
      yColumn: 1,
    })

    const dataset = createDatasetFromParsed({
      name: 'ir-sample.csv',
      label: 'Renamed spectrum',
      parsed,
    })

    expect(parsed.spectrumType).toBe('ir')
    expect(dataset.spectrumType).toBe('ir')
    expect(dataset.units.x).toBe('cm^-1')
    expect(dataset.units.y).toBe('Absorbance')
    expect(dataset.style.label).toBe('Renamed spectrum')
  })

  it('rejects mixed spectrum types at the project boundary', () => {
    const uv = createDatasetFromParsed({ name: 'uv.csv', parsed: { abscissa: [1], ordinate: [2], spectrumType: 'uv-vis' } })
    const ir = createDatasetFromParsed({ name: 'ir.csv', parsed: { abscissa: [1], ordinate: [2], spectrumType: 'ir' } })

    expect(resolveProjectSpectrumType([uv], [ir]).error).toContain('different spectrum type')
    expect(resolveProjectSpectrumType([uv], [uv]).spectrumType).toBe('uv-vis')
  })
})
