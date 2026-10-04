import { describe, expect, it } from 'vitest'
import { parseSeriesCoordinate } from '../src/services/seriesCoordinates'

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
})
