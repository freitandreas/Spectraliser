import type { SpectrumDataset } from '../../types/project'

/** Maps a Plotly trace back to measured dataset points (overlay mode: point i is dataset point i). */
export interface SeriesTraceLink {
  traceIndex: number
  datasetId: string
}

export interface PeakTraceLink {
  traceIndex: number
  datasetId: string
  peakIds: string[]
}

/** Maps heatmap/surface grid rows back to datasets. */
export interface GridLink {
  traceIndex: number
  coordinates: number[]
  rowDatasetIds: Array<string | null>
}

export interface PlotLinks {
  seriesTraces: SeriesTraceLink[]
  peakTrace: PeakTraceLink | null
  grid: GridLink | null
}

export interface DatasetPoint {
  datasetId: string
  pointIndex: number
}

/** Index of the value closest to `target`; works for unsorted arrays and ignores non-finite values. */
export function nearestIndex(values: ArrayLike<number>, target: number): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < values.length; index += 1) {
    const distance = Math.abs(values[index] - target)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return best
}

/**
 * Resolves a hovered/clicked grid cell to the measured point it shows. The row is identified by
 * its series coordinate, the point by the nearest measured abscissa of that dataset, so resampled
 * grids still link to real measurements.
 */
export function resolveGridPoint(
  link: GridLink,
  datasets: SpectrumDataset[],
  x: number | undefined,
  y: number | undefined,
): DatasetPoint | null {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null
  const row = nearestIndex(link.coordinates, y)
  const datasetId = row >= 0 ? link.rowDatasetIds[row] : null
  const dataset = datasetId ? datasets.find((item) => item.id === datasetId) : undefined
  if (!dataset) return null
  const pointIndex = nearestIndex(dataset.data.abscissa, x)
  return pointIndex >= 0 ? { datasetId: dataset.id, pointIndex } : null
}

export function pointKey(point: DatasetPoint | null): string {
  return point ? `${point.datasetId}:${point.pointIndex}` : 'none'
}
