export interface SeriesGridInput {
  label: string
  coordinate: number
  abscissa: number[]
  ordinate: number[]
}

export interface SeriesGrid {
  x: number[]
  coordinates: number[]
  z: number[][]
  labels: string[]
  /** Input series index of every row. */
  sources: number[]
  /** True when at least one series had to be resampled onto the shared abscissa. */
  resampled: boolean
}

function sortedPairs(abscissa: number[], ordinate: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  const length = Math.min(abscissa.length, ordinate.length)
  for (let index = 0; index < length; index += 1) {
    const x = abscissa[index]
    const y = ordinate[index]
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y])
  }
  return pairs.sort((left, right) => left[0] - right[0])
}

function sampleLinear(pairs: Array<[number, number]>, x: number): number {
  let low = 0
  let high = pairs.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (pairs[middle][0] <= x) low = middle
    else high = middle
  }
  const [x0, y0] = pairs[low]
  const [x1, y1] = pairs[high]
  if (x1 === x0) return y0
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
}

function sameAxis(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * Places series on a shared abscissa (the overlap of all measured ranges) ordered by
 * series coordinate. Only measured series become rows; heatmap smoothing and the surface
 * mesh interpolate visually between them. Inputs are never mutated.
 */
export function buildSeriesGrid(series: SeriesGridInput[]): SeriesGrid {
  if (series.length < 2) throw new Error('At least two series are required.')
  const ordered = series.map((item, source) => ({ ...item, source })).sort((left, right) => left.coordinate - right.coordinate)
  const pairsBySeries = ordered.map((item) => sortedPairs(item.abscissa, item.ordinate))
  if (pairsBySeries.some((pairs) => pairs.length < 2)) {
    throw new Error('Every series needs at least two finite points.')
  }

  const lower = Math.max(...pairsBySeries.map((pairs) => pairs[0][0]))
  const upper = Math.min(...pairsBySeries.map((pairs) => pairs[pairs.length - 1][0]))
  if (!(upper > lower)) throw new Error('The series do not share an overlapping abscissa range.')

  const x = pairsBySeries[0].map(([value]) => value).filter((value) => value >= lower && value <= upper)
  const resampled = pairsBySeries.some((pairs) => !sameAxis(pairs.map(([value]) => value), pairsBySeries[0].map(([value]) => value)))
  const measured = pairsBySeries.map((pairs) => x.map((value) => sampleLinear(pairs, value)))

  return {
    x,
    coordinates: ordered.map((item) => item.coordinate),
    z: measured,
    labels: ordered.map((item) => item.label),
    sources: ordered.map((item) => item.source),
    resampled,
  }
}
