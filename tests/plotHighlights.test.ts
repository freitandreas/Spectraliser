import { describe, expect, it } from 'vitest'
import type { SpectrumDataset } from '../src/types/project'
import { buildPlotFigure } from '../src/lib/plot/plotFigure'
import { singleSeriesView } from '../src/lib/plot/singleSeriesView'
import { EMPTY_HIGHLIGHT, highlightShapes, SCENE_SLOT_COUNT, sceneSlotRestyle, sceneSlots } from '../src/lib/plot/highlightLayer'
import { nearestIndex, resolveGridPoint } from '../src/lib/plot/plotLinks'
import { DEFAULT_STARTUP_PREFERENCES, type PlotStylePreferences } from '../src/services/startupPreferences'

function dataset(id: string, label: string, abscissa: number[], peaks: SpectrumDataset['peaks'] = []): SpectrumDataset {
  const ordinate = abscissa.map((_, index) => index + 1)
  return {
    id,
    name: `${id}.csv`,
    sourcePath: `${id}.csv`,
    spectrumType: 'uv-vis',
    units: { x: 'nm', y: '', xQuantity: 'Wavelength', yQuantity: 'Absorbance' },
    data: { abscissa, ordinateOriginal: [...ordinate], ordinateModified: [...ordinate], precision: 'float64' },
    pipeline: [],
    style: { lineColor: id === 'a' ? '#ff0000' : '#00ff00', lineWidth: 2, scatterSymbol: 'circle', label },
    peaks,
  }
}

const peak = (id: string, index: number, x: number): SpectrumDataset['peaks'][number] =>
  ({ id, index, x, y: index + 1, source: 'auto' }) as SpectrumDataset['peaks'][number]

const style = (patch: Partial<PlotStylePreferences>): PlotStylePreferences => ({ ...DEFAULT_STARTUP_PREFERENCES.plotStyle, ...patch })

const a = dataset('a', 't = 0 s', [350, 400, 450, 500], [peak('p1', 1, 400), peak('p-out', 0, 350)])
const b = dataset('b', 't = 1 min', [400, 450, 500, 550])

describe('heatmap highlighting', () => {
  const heatmap = style({ plotMode: 'heatmap' })

  it('draws the selected series as a guide shape at its time coordinate across the grid range', () => {
    const figure = buildPlotFigure({ datasets: [a, b], plotStyle: heatmap, selectedSpectrumId: 'a' })
    const shapes = figure.layout.shapes as Array<Record<string, unknown>>
    expect(shapes).toHaveLength(2)
    expect(shapes[1]).toMatchObject({ type: 'line', x0: 400, x1: 500, y0: 0, y1: 0, line: { color: '#ff0000', dash: 'solid' } })
    expect(figure.links.grid).toEqual({ traceIndex: 0, coordinates: [0, 60], rowDatasetIds: ['a', 'b'] })
    expect(figure.links.seriesTraces).toEqual([])
  })

  it('marks only in-range peaks at the series coordinate in a static peak trace', () => {
    const figure = buildPlotFigure({ datasets: [a, b], plotStyle: heatmap, selectedSpectrumId: 'a' })
    expect(figure.links.peakTrace).toEqual({ traceIndex: 1, datasetId: 'a', peakIds: ['p1'] })
    expect(figure.traces[1]).toMatchObject({ x: [400], y: [0], customdata: [2], marker: { size: 9 } })
    expect(figure.layout.annotations).toMatchObject([{ x: 400, y: 0, text: '400.00' }])
  })

  it('adds hover highlights as shapes only, leaving the traces untouched', () => {
    const plain = buildPlotFigure({ datasets: [a, b], plotStyle: heatmap, selectedSpectrumId: 'a' })
    const state = { highlightedDatasetId: 'b', hoveredPeakId: 'p1', hoverPoint: { datasetId: 'b', pointIndex: 1 } }
    const layer = highlightShapes(plain.highlight, state)
    expect(layer.shapes[1]).toMatchObject({ y0: 60, line: { dash: 'dash', color: '#00ff00' } })
    expect(layer.shapes.filter((shape) => shape.type === 'circle')).toMatchObject([
      { xanchor: 450, yanchor: 60, xsizemode: 'pixel' },
      { xanchor: 400, yanchor: 0 },
    ])
    expect(layer.annotations).toHaveLength(2)
    const highlighted = buildPlotFigure({ datasets: [a, b], plotStyle: heatmap, selectedSpectrumId: 'a', ...state })
    expect(highlighted.traces).toEqual(plain.traces)
    expect(highlighted.layout.shapes).toEqual(layer.shapes)
  })

  it('reuses the resampled grid while data and coordinates are unchanged', () => {
    const datasets = [a, b]
    const first = buildPlotFigure({ datasets, plotStyle: heatmap, selectedSpectrumId: 'a' })
    const second = buildPlotFigure({ datasets, plotStyle: heatmap, selectedSpectrumId: 'b', highlightedDatasetId: 'a' })
    expect((second.traces[0] as { z: unknown }).z).toBe((first.traces[0] as { z: unknown }).z)
    const third = buildPlotFigure({ datasets: [a, b], plotStyle: heatmap })
    expect((third.traces[0] as { z: unknown }).z).not.toBe((first.traces[0] as { z: unknown }).z)
  })

  it('hides peak markers when peaks are disabled', () => {
    const figure = buildPlotFigure({ datasets: [a, b], plotStyle: heatmap, selectedSpectrumId: 'a', showPeaks: false })
    expect(figure.links.peakTrace).toBeNull()
    expect(figure.layout.annotations).toEqual([])
  })

  it('links overlay traces one-to-one with dataset points and rings the hovered peak', () => {
    const figure = buildPlotFigure({ datasets: [a, b], plotStyle: style({ plotMode: 'overlay' }), selectedSpectrumId: 'a', hoveredPeakId: 'p1' })
    expect(figure.links.seriesTraces).toEqual([
      { traceIndex: 0, datasetId: 'a' },
      { traceIndex: 1, datasetId: 'b' },
    ])
    expect(figure.links.peakTrace).toEqual({ traceIndex: 2, datasetId: 'a', peakIds: ['p1', 'p-out'] })
    expect(figure.layout.shapes).toMatchObject([{ type: 'circle', xanchor: 400, yanchor: 2 }])
  })
})

