import { describe, expect, it } from 'vitest'
import { finiteRange } from '../src/services/numeric'

describe('finiteRange', () => {
  it('handles spectra too large for Math.min(...values)', () => {
    const values = Array.from({ length: 300_000 }, (_, index) => index - 1000)
    expect(finiteRange(values)).toEqual([-1000, 298_999])
  })

  it('ignores non-finite values and spans several arrays', () => {
    expect(finiteRange([NaN, 2, Infinity], [-3, NaN])).toEqual([-3, 2])
    expect(finiteRange([NaN], [])).toBeNull()
  })
})
