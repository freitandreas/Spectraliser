import { describe, expect, it } from 'vitest'
import { buildSeriesGrid } from '../src/lib/plot/seriesGrid'

const series = [
  { label: 'late', coordinate: 20, abscissa: [0, 1, 2], ordinate: [2, 4, 6] },
  { label: 'early', coordinate: 0, abscissa: [0, 1, 2], ordinate: [0, 0, 0] },
]

describe('series grid', () => {
  it('sorts measured series by coordinate with one row per measured series', () => {
    const grid = buildSeriesGrid(series)
    expect(grid.coordinates).toEqual([0, 20])
    expect(grid.labels).toEqual(['early', 'late'])
    expect(grid.sources).toEqual([1, 0])
    expect(grid.z).toEqual([[0, 0, 0], [2, 4, 6]])
  })

  it('does not mutate source data', () => {
    const input = structuredClone(series)
    buildSeriesGrid(input)
    expect(input).toEqual(series)
  })

  it('resamples onto the common abscissa range and rejects non-overlapping series', () => {
    const grid = buildSeriesGrid([
      { label: 'a', coordinate: 0, abscissa: [0, 1, 2, 3], ordinate: [0, 1, 2, 3] },
      { label: 'b', coordinate: 1, abscissa: [0.5, 2.5], ordinate: [5, 25] },
    ])
    expect(grid.resampled).toBe(true)
    expect(Math.min(...grid.x)).toBeGreaterThanOrEqual(0.5)
    expect(Math.max(...grid.x)).toBeLessThanOrEqual(2.5)
    expect(() => buildSeriesGrid([
      { label: 'a', coordinate: 0, abscissa: [0, 1], ordinate: [0, 1] },
      { label: 'b', coordinate: 1, abscissa: [5, 6], ordinate: [0, 1] },
    ])).toThrow(/overlapping/)
  })
})
