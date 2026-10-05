import { describe, expect, it } from 'vitest'
import { DEFAULT_PEAK_DETECTION, peakDetectionFor, peakModeFor } from '../src/types/project'

describe('peak mode by spectrum type', () => {
  it('always uses minima for IR', () => {
    expect(peakModeFor('ir', 'maxima')).toBe('minima')
    expect(peakDetectionFor('ir')).toMatchObject({ mode: 'minima', prominence: -Math.abs(DEFAULT_PEAK_DETECTION.prominence) })
  })

  it('keeps the requested mode for other spectrum types', () => {
    const minima = { ...DEFAULT_PEAK_DETECTION, mode: 'minima' as const, prominence: -0.2 }
    expect(peakModeFor('uv-vis', 'minima')).toBe('minima')
    expect(peakDetectionFor('raman', minima)).toBe(minima)
    expect(peakDetectionFor('uv-vis')).toEqual(DEFAULT_PEAK_DETECTION)
  })
})
