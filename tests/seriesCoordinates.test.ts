import { describe, expect, it } from 'vitest'
import { parseSeriesCoordinate, resolveSeriesCoordinates } from '../src/services/seriesCoordinates'

describe('series coordinates', () => {
  it.each([
    ['t = 30 s', { value: 30, unit: 's' }],
    ['Sample 2.5 min', { value: 2.5, unit: 'min' }],
    ['delay 150 fs', { value: 150, unit: 'fs' }],
    ['00:01:30', { value: 90, unit: 's' }],
  ])('parses %s', (label, expected) => {
    expect(parseSeriesCoordinate(label)).toEqual(expected)
  })

  it('does not invent coordinates for unitless or ambiguous labels', () => {
    expect(parseSeriesCoordinate('Series 3')).toBeNull()
    expect(parseSeriesCoordinate('12')).toBeNull()
    expect(parseSeriesCoordinate('01:30')).toBeNull()
  })

  it('converts parsed and manual coordinates into the plot unit, preferring manual values', () => {
    const resolved = resolveSeriesCoordinates([
      { label: '30 s' },
      { label: '1 min' },
      { label: 'Series 3', seriesCoordinate: { value: 0.025, unit: 'h' } },
    ], 's')
    expect(resolved.kind).toBe('time')
    expect(resolved.values[0]).toBeCloseTo(30)
    expect(resolved.values[1]).toBeCloseTo(60)
    expect(resolved.values[2]).toBeCloseTo(90)
  })

  it('falls back to series order and reports missing or duplicate coordinates', () => {
    expect(resolveSeriesCoordinates([{ label: '30 s' }, { label: 'unknown' }], 's'))
      .toEqual({ kind: 'index', values: [1, 2], missing: ['unknown'], duplicates: false })
    expect(resolveSeriesCoordinates([{ label: '60 s' }, { label: '1 min' }], 's'))
      .toMatchObject({ kind: 'index', duplicates: true })
  })
})
