import type { SpectrumDataset } from '../../types/project'
import type { PlotMode, PlotStylePreferences } from '../../services/startupPreferences'
import { axisLabel, isNormalised, isPercentUnit, type AxisLabelFormat, type AxisLabelTarget } from '../../services/spectrumPresets'
import type { QuantityNotation } from '../../services/quantityNotation'
import { resolveSeriesAxis, type ResolvedSeriesCoordinates } from '../../services/metadataFields'
import { buildLineTraces, buildPeakAnnotations, buildPeakTrace, unitSuffix } from './plotTraces'
import { buildSeriesGrid, type SeriesGrid } from './seriesGrid'
import { buildGridBase, type GridBase } from './gridBaseLayer'
import type { PeakTraceLink, PlotLinks } from './plotLinks'
import {
  highlightShapes,
  sceneSlots,
  sceneSlotTrace,
  type HighlightContext,
  type HighlightState,
} from './highlightLayer'

export interface PlotFigureInput {
  datasets: SpectrumDataset[]
  plotStyle: PlotStylePreferences
  selectedSpectrumId?: string | null
  highlightedDatasetId?: string | null
  hoveredPeakId?: string | null
  /** Point hovered in a linked view; drawn as a marker in heatmap and 3D modes. */
  hoverPoint?: HighlightState['hoverPoint']
  showPeaks?: boolean
  /** Export view: every series drawn equally, no selection or link highlighting, peaks of all series. */
  presentation?: boolean
}

export interface PlotFigure {
  mode: PlotMode
  traces: Array<Record<string, unknown>>
  layout: Record<string, unknown>
  notices: string[]
  usesMath: boolean
  /** Maps traces and grid rows back to measured dataset points (hover, picking, table sync). */
  links: PlotLinks
  /** Everything needed to update link highlighting without rebuilding the figure. */
  highlight: HighlightContext
}

const COLORSCALE = 'Viridis'
const BACKGROUND = '#141519'

interface AxisTitles {
  x: string
  y: string
  series: string
}

function axisTitles(
  datasets: SpectrumDataset[],
  coordinates: ResolvedSeriesCoordinates,
  format: AxisLabelFormat,
  notation: QuantityNotation,
  target: AxisLabelTarget = 'plotly',
): AxisTitles {
  const units = datasets[0]?.units
  const ordinateSubscript = datasets.length > 0 && datasets.every(isNormalised) ? 'norm' : undefined
  return {
    x: axisLabel(units?.xQuantity ?? 'Abscissa', units?.x ?? '', format, notation, target),
    y: axisLabel(units?.yQuantity ?? 'Ordinate', units?.y ?? '', format, notation, target, ordinateSubscript),
    series: coordinates.kind === 'measured'
      ? axisLabel(coordinates.quantity, coordinates.unit, format, notation, target)
      : axisLabel('Series number', '', format, notation, target),
  }
}

function axisStyle(plotStyle: PlotStylePreferences, title: string, reversed = false): Record<string, unknown> {
  return {
    title: { text: title },
    showgrid: plotStyle.showGrid,
    gridcolor: plotStyle.showGrid ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0)',
    zerolinecolor: 'rgba(255,255,255,0.12)',
    autorange: reversed ? 'reversed' : true,
    showline: plotStyle.showBorder,
    linecolor: plotStyle.showBorder ? '#858b92' : undefined,
    mirror: plotStyle.showBorder,
  }
}

function colorbar(title: string, percent: boolean): Record<string, unknown> {
  return {
    title: { text: title, side: 'right' },
    ticksuffix: percent ? ' %' : undefined,
    thickness: 14,
    outlinewidth: 0,
    tickfont: { color: '#d4d4d4' },
  }
}

function baseLayout(): Record<string, unknown> {
  return {
    autosize: true,
    uirevision: 'spectraliser-plot',
    margin: { l: 72, r: 18, t: 16, b: 56 },
    paper_bgcolor: BACKGROUND,
    plot_bgcolor: BACKGROUND,
    font: { color: '#d4d4d4', family: 'Segoe UI, sans-serif' },
    legend: { bgcolor: 'rgba(20,20,22,0.6)', bordercolor: 'rgba(255,255,255,0.08)', borderwidth: 1 },
  }
}

