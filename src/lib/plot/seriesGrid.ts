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
  generated: boolean[]
  /** Input series index of every row; -1 for generated intermediate rows. */
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
 * series coordinate. Optional intermediate rows are linear blends between neighbouring
 * measured rows, so generated values never leave the measured coordinate interval.
 * Inputs are never mutated.
 */
export function buildSeriesGrid(series: SeriesGridInput[], interpolationSteps = 0): SeriesGrid {
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

  const steps = Math.max(0, Math.floor(interpolationSteps))
  const coordinates: number[] = []
  const z: number[][] = []
  const labels: string[] = []
  const generated: boolean[] = []
  const sources: number[] = []
  ordered.forEach((item, index) => {
    coordinates.push(item.coordinate)
    z.push(measured[index])
    labels.push(item.label)
    generated.push(false)
    sources.push(item.source)
    const next = ordered[index + 1]
    if (!next || steps === 0) return
    for (let step = 1; step <= steps; step += 1) {
      const fraction = step / (steps + 1)
      coordinates.push(item.coordinate + fraction * (next.coordinate - item.coordinate))
      z.push(measured[index].map((value, column) => value + fraction * (measured[index + 1][column] - value)))
      labels.push(`Interpolated between ${item.label} and ${next.label}`)
      generated.push(true)
      sources.push(-1)
    }
  })

  return { x, coordinates, z, labels, generated, sources, resampled }
}
