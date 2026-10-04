import { describe, expect, it } from 'vitest'
import { peakShape } from '../src/services/peakShape'

const x = Array.from({ length: 81 }, (_, i) => 1000 + i * 2.5)
const gauss = (v: number, center: number, sigma: number) => Math.exp(-0.5 * ((v - center) / sigma) ** 2)
const y = x.map((v) => 0.8 * gauss(v, 1060, 6) + 0.3 * gauss(v, 1120, 10) + 0.05)

describe('peakShape', () => {
  it('matches SciPy prominence and FWHM', () => {
    // Reference: scipy.signal.peak_prominences / peak_widths(rel_height=0.5) on the same data.
    const first = peakShape(x, y, 24, 'maxima')!
    const second = peakShape(x, y, 48, 'maxima')!
    expect(first.prominence).toBeCloseTo(0.8000000045689902, 9)
    expect(second.prominence).toBeCloseTo(0.29920786732329596, 9)
    expect(first.fwhm).toBeCloseTo(14.15265386867012, 9)
    expect(second.fwhm).toBeCloseTo(23.537738749851016, 9)
  })

  it('integrates each band between the valleys to its neighbours', () => {
    // Gaussian band areas are A·σ·√(2π): 12.03 and 7.52.
    expect(peakShape(x, y, 24, 'maxima', { next: 48 })!.area).toBeCloseTo(0.8 * 6 * Math.sqrt(2 * Math.PI), 1)
    expect(peakShape(x, y, 48, 'maxima', { previous: 24 })!.area).toBeCloseTo(0.3 * 10 * Math.sqrt(2 * Math.PI), 0)
  })

  it('measures minima on the inverted signal with positive results', () => {
    const transmittance = y.map((v) => 100 - 50 * v)
    const shape = peakShape(x, transmittance, 24, 'minima')!
    expect(shape.prominence).toBeCloseTo(40, 6)
    expect(shape.fwhm).toBeCloseTo(14.15265386867012, 9)
    expect(shape.area).toBeGreaterThan(0)
  })

  it('handles descending abscissae and rejects non-extrema', () => {
    const reversed = peakShape([...x].reverse(), [...y].reverse(), 80 - 24, 'maxima')!
    expect(reversed.fwhm).toBeCloseTo(14.15265386867012, 9)
    expect(peakShape(x, y, 10, 'maxima')).toBeNull()
    expect(peakShape(x, y, 0, 'maxima')).toBeNull()
  })
})
