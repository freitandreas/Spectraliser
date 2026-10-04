import { describe, expect, it } from 'vitest'
import { ExecutionCache, scriptExecutionKey } from '../src/state/executionCache'
import { buildDataset } from './fixtures'

const files = { 'main.py': 'print(1)', 'processing.py': 'x = 1', 'samples.json': '[]' }

describe('scriptExecutionKey', () => {
  it('ignores display metadata and samples.json', () => {
    const base = buildDataset()
    const key = scriptExecutionKey(base, files, 'float32')
    const restyled = {
      ...base,
      name: 'renamed.csv',
      style: { ...base.style, label: 'Other', lineColor: '#000000', lineWidth: 4, visible: false },
      peaks: [{ id: 'p', index: 0, x: 200, y: 0.1, label: 'manual', source: 'manual' as const, enabled: true }],
    }
    expect(scriptExecutionKey(restyled, { ...files, 'samples.json': '[{"label":"Other"}]' }, 'float32')).toBe(key)
  })

  it('changes for every script input', () => {
    const base = buildDataset()
    const key = scriptExecutionKey(base, files, 'float32')
    const variants = [
      scriptExecutionKey(base, files, 'float64'),
      scriptExecutionKey(base, { ...files, 'processing.py': 'x = 2' }, 'float32'),
      scriptExecutionKey({ ...base, units: { ...base.units, x: 'cm⁻¹', y: 'Absorbance' } }, files, 'float32'),
      scriptExecutionKey({ ...base, pipeline: [] }, files, 'float32'),
      scriptExecutionKey({ ...base, peakDetection: { prominence: 0.2, minDistance: 1, minHeight: null, mode: 'maxima' } }, files, 'float32'),
      scriptExecutionKey({ ...base, data: { ...base.data, ordinateOriginal: [...base.data.ordinateOriginal] } }, files, 'float32'),
      scriptExecutionKey({ ...base, spectrumType: 'ir' }, files, 'float32'),
    ]
    for (const variant of variants) expect(variant).not.toBe(key)
    expect(new Set(variants).size).toBe(variants.length)
  })
})

describe('ExecutionCache', () => {
  it('tracks, forgets and prunes applied inputs', () => {
    const cache = new ExecutionCache()
    cache.remember('a', 'k1')
    cache.remember('b', 'k2')
    expect(cache.isCurrent('a', 'k1')).toBe(true)
    expect(cache.isCurrent('a', 'k2')).toBe(false)
    cache.forget('a')
    expect(cache.isCurrent('a', 'k1')).toBe(false)
    cache.retainOnly(['a'])
    expect(cache.isCurrent('b', 'k2')).toBe(false)
  })
})
