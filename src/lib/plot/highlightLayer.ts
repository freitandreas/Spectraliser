import type { SpectrumDataset } from '../../types/project'
import type { PlotMode } from '../../services/startupPreferences'
import { unitSuffix } from './plotTraces'

/**
 * Transient link highlighting (explorer hover, peak-table hover, data-table hover). It is kept out
 * of the base figure so updating it never recomputes the series grid or redraws heatmaps/surfaces:
 * 2D modes use layout shapes/annotations (a cheap Plotly relayout), the 3D scene uses a few fixed
 * slot traces that are restyled in place.
 */
export interface HighlightState {
  highlightedDatasetId: string | null
  hoveredPeakId: string | null
  /** Point hovered in a linked view (e.g. the data table); null while the plot itself is hovered. */
  hoverPoint: { datasetId: string; pointIndex: number } | null
}

export interface HighlightContext {
  mode: PlotMode
  datasets: SpectrumDataset[]
  /** Series coordinate of every dataset drawn on a grid (heatmap/3D). */
  coordinates: Map<string, number>
  /** Abscissa interval of the grid, which bounds every guide. */
  xRange: [number, number] | null
  selectedSpectrumId: string | null
  /** Dataset whose peaks are shown, if any. */
  peaksDatasetId: string | null
  baseShapes: Array<Record<string, unknown>>
  baseAnnotations: Array<Record<string, unknown>>
  /** Index of the first fixed 3D highlight slot trace. */
  slotStart: number
  /** Visual lift of 3D highlights above the surface, so they are not hidden inside it. */
  sceneLift: number
}

export const EMPTY_HIGHLIGHT: HighlightState = { highlightedDatasetId: null, hoveredPeakId: null, hoverPoint: null }

export const SCENE_SLOT_COUNT = 3

/** Flat attribute set shared by every slot, so all slots can be restyled in one Plotly call. */
export interface SceneSlot {
  x: number[]
  y: number[]
  z: number[]
  text: string[]
  visible: boolean
  mode: string
  'line.color': string
  'line.width': number
  'line.dash': string
  'marker.size': number
  'marker.color': string
  'marker.symbol': string
}

const GUIDE_SHADOW = 'rgba(10,10,12,0.85)'

function findDataset(context: HighlightContext, id: string | null): SpectrumDataset | null {
  return id ? context.datasets.find((dataset) => dataset.id === id) ?? null : null
}

function inRange(value: number, range: [number, number] | null): boolean {
  return Number.isFinite(value) && (!range || (value >= range[0] && value <= range[1]))
}

/** Horizontal guide at a series coordinate across the heatmap; a dark underlay keeps it visible on any colour. */
export function guideShapes(
  coordinate: number,
  range: [number, number],
  color: string,
  selected: boolean,
): Array<Record<string, unknown>> {
  const line = { type: 'line', xref: 'x', yref: 'y', x0: range[0], x1: range[1], y0: coordinate, y1: coordinate, layer: 'above' }
  return [
    { ...line, line: { color: GUIDE_SHADOW, width: selected ? 5 : 4 } },
    { ...line, line: { color, width: selected ? 2.5 : 2, dash: selected ? 'solid' : 'dash' } },
  ]
}

function ringShape(x: number, y: number, color: string, radius: number): Record<string, unknown> {
  return {
    type: 'circle',
    xref: 'x',
    yref: 'y',
    xsizemode: 'pixel',
    ysizemode: 'pixel',
    xanchor: x,
    yanchor: y,
    x0: -radius,
    x1: radius,
    y0: -radius,
    y1: radius,
    line: { color, width: 2 },
    layer: 'above',
  }
}

function peakPosition(context: HighlightContext, state: HighlightState): { dataset: SpectrumDataset; x: number; y: number } | null {
  const dataset = findDataset(context, context.peaksDatasetId)
  const peak = dataset?.peaks.find((item) => item.id === state.hoveredPeakId)
  if (!dataset || !peak || !inRange(peak.x, context.xRange)) return null
  if (context.mode === 'overlay') return { dataset, x: peak.x, y: dataset.data.ordinateModified[peak.index] ?? peak.y }
  const coordinate = context.coordinates.get(dataset.id)
  return coordinate === undefined ? null : { dataset, x: peak.x, y: coordinate }
}

function hoverPosition(context: HighlightContext, state: HighlightState): { dataset: SpectrumDataset; x: number; value: number } | null {
  const point = state.hoverPoint
  const dataset = findDataset(context, point?.datasetId ?? null)
  if (!dataset || !point) return null
  const x = dataset.data.abscissa[point.pointIndex]
  const value = dataset.data.ordinateModified[point.pointIndex]
  if (x === undefined || value === undefined || !inRange(x, context.xRange)) return null
  return { dataset, x, value }
}

