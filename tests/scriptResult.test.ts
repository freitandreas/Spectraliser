import { describe, expect, it } from 'vitest'
import { applyScriptResult } from '../src/state/scriptResult'
import { buildDataset } from './fixtures'

const peak = {
  index: 1, x: 201, y: 0.6, prominence: 0.1, label: 'C=O · stretch',
  intensity: 'strong' as const, confidence: 'high' as const, alternatives: [],
}

describe('applyScriptResult', () => {
  it('writes only the modified ordinate and precision, never the measurement', () => {
    const dataset = buildDataset({ data: { abscissa: [200.1, 201.3], ordinateOriginal: [0.1, 0.2], ordinateModified: [], precision: 'float64' } })
    const updated = applyScriptResult(dataset, { id: dataset.id, ordinateModified: [0.5, 0.6], peaks: [], precision: 'float32' })
    expect(updated.data.abscissa).toBe(dataset.data.abscissa)
    expect(updated.data.ordinateOriginal).toBe(dataset.data.ordinateOriginal)
    expect(updated.data.ordinateModified).toEqual([0.5, 0.6])
    expect(updated.data.precision).toBe('float32')
    expect(updated.style).toBe(dataset.style)
    expect(updated.units).toBe(dataset.units)
  })

  it('keeps cropped-out points as NaN gaps aligned with the measurement', () => {
    const dataset = buildDataset()
    const updated = applyScriptResult(dataset, { id: dataset.id, ordinateModified: [Number.NaN, 0.6], peaks: [], precision: 'float32' })
    expect(updated.data.abscissa).toEqual([200, 201])
    expect(Number.isNaN(updated.data.ordinateModified[0])).toBe(true)
  })

  it('rejects results that are not aligned with the sample', () => {
    const dataset = buildDataset()
    expect(() => applyScriptResult(dataset, { id: dataset.id, ordinateModified: [0.1], peaks: [], precision: 'float32' }))
      .toThrow(/1 points but the sample has 2/)
  })

  it('applies assigned peaks only for IR samples', () => {
    const ir = applyScriptResult(buildDataset({ spectrumType: 'ir' }), { id: 'sample-1', ordinateModified: [0.5, 0.6], peaks: [peak], precision: 'float32' })
    expect(ir.peaks.map((item) => item.label)).toEqual(['C=O · stretch'])
    const uv = applyScriptResult(buildDataset(), { id: 'sample-1', ordinateModified: [0.5, 0.6], peaks: [peak], precision: 'float32' })
    expect(uv.peaks).toEqual([])
  })
})