function coordinateNotices(coordinates: ResolvedSeriesCoordinates): string[] {
  if (coordinates.kind === 'measured') return []
  const notices: string[] = []
  const quantity = coordinates.quantity.toLowerCase()
  const shown = coordinates.missing.slice(0, 3).join(', ')
  const more = coordinates.missing.length > 3 ? ` and ${coordinates.missing.length - 3} more` : ''
  if (coordinates.problem === 'duplicates') {
    notices.push(`Several series share the same ${quantity}, so series are placed by their order instead.`)
  } else if (coordinates.problem === 'units') {
    notices.push(`The ${quantity} of ${shown}${more} cannot be converted to the axis unit. Series are placed by their order.`)
  } else {
    notices.push(`No ${quantity} found for ${shown}${more}. Series are placed by their order; add it in the metadata box of the Data tab.`)
  }
  return notices
}

let gridCache: { datasets: SpectrumDataset[]; key: string; grid: SeriesGrid } | null = null

/** Resampling the grid is the costliest part of a figure; it is reused while data and coordinates are unchanged. */
export function seriesGridFor(
  datasets: SpectrumDataset[],
  coordinates: ResolvedSeriesCoordinates,
): SeriesGrid {
  const key = `${coordinates.values.join(',')}|${datasets.map((dataset) => dataset.style.label).join('\u0000')}`
  if (gridCache && gridCache.datasets === datasets && gridCache.key === key) return gridCache.grid
  const grid = buildSeriesGrid(
    datasets.map((dataset, index) => ({
      label: dataset.style.label,
      coordinate: coordinates.values[index],
      abscissa: dataset.data.abscissa,
      ordinate: dataset.data.ordinateModified,
    })),
  )
  gridCache = { datasets, key, grid }
  return grid
}

function rowHoverText(grid: SeriesGrid): string[][] {
  return grid.z.map((row, index) => row.map(() => grid.labels[index]))
}

/**
 * Builds Plotly traces and layout for every plot mode. Overlay keeps one trace per
 * dataset at the start of the trace list so hover and peak indices stay stable.
 */
