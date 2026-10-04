export type PeakShape = {
  /** Height above the higher of the two flanking minima (SciPy peak_prominences). */
  prominence: number
  /** Full width at half prominence in abscissa units (SciPy peak_widths, rel_height 0.5). */
  fwhm: number
  /** Band area above the valley-to-valley baseline, in abscissa × ordinate units. */
  area: number
}

function interpolateAbscissa(abscissa: ArrayLike<number>, position: number): number {
  const lower = Math.floor(position)
  const upper = Math.min(lower + 1, abscissa.length - 1)
  const fraction = position - lower
  return abscissa[lower] + (abscissa[upper] - abscissa[lower]) * fraction
}

/** Interpolated crossings of `level` on both flanks, bounded by the prominence bases. */
function crossings(signal: number[], index: number, leftBase: number, rightBase: number, level: number): [number, number] {
  let left = index
  while (left > leftBase && level < signal[left]) left -= 1
  let leftPosition = left
  if (signal[left] < level) leftPosition += (level - signal[left]) / (signal[left + 1] - signal[left])

  let right = index
  while (right < rightBase && level < signal[right]) right += 1
  let rightPosition = right
  if (signal[right] < level) rightPosition -= (level - signal[right]) / (signal[right - 1] - signal[right])

  return [leftPosition, rightPosition]
}

/**
 * Shape metrics of one peak computed from the current ordinate, so they follow
 * every unit conversion and processing step. Minima are measured on −y, matching
 * the detection. `neighbours` are the indices of the adjacent peaks, which bound
 * the integration. Returns null when the point is not a local extremum.
 */
export function peakShape(
  abscissa: ArrayLike<number>,
  ordinate: ArrayLike<number>,
  index: number,
  mode: 'maxima' | 'minima',
  neighbours: { previous?: number; next?: number } = {},
): PeakShape | null {
  const n = Math.min(abscissa.length, ordinate.length)
  if (index <= 0 || index >= n - 1 || !Number.isFinite(ordinate[index])) return null

  const sign = mode === 'minima' ? -1 : 1
  let floor = Infinity
  for (let i = 0; i < n; i += 1) if (Number.isFinite(ordinate[i])) floor = Math.min(floor, sign * ordinate[i])
  // Cropped points are NaN; like the detection they become the floor value and never form a peak.
  const signal = Array.from({ length: n }, (_, i) => (Number.isFinite(ordinate[i]) ? sign * ordinate[i] : floor))
  const top = signal[index]

  let leftBase = index
  let leftMin = top
  for (let i = index; i >= 0 && signal[i] <= top; i -= 1) {
    if (signal[i] < leftMin) { leftMin = signal[i]; leftBase = i }
  }
  let rightBase = index
  let rightMin = top
  for (let i = index; i < n && signal[i] <= top; i += 1) {
    if (signal[i] < rightMin) { rightMin = signal[i]; rightBase = i }
  }
  const prominence = top - Math.max(leftMin, rightMin)
  if (!(prominence > 0)) return null

  const [halfLeft, halfRight] = crossings(signal, index, leftBase, rightBase, top - prominence / 2)
  const fwhm = Math.abs(interpolateAbscissa(abscissa, halfRight) - interpolateAbscissa(abscissa, halfLeft))

  // Valley-to-valley integration: each side ends at the lowest point before the
  // neighbouring peak (or the prominence base), under a straight baseline.
  const valley = (from: number, to: number): number => {
    let best = from
    const step = to < from ? -1 : 1
    for (let i = from; i !== to + step; i += step) if (signal[i] < signal[best]) best = i
    return best
  }
  const left = valley(index, Math.max(leftBase, (neighbours.previous ?? -1) + 1))
  const right = valley(index, Math.min(rightBase, (neighbours.next ?? n) - 1))
  let area = 0
  if (right > left) {
    const baseline = (i: number) => signal[left] + (signal[right] - signal[left]) * (abscissa[i] - abscissa[left]) / (abscissa[right] - abscissa[left])
    for (let i = left + 1; i <= right; i += 1) {
      const a = Math.max(signal[i - 1] - baseline(i - 1), 0)
      const b = Math.max(signal[i] - baseline(i), 0)
      area += Math.abs(abscissa[i] - abscissa[i - 1]) * (a + b) / 2
    }
  }

  return { prominence, fwhm, area }
}