describe('grid hover resolution', () => {
  it('maps a grid cell to the nearest measured point of the row dataset', () => {
    const link = { traceIndex: 0, coordinates: [0, 30, 60], rowDatasetIds: ['a', null, 'b'] }
    expect(resolveGridPoint(link, [a, b], 452, 58)).toEqual({ datasetId: 'b', pointIndex: 1 })
    expect(resolveGridPoint(link, [a, b], 399, 2)).toEqual({ datasetId: 'a', pointIndex: 1 })
    expect(resolveGridPoint(link, [a, b], 450, 31)).toBeNull()
    expect(resolveGridPoint(link, [a, b], undefined, 0)).toBeNull()
  })

  it('finds the nearest index in unsorted values', () => {
    expect(nearestIndex([500, 400, 300], 390)).toBe(1)
    expect(nearestIndex([], 1)).toBe(-1)
  })
})

describe('3D surface highlighting', () => {
  const surface = style({ plotMode: 'surface3d' })

  it('draws the selected series as a static 3D line and keeps fixed highlight slots', () => {
    const figure = buildPlotFigure({ datasets: [a, b], plotStyle: surface, selectedSpectrumId: 'a' })
    const selected = figure.traces[1] as { type: string; y: number[]; z: number[]; hoverinfo: string }
    expect(selected).toMatchObject({ type: 'scatter3d', y: [0, 0, 0], hoverinfo: 'skip' })
    expect(selected.z[0]).toBeGreaterThanOrEqual(2)
    expect(figure.links.peakTrace).toEqual({ traceIndex: 2, datasetId: 'a', peakIds: ['p1'] })
    expect(figure.highlight.slotStart).toBe(3)
    expect(figure.traces).toHaveLength(3 + SCENE_SLOT_COUNT)
    expect(figure.traces.slice(3).every((trace) => trace.visible === false)).toBe(true)
  })

  it('fills slots for the hovered series, peak and linked point with lifted true values', () => {
    const figure = buildPlotFigure({ datasets: [a, b], plotStyle: surface, selectedSpectrumId: 'a' })
    const slots = sceneSlots(figure.highlight, { highlightedDatasetId: 'b', hoveredPeakId: 'p1', hoverPoint: { datasetId: 'b', pointIndex: 2 } })
    expect(slots[0]).toMatchObject({ visible: true, mode: 'lines', x: [400, 450, 500], y: [60, 60, 60], 'line.dash': 'dash' })
    expect(slots[1]).toMatchObject({ visible: true, x: [400], y: [0] })
    expect(slots[1].z[0]).toBeGreaterThanOrEqual(2)
    expect(slots[2]).toMatchObject({ visible: true, x: [500], y: [60] })
    const update = sceneSlotRestyle([slots[0], slots[2]])
    expect(update.x).toEqual([[400, 450, 500], [500]])
    expect(update.visible).toEqual([true, true])
  })

  it('does not highlight the selected series twice', () => {
    const figure = buildPlotFigure({ datasets: [a, b], plotStyle: surface, selectedSpectrumId: 'a' })
    expect(sceneSlots(figure.highlight, { ...EMPTY_HIGHLIGHT, highlightedDatasetId: 'a' })[0].visible).toBe(false)
  })
})

describe('colour bars', () => {
  it('shows a titled colour scale for heatmaps like the 3D surface', () => {
    for (const plotMode of ['heatmap', 'surface3d'] as const) {
      const figure = buildPlotFigure({ datasets: [a, b], plotStyle: style({ plotMode, axisLabelFormat: 'fraction' }) })
      const trace = figure.traces[0] as { showscale?: boolean; colorbar: { title: { text: string } } }
      expect(trace.showscale).not.toBe(false)
      expect(trace.colorbar.title.text).toContain('Absorbance')
      expect(trace.colorbar.title.text.startsWith('$')).toBe(false)
    }
  })
})

describe('single-series view', () => {
  it('turns any plot mode into a 2D spectrum of one series with its peaks', () => {
    const base = style({ plotMode: 'surface3d', seriesInterpolation: { enabled: true, steps: 3 } })
    const view = singleSeriesView(a, base)
    expect(view.plotStyle.plotMode).toBe('overlay')
    expect(view.plotStyle.seriesInterpolation.enabled).toBe(false)
    expect(base.plotMode).toBe('surface3d')
    const figure = buildPlotFigure({ ...view })
    expect(figure.mode).toBe('overlay')
    expect(figure.notices).toEqual([])
    expect(figure.traces).toHaveLength(2)
    expect(figure.links.peakTrace).toEqual({ traceIndex: 1, datasetId: 'a', peakIds: ['p1', 'p-out'] })
  })
})
