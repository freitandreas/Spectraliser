import { describe, expect, it } from 'vitest'
import {
  convertMetadataValue,
  metadataKind,
  numericCustomFields,
  parseMetadataQuantity,
  resolveSeriesAxis,
  splitFieldKey,
} from '../src/services/metadataFields'

describe('metadata fields', () => {
  it.each([
    ['Time / s', { name: 'Time', unit: 's' }],
    ['Concentration (mM)', { name: 'Concentration', unit: 'mM' }],
    ['c [µM]', { name: 'c', unit: 'µM' }],
    ['Time in min', { name: 'Time', unit: 'min' }],
    ['Temperature', { name: 'Temperature', unit: '' }],
  ])('splits %s', (key, expected) => {
    expect(splitFieldKey(key)).toEqual(expected)
  })

  it('classifies field kinds by name', () => {
    expect(metadataKind('Time / s')).toBe('time')
    expect(metadataKind('conc.')).toBe('concentration')
    expect(metadataKind('Temperature / °C')).toBe('custom')
  })

  it('parses values, preferring a unit in the value over the header unit', () => {
    expect(parseMetadataQuantity('Time / s', '30')).toEqual({ value: 30, unit: 's' })
    expect(parseMetadataQuantity('Time / s', '2 min')).toEqual({ value: 2, unit: 'min' })
    expect(parseMetadataQuantity('Time', '00:01:30')).toEqual({ value: 90, unit: 's' })
    expect(parseMetadataQuantity('Concentration', '5 umol/L')).toEqual({ value: 5, unit: 'µmol/L' })
    expect(parseMetadataQuantity('Temperature', '25 °C')).toEqual({ value: 25, unit: '°C' })
    expect(parseMetadataQuantity('Time', '30')).toBeNull()
    expect(parseMetadataQuantity('Concentration', 'high')).toBeNull()
  })

  it('converts concentrations within molar or mass units but never between them', () => {
    expect(convertMetadataValue('concentration', 2, 'mM', 'µM')).toBeCloseTo(2000)
    expect(convertMetadataValue('concentration', 1, 'mg/mL', 'g/L')).toBeCloseTo(1)
    expect(convertMetadataValue('concentration', 1, 'mM', 'mg/L')).toBeNull()
    expect(convertMetadataValue('time', 2, 'min', 's')).toBeCloseTo(120)
  })

  it('lists custom fields with numeric values only', () => {
    expect(numericCustomFields([
      { Temperature: '25 °C', Solvent: 'water', Time: '3 s' },
      { pH: '7.4', Temperature: null },
    ])).toEqual(['pH', 'Temperature'])
  })
})

describe('series axis', () => {
  it('converts metadata times and falls back to labels for time only', () => {
    const resolved = resolveSeriesAxis([
      { label: '30 s' },
      { label: 'Series 2', metadata: { 'Time / min': '1' } },
      { label: 'Series 3', metadata: { Time: '00:01:30' } },
    ], 'time', 's')
    expect(resolved).toMatchObject({ kind: 'measured', quantity: 'Time', unit: 's' })
    expect(resolved.values).toEqual([30, 60, 90])
  })

  it('prefers metadata over the label', () => {
    expect(resolveSeriesAxis([{ label: '30 s', metadata: { Time: '45 s' } }], 'time', 's').values).toEqual([45])
  })

  it('converts concentrations into the axis unit', () => {
    const resolved = resolveSeriesAxis([
      { label: 'a', metadata: { Concentration: '0.5 mM' } },
      { label: 'b', metadata: { 'c / µM': '750' } },
    ], 'concentration', 'µM')
    expect(resolved.kind).toBe('measured')
    expect(resolved.values[0]).toBeCloseTo(500)
    expect(resolved.values[1]).toBeCloseTo(750)
  })

  it('places series by order when values are missing, duplicated or unconvertible', () => {
    expect(resolveSeriesAxis([{ label: '1 mM' }, { label: 'b', metadata: { Concentration: '2 mM' } }], 'concentration', 'mM'))
      .toEqual({ kind: 'index', values: [1, 2], quantity: 'Concentration', missing: ['1 mM'], problem: 'missing' })
    expect(resolveSeriesAxis([{ label: '60 s' }, { label: '1 min' }], 'time', 's'))
      .toMatchObject({ kind: 'index', problem: 'duplicates' })
    expect(resolveSeriesAxis([
      { label: 'a', metadata: { Concentration: '1 mM' } },
      { label: 'b', metadata: { Concentration: '1 mg/L' } },
    ], 'concentration', 'mM')).toMatchObject({ kind: 'index', problem: 'units', missing: ['b'] })
  })

  it('requires one shared unit for custom fields', () => {
    expect(resolveSeriesAxis([
      { label: 'a', metadata: { Temperature: '20 °C' } },
      { label: 'b', metadata: { 'Temperature / °C': '30' } },
    ], 'Temperature', '')).toEqual({ kind: 'measured', values: [20, 30], quantity: 'Temperature', unit: '°C' })
    expect(resolveSeriesAxis([
      { label: 'a', metadata: { Temperature: '20 °C' } },
      { label: 'b', metadata: { Temperature: '300 K' } },
    ], 'Temperature', '')).toMatchObject({ kind: 'index', problem: 'units' })
  })
})