/** Shapes and annotations of the 2D modes (overlay and heatmap), including the static base layer. */
export function highlightShapes(
  context: HighlightContext,
  state: HighlightState,
): { shapes: Array<Record<string, unknown>>; annotations: Array<Record<string, unknown>> } {
  const shapes = [...context.baseShapes]
  const annotations = [...context.baseAnnotations]

  if (context.mode === 'heatmap' && context.xRange) {
    const highlighted = findDataset(context, state.highlightedDatasetId)
    const coordinate = highlighted ? context.coordinates.get(highlighted.id) : undefined
    if (highlighted && coordinate !== undefined && highlighted.id !== context.selectedSpectrumId) {
      shapes.unshift(...guideShapes(coordinate, context.xRange, highlighted.style.lineColor, false))
    }
    const hover = hoverPosition(context, state)
    const hoverCoordinate = hover ? context.coordinates.get(hover.dataset.id) : undefined
    if (hover && hoverCoordinate !== undefined) {
      shapes.push(ringShape(hover.x, hoverCoordinate, '#f8f8f8', 5))
      annotations.push({
        x: hover.x,
        y: hoverCoordinate,
        text: `${hover.x.toPrecision(6)}${unitSuffix(hover.dataset.units.x)} · ${hover.value.toPrecision(6)}${unitSuffix(hover.dataset.units.y)}`,
        showarrow: false,
        yanchor: 'top',
        yshift: -10,
        font: { color: '#f8f8f8', size: 11 },
        bgcolor: 'rgba(10,10,12,0.75)',
      })
    }
  }

  const peak = peakPosition(context, state)
  if (peak) shapes.push(ringShape(peak.x, peak.y, '#f8f8f8', 10))
  return { shapes, annotations }
}

function hiddenSlot(): SceneSlot {
  return {
    x: [],
    y: [],
    z: [],
    text: [],
    visible: false,
    mode: 'markers',
    'line.color': '#ffffff',
    'line.width': 1,
    'line.dash': 'solid',
    'marker.size': 1,
    'marker.color': '#ffffff',
    'marker.symbol': 'circle',
  }
}

/** Fixed 3D slots: [hovered explorer series guide, hovered peak, linked hover point]. */
export function sceneSlots(context: HighlightContext, state: HighlightState): SceneSlot[] {
  const slots = [hiddenSlot(), hiddenSlot(), hiddenSlot()]
  const lift = context.sceneLift

  const highlighted = findDataset(context, state.highlightedDatasetId)
  const coordinate = highlighted ? context.coordinates.get(highlighted.id) : undefined
  if (highlighted && coordinate !== undefined && highlighted.id !== context.selectedSpectrumId) {
    const indices = highlighted.data.abscissa.flatMap((x, index) => (inRange(x, context.xRange) ? [index] : []))
    if (indices.length > 0) {
      slots[0] = {
        ...hiddenSlot(),
        x: indices.map((index) => highlighted.data.abscissa[index]!),
        y: indices.map(() => coordinate),
        z: indices.map((index) => highlighted.data.ordinateModified[index]! + lift),
        visible: true,
        mode: 'lines',
        'line.color': highlighted.style.lineColor,
        'line.width': 5,
        'line.dash': 'dash',
      }
    }
  }

  const peak = peakPosition(context, state)
  if (peak) {
    const source = peak.dataset.peaks.find((item) => item.id === state.hoveredPeakId)!
    slots[1] = {
      ...hiddenSlot(),
      x: [peak.x],
      y: [peak.y],
      z: [(peak.dataset.data.ordinateModified[source.index] ?? source.y) + lift],
      visible: true,
      'marker.size': 10,
      'marker.color': '#f8f8f8',
      'marker.symbol': 'diamond-open',
    }
  }

  const hover = hoverPosition(context, state)
  const hoverCoordinate = hover ? context.coordinates.get(hover.dataset.id) : undefined
  if (hover && hoverCoordinate !== undefined) {
    slots[2] = {
      ...hiddenSlot(),
      x: [hover.x],
      y: [hoverCoordinate],
      z: [hover.value + lift],
      text: [`${hover.x.toPrecision(6)}${unitSuffix(hover.dataset.units.x)} · ${hover.value.toPrecision(6)}${unitSuffix(hover.dataset.units.y)}`],
      visible: true,
      mode: 'markers+text',
      'marker.size': 5,
      'marker.color': '#f8f8f8',
      'marker.symbol': 'circle',
    }
  }
  return slots
}

/** Full trace definition of a slot for the initial render. */
export function sceneSlotTrace(slot: SceneSlot): Record<string, unknown> {
  return {
    type: 'scatter3d',
    hoverinfo: 'skip',
    showlegend: false,
    x: slot.x,
    y: slot.y,
    z: slot.z,
    text: slot.text,
    visible: slot.visible,
    mode: slot.mode,
    textposition: 'top center',
    textfont: { color: '#f8f8f8', size: 11 },
    line: { color: slot['line.color'], width: slot['line.width'], dash: slot['line.dash'] },
    marker: { size: slot['marker.size'], color: slot['marker.color'], symbol: slot['marker.symbol'] },
  }
}

/** Per-trace restyle payload for the given slots (Plotly expects one value per updated trace). */
export function sceneSlotRestyle(slots: SceneSlot[]): Record<string, unknown[]> {
  const update: Record<string, unknown[]> = {}
  for (const key of Object.keys(slots[0] ?? {}) as Array<keyof SceneSlot>) {
    update[key] = slots.map((slot) => slot[key])
  }
  return update
}
