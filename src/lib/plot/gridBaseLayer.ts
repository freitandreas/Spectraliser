import type { SpectrumDataset } from '../../types/project'
import { unitSuffix } from './plotTraces'
import { guideShapes } from './highlightLayer'
import type { PeakTraceLink } from './plotLinks'

export interface GridBaseInput {
  datasets: SpectrumDataset[]
  coordinates: Map<string, number>
  /** Abscissa interval covered by the grid. */
  xRange: [number, number]
  selectedSpectrumId: string | null
  showPeaks: boolean
  /** Index of the first trace produced here within the full figure. */
  traceOffset: number
  /** `scene` draws on the WebGL 3D surface (z = ordinate). */
  target: 'cartesian' | 'scene'
  /** Visual lift of 3D markers above the surface so they are not hidden in it; hover shows true values. */
  sceneLift?: number
}

export interface GridBase {
  traces: Array<Record<string, unknown>>
  shapes: Array<Record<string, unknown>>
  annotations: Array<Record<string, unknown>>
  peaks: PeakTraceLink | null
}

function inRange(value: number, [low, high]: [number, number]): boolean {
  return Number.isFinite(value) && value >= low && value <= high
}

/**
 * Selection-dependent layer of heatmap and 3D figures: the selected series guide and its peak
 * markers at the series coordinate. It changes only with selection, never with hover, so the
 * expensive grid trace is not redrawn while the user moves between linked views.
 */
export function buildGridBase(input: GridBaseInput): GridBase {
  const result: GridBase = { traces: [], shapes: [], annotations: [], peaks: null }
  const scene = input.target === 'scene'
  const lift = scene ? input.sceneLift ?? 0 : 0
  const dataset = input.datasets.find((item) => item.id === input.selectedSpectrumId)
  const coordinate = dataset ? input.coordinates.get(dataset.id) : undefined
  if (!dataset || coordinate === undefined || !Number.isFinite(coordinate)) return result

  if (!scene) {
    result.shapes.push(...guideShapes(coordinate, input.xRange, dataset.style.lineColor, true))
  } else {
    const indices = dataset.data.abscissa.flatMap((x, index) => (inRange(x, input.xRange) ? [index] : []))
    if (indices.length > 0) {
      result.traces.push({
        x: indices.map((index) => dataset.data.abscissa[index]),
        y: indices.map(() => coordinate),
        z: indices.map((index) => dataset.data.ordinateModified[index] + lift),
        type: 'scatter3d',
        mode: 'lines',
        name: dataset.style.label,
        showlegend: false,
        hoverinfo: 'skip',
        line: { color: dataset.style.lineColor, width: 7 },
      })
    }
  }

  const peaks = input.showPeaks ? dataset.peaks.filter((peak) => inRange(peak.x, input.xRange)) : []
  if (peaks.length === 0) return result

  result.peaks = { traceIndex: input.traceOffset + result.traces.length, datasetId: dataset.id, peakIds: peaks.map((peak) => peak.id) }
  const peakValues = peaks.map((peak) => dataset.data.ordinateModified[peak.index] ?? peak.y)
  const peakHover = `%{x:.6g}${unitSuffix(dataset.units.x)}<br>%{customdata:.6g}${unitSuffix(dataset.units.y)}<extra>${dataset.style.label} peak</extra>`
  const marker = { symbol: 'diamond', color: dataset.style.lineColor, line: { color: '#f8f8f8', width: scene ? 1 : 1.5 } }
  if (scene) {
    // 3D scenes have no annotation layer for this, so the position labels are marker text.
    result.traces.push({
      x: peaks.map((peak) => peak.x),
      y: peaks.map(() => coordinate),
      z: peakValues.map((value) => value + lift),
      customdata: peakValues,
      text: peaks.map((peak) => peak.x.toFixed(2)),
      type: 'scatter3d',
      mode: 'markers+text',
      textposition: 'top center',
      textfont: { color: '#f8f8f8', size: 11 },
      name: 'Peaks',
      showlegend: false,
      marker: { ...marker, size: 5 },
      hovertemplate: peakHover,
    })
    return result
  }
  result.traces.push({
    x: peaks.map((peak) => peak.x),
    y: peaks.map(() => coordinate),
    customdata: peakValues,
    type: 'scatter',
    mode: 'markers',
    name: 'Peaks',
    showlegend: false,
    marker: { ...marker, size: 9 },
    hovertemplate: peakHover,
  })
  result.annotations = peaks.map((peak) => ({
    x: peak.x,
    y: coordinate,
    text: peak.x.toFixed(2),
    textangle: -90,
    showarrow: false,
    xanchor: 'center',
    yanchor: 'bottom',
    yshift: 10,
    font: { color: '#f8f8f8', size: 11 },
    bgcolor: 'rgba(10,10,12,0.55)',
  }))
  return result
}