export function buildPlotFigure(input: PlotFigureInput): PlotFigure {
  const { datasets, plotStyle } = input
  const requestedMode = plotStyle.plotMode
  const coordinates = resolveSeriesAxis(
    datasets.map((dataset) => ({ label: dataset.style.label, metadata: dataset.experimentMetadata })),
    plotStyle.seriesField,
    plotStyle.seriesUnit,
  )
  const multiSeries = datasets.length >= 2
  const notices: string[] = multiSeries ? coordinateNotices(coordinates) : []
  const normalisedCount = datasets.filter(isNormalised).length
  if (normalisedCount > 0 && normalisedCount < datasets.length) {
    notices.push(`Normalisation is enabled for ${normalisedCount} of ${datasets.length} visible series; the ordinate label shows the unnormalised quantity.`)
  }
  const format = plotStyle.axisLabelFormat
  const notation = plotStyle.quantityNotation ?? 'name'
  // Hover labels are plain SVG text, so they always use the inline form.
  const hoverTitles = (): AxisTitles => axisTitles(datasets, coordinates, 'slash', notation)

  let mode: PlotMode = requestedMode
  if (mode !== 'overlay' && !multiSeries) {
    notices.push('Heatmap and 3D views need at least two visible series; showing the spectra overlaid.')
    mode = 'overlay'
  }

  let grid: SeriesGrid | null = null
  if (multiSeries && mode !== 'overlay') {
    try {
      grid = seriesGridFor(datasets, coordinates)
      if (grid.resampled) {
        notices.push('Series were linearly resampled onto a shared abscissa within their common range for this view.')
      }
    } catch (error) {
      notices.push(`${error instanceof Error ? error.message : 'Series grid failed.'} Showing the spectra overlaid.`)
      mode = 'overlay'
    }
  }

  const presentation = input.presentation === true
  const selectedSpectrumId = presentation ? null : input.selectedSpectrumId ?? null
  const showPeaks = input.showPeaks !== false
  const highlightState: HighlightState = presentation
    ? { highlightedDatasetId: null, hoveredPeakId: null, hoverPoint: null }
    : {
        highlightedDatasetId: input.highlightedDatasetId ?? null,
        hoveredPeakId: input.hoveredPeakId ?? null,
        hoverPoint: input.hoverPoint ?? null,
      }
  const coordinateById = new Map(datasets.map((dataset, index) => [dataset.id, coordinates.values[index]]))
  const gridXRange = (seriesGrid: SeriesGrid): [number, number] => {
    let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    for (const value of seriesGrid.x) {
      if (value < low) low = value
      if (value > high) high = value
    }
    return [low, high]
  }
  const gridLinks = (seriesGrid: SeriesGrid, base: GridBase): PlotLinks => ({
    seriesTraces: [],
    peakTrace: base.peaks,
    grid: {
      traceIndex: 0,
      coordinates: seriesGrid.coordinates,
      rowDatasetIds: seriesGrid.sources.map((source) => datasets[source].id),
    },
  })
  const context = (patch: Partial<HighlightContext>): HighlightContext => ({
    mode,
    datasets,
    coordinates: coordinateById,
    xRange: null,
    selectedSpectrumId,
    peaksDatasetId: null,
    baseShapes: [],
    baseAnnotations: [],
    slotStart: -1,
    sceneLift: 0,
    ...patch,
  })

  const reversedX = datasets.some((dataset) => dataset.style.abscissaInverted)
  const reversedY = datasets.some((dataset) => dataset.style.ordinateInverted)
  const percentY = isPercentUnit(datasets[0]?.units.y ?? '')

  if (mode === 'surface3d' && grid) {
    // WebGL scene titles cannot use MathJax; the scene target keeps symbols, subscripts and a stacked fraction.
    const titles = axisTitles(datasets, coordinates, format, notation, 'scene')
    const colorbarTitle = axisTitles(datasets, coordinates, 'slash', notation).y
    let zLow = Number.POSITIVE_INFINITY
    let zHigh = Number.NEGATIVE_INFINITY
    for (const row of grid.z) {
      for (const value of row) {
        if (value < zLow) zLow = value
        if (value > zHigh) zHigh = value
      }
    }
    const zSpan = zHigh > zLow ? zHigh - zLow : 0
    const xRange = gridXRange(grid)
    const sceneLift = zSpan * 0.004 * (reversedY ? -1 : 1)
    const base = buildGridBase({ datasets, coordinates: coordinateById, xRange, selectedSpectrumId, showPeaks, allPeaks: presentation, traceOffset: 1, target: 'scene', sceneLift })
    const highlight = context({
      xRange,
      peaksDatasetId: base.peaks?.datasetId ?? null,
      slotStart: 1 + base.traces.length,
      sceneLift,
    })
    const sceneAxis = (title: string, reversed = false): Record<string, unknown> => ({
      ...axisStyle(plotStyle, title, reversed),
      backgroundcolor: BACKGROUND,
      showbackground: true,
      showspikes: false,
    })
    return {
      mode,
      notices,
      usesMath: false,
      links: gridLinks(grid, base),
      highlight,
      traces: [{
        type: 'surface',
        x: grid.x,
        y: grid.coordinates,
        z: grid.z,
        text: rowHoverText(grid),
        colorscale: COLORSCALE,
        colorbar: colorbar(colorbarTitle, percentY),
        hovertemplate: `%{x:.6g}${unitSuffix(datasets[0].units.x)}<br>${hoverTitles().series}: %{y:.6g}<br>%{z:.6g}${unitSuffix(datasets[0].units.y)}<extra>%{text}</extra>`,
      }, ...base.traces, ...sceneSlots(highlight, highlightState).map(sceneSlotTrace)],
      layout: {
        ...baseLayout(),
        margin: { l: 0, r: 0, t: 0, b: 0 },
        scene: {
          bgcolor: BACKGROUND,
          xaxis: sceneAxis(titles.x, reversedX),
          yaxis: sceneAxis(titles.series),
          zaxis: sceneAxis(titles.y, reversedY),
          aspectmode: 'manual',
          aspectratio: { x: 1.6, y: 1, z: 0.7 },
        },
      },
    }
  }

  const titles = axisTitles(datasets, coordinates, format, notation)
  const usesMath = format === 'fraction' && Object.values(titles).some((title) => title.startsWith('$'))

  if (mode === 'heatmap' && grid) {
    const xRange = gridXRange(grid)
    const base = buildGridBase({ datasets, coordinates: coordinateById, xRange, selectedSpectrumId, showPeaks, allPeaks: presentation, traceOffset: 1, target: 'cartesian' })
    const highlight = context({
      xRange,
      peaksDatasetId: base.peaks?.datasetId ?? null,
      baseShapes: base.shapes,
      baseAnnotations: base.annotations,
    })
    return {
      mode,
      notices,
      usesMath,
      links: gridLinks(grid, base),
      highlight,
      traces: [{
        type: 'heatmap',
        // Bilinear shading between measured rows replaces generated intermediate spectra.
        zsmooth: 'best',
        x: grid.x,
        y: grid.coordinates,
        z: grid.z,
        text: rowHoverText(grid),
        colorscale: COLORSCALE,
        reversescale: reversedY,
        showscale: true,
        // The colour bar title is plain SVG text like in 3D, so TeX fraction labels use the inline form.
        colorbar: colorbar(axisTitles(datasets, coordinates, 'slash', notation).y, percentY),
        hovertemplate: `%{x:.6g}${unitSuffix(datasets[0].units.x)}<br>${hoverTitles().series}: %{y:.6g}<br>%{z:.6g}${unitSuffix(datasets[0].units.y)}<extra>%{text}</extra>`,
      }, ...base.traces],
      layout: {
        ...baseLayout(),
        xaxis: axisStyle(plotStyle, titles.x, reversedX),
        yaxis: { ...axisStyle(plotStyle, titles.series), showgrid: false },
        ...highlightShapes(highlight, highlightState),
      },
    }
  }

  const traces: Array<Record<string, unknown>> = buildLineTraces(
    datasets,
    selectedSpectrumId,
    highlightState.highlightedDatasetId,
    undefined,
    plotStyle.seriesMode,
    presentation,
  ).map((trace) => ({ ...trace }))
  const peaksDataset = showPeaks && !presentation ? datasets.find((dataset) => dataset.id === selectedSpectrumId) ?? null : null
  const peakTrace: PeakTraceLink | null = peaksDataset
    ? { traceIndex: traces.length, datasetId: peaksDataset.id, peakIds: peaksDataset.peaks.map((peak) => peak.id) }
    : null
  if (peaksDataset) traces.push({ ...buildPeakTrace(peaksDataset, peaksDataset.peaks, null) })
  const exportPeakDatasets = showPeaks && presentation ? datasets.filter((dataset) => dataset.peaks.length > 0) : []
  for (const dataset of exportPeakDatasets) traces.push({ ...buildPeakTrace(dataset, dataset.peaks, null), showlegend: false })
  const peakAnnotations = presentation
    ? exportPeakDatasets.flatMap((dataset) => buildPeakAnnotations(dataset))
    : buildPeakAnnotations(peaksDataset)
  const overlayHighlight = context({ peaksDatasetId: peaksDataset?.id ?? null, baseAnnotations: peakAnnotations })

  return {
    mode,
    notices,
    usesMath,
    links: {
      seriesTraces: datasets.map((dataset, traceIndex) => ({ traceIndex, datasetId: dataset.id })),
      peakTrace,
      grid: null,
    },
    highlight: overlayHighlight,
    traces,
    layout: {
      ...baseLayout(),
      xaxis: axisStyle(plotStyle, titles.x, reversedX),
      yaxis: { ...axisStyle(plotStyle, titles.y, reversedY), ticksuffix: percentY ? ' %' : undefined },
      ...highlightShapes(overlayHighlight, highlightState),
    },
  }
}
