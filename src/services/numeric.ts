/**
 * [min, max] of the finite values across one or more arrays, or null when there are none.
 * A loop instead of Math.min(...values): spreading large spectra exceeds the call-stack limit.
 */
export function finiteRange(...arrays: ReadonlyArray<readonly number[]>): [number, number] | null {
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const values of arrays) {
    for (const value of values) {
      if (!Number.isFinite(value)) continue
      if (value < low) low = value
      if (value > high) high = value
    }
  }
  return low <= high ? [low, high] : null
}
