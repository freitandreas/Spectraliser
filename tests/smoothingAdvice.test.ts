import { describe, expect, it } from 'vitest'
import { combineSmoothingSuggestions, smoothingInput } from '../src/services/smoothingAdvice'
import type { SmoothingSuggestion } from '../src/worker/messages'
import type { SpectrumDataset } from '../src/types/project'

const ok = (windowLength: number, polyorder: number): SmoothingSuggestion => ({
  windowLength, polyorder, noise: 0.01, snr: 100, fwhmPoints: 20, status: 'ok',
})

describe('combineSmoothingSuggestions', () => {
  it('uses the median odd window and the most frequent order of usable samples', () => {
    const advice = combineSmoothingSuggestions([ok(15, 2), ok(20, 2), ok(31, 4), { ...ok(5, 2), status: 'noise_free' }])
    expect(advice.params).toEqual({ window_length: 19, polyorder: 2 })
    expect(advice.message).toMatch(/3 of 4 samples/)
  })

  it('reports why no parameters were applied', () => {
    expect(combineSmoothingSuggestions([{ ...ok(5, 2), status: 'noise_free' }])).toEqual({
      params: null,
      disable: true,
      message: 'Smoothing switched off: the noise level is negligible.',
    })
    expect(combineSmoothingSuggestions([{ ...ok(5, 2), status: 'too_narrow' }])).toMatchObject({ params: null, disable: true })
    expect(combineSmoothingSuggestions([{ ...ok(5, 2), status: 'too_short' }])).toMatchObject({ params: null, disable: false })
  })
})

describe('smoothingInput', () => {
  it('limits the tuner to the enabled crop window of the original data', () => {
    const dataset = {
      data: { abscissa: [1, 2, 3, 4], ordinateOriginal: [10, 20, Number.NaN, 40], ordinateModified: [] },
      pipeline: [{ id: 'c', type: 'crop', enabled: true, params: { x_min: 2, x_max: 4 } }],
    } as unknown as SpectrumDataset
    expect(smoothingInput(dataset)).toEqual([20, 40])
  })
})
