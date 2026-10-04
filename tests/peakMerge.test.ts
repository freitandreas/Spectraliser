import { describe, expect, it } from 'vitest'
import { mergeAssignedPeaks, shouldApplyAssignedPeaks } from '../src/state/peakMerge'
import type { Peak } from '../src/types/project'

describe('IR table labeling', () => {
  it('updates automatic labels and keeps a manually edited label and peak ID', () => {
    const existing: Peak[] = [{
      id: 'p1', index: 1, x: 1740, y: 0.8, label: 'my carbonyl',
      labelEdited: true, source: 'auto', enabled: true,
    }]
    const assigned = mergeAssignedPeaks(existing, [{
      index: 1, x: 1740, y: 1, prominence: 0.8, label: 'Ester · C=O',
      intensity: 'strong', confidence: 'high', alternatives: [],
    }])
    expect(assigned[0]).toMatchObject({ id: 'p1', label: 'my carbonyl', y: 1, intensity: 'strong' })
  })

  it('keeps detected peaks when the script returns no assignments', () => {
    const detected: Peak[] = [{
      id: 'p1', index: 1, x: 1740, y: 0.8, label: '1740.00',
      source: 'auto', enabled: true,
    }]
    expect(shouldApplyAssignedPeaks([], 'ir')).toBe(false)
    expect(shouldApplyAssignedPeaks(undefined, 'ir')).toBe(false)
    expect(shouldApplyAssignedPeaks([{
      index: 1, x: 1740, y: 1, prominence: 0.8, label: 'Ester · C=O',
      intensity: 'strong', confidence: 'high', alternatives: [],
    }], 'ir')).toBe(true)
    expect(detected).toHaveLength(1)
  })

  it('never applies assignments to non-IR spectra', () => {
    expect(shouldApplyAssignedPeaks([{
      index: 1, x: 1740, y: 1, prominence: 0.8, label: 'Ester · C=O',
      intensity: 'strong', confidence: 'high', alternatives: [],
    }], 'uv-vis')).toBe(false)
  })
})
