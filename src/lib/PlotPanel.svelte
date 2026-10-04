<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import Plotly from 'plotly.js-dist-min'
  import type { SpectrumDataset } from '../types/project'
  import type { PlotStylePreferences } from '../services/startupPreferences'
  import { buildPlotFigure, type PlotFigure } from './plot/plotFigure'
  import { ensureMathJax } from './plot/mathJax'
  import { pointKey, resolveGridPoint, type DatasetPoint } from './plot/plotLinks'
  import { highlightShapes, sceneSlotRestyle, sceneSlots, type HighlightState } from './plot/highlightLayer'
  import { createPeakZoom } from './plot/peakZoom'

  export let datasets: SpectrumDataset[] = []
  export let selectedSpectrumId: string | null = null
  export let hoverSelection: DatasetPoint | null = null
  export let peakPickingEnabled = false
  export let peakHoverSelection: { datasetId: string; peakId: string } | null = null
  export let peakZoomPeakId: string | null = null
  export let highlightedDatasetId: string | null = null
  export let plotStyle: PlotStylePreferences

  const dispatch = createEventDispatcher<{
    hoverpoint: DatasetPoint | null
    peakpick: DatasetPoint
    peakhover: { datasetId: string; peakId: string } | null
  }>()

  type PlotlyPoint = { curveNumber?: number; pointNumber?: number | number[]; x?: unknown; y?: unknown }
  type PlotlyGraphDiv = HTMLDivElement & {
    on?: (eventName: string, handler: (eventData: { points?: PlotlyPoint[] }) => void) => void
    removeAllListeners?: (eventName?: string) => void
    _fullLayout?: unknown
  }
  type PlotlyApi = typeof Plotly & {
    Fx?: { hover: (target: HTMLDivElement, points: Array<{ curveNumber: number; pointNumber: number }>) => void; unhover: (target: HTMLDivElement) => void }
    restyle?: (target: HTMLDivElement, update: Record<string, unknown>, indices: number[]) => Promise<unknown>
    relayout?: (target: HTMLDivElement, update: Record<string, unknown>) => Promise<unknown>
    purge?: (target: HTMLDivElement) => void
    Plots?: { resize: (target: HTMLDivElement) => void }
  }
  const plotly = Plotly as PlotlyApi

  let container: HTMLDivElement | null = null
  let plotReady = false
  let renderKey = ''
  let resizeObserver: ResizeObserver | null = null
  let notices: string[] = []
  let renderedMode: PlotFigure['mode'] = 'overlay'
  let links: PlotFigure['links'] = { seriesTraces: [], peakTrace: null, grid: null }
  let highlight: PlotFigure['highlight'] | null = null
  let renderGeneration = 0
  let handlersAttached = false
  let lastAppliedPeakZoomId: string | null | undefined = undefined

  // Keys of the highlight state currently drawn, so unchanged parts are never re-applied.
  let applied = { series: '', peak: '', hover: '' }
  let highlightFrame: number | null = null
  // Last values sent to the parent; echoes of the plot's own hover are not drawn again.
  let dispatchedHoverKey = 'none'
  let dispatchedPeakKey = 'none'

  /** Plotly drops `_fullLayout` when a div is purged or not yet drawn; relayout/restyle would then throw. */
  function plotAlive(): boolean {
    return Boolean(container && plotReady && (container as PlotlyGraphDiv)._fullLayout)
  }

  function safe(call: () => Promise<unknown> | undefined): void {
    if (!plotAlive()) return
    try {
      void call()?.catch(() => undefined)
    } catch {
      // A purge between scheduling and drawing makes the update obsolete.
    }
  }

  const peakZoom = createPeakZoom({
    container: () => container,
    alive: plotAlive,
    relayout: (update) => safe(() => plotly.relayout?.(container!, update)),
    datasets: () => datasets,
    peaksDataset: () => datasets.find((dataset) => dataset.id === selectedSpectrumId) ?? null,
    mode: () => renderedMode,
  })

  function highlightState(): HighlightState {
    const peaksId = highlight?.peaksDatasetId ?? null
    const hoverKey = pointKey(hoverSelection)
    return {
      highlightedDatasetId,
      hoveredPeakId: peakHoverSelection && peakHoverSelection.datasetId === peaksId ? peakHoverSelection.peakId : null,
      hoverPoint: hoverKey === dispatchedHoverKey ? null : hoverSelection,
    }
  }

  function stateKeys(state: HighlightState): typeof applied {
    return { series: state.highlightedDatasetId ?? '', peak: state.hoveredPeakId ?? '', hover: pointKey(state.hoverPoint) }
  }

  function resolvePoint(point: PlotlyPoint): DatasetPoint | null {
    if (point.curveNumber === undefined) return null
    if (links.grid && point.curveNumber === links.grid.traceIndex) {
      return resolveGridPoint(links.grid, datasets, point.x as number, point.y as number)
    }
    const link = links.seriesTraces.find((item) => item.traceIndex === point.curveNumber)
    return link && typeof point.pointNumber === 'number' ? { datasetId: link.datasetId, pointIndex: point.pointNumber } : null
  }

  function sendHover(target: DatasetPoint | null): void {
    const key = pointKey(target)
    if (key === dispatchedHoverKey) return
    dispatchedHoverKey = key
    dispatch('hoverpoint', target)
  }

  function sendPeakHover(target: { datasetId: string; peakId: string } | null): void {
    const key = target ? `${target.datasetId}:${target.peakId}` : 'none'
    if (key === dispatchedPeakKey) return
    dispatchedPeakKey = key
    dispatch('peakhover', target)
  }

  function attachHandlers(): void {
    if (!container || handlersAttached) return
    const graph = container as PlotlyGraphDiv
    graph.removeAllListeners?.('plotly_hover')
    graph.removeAllListeners?.('plotly_unhover')
    graph.removeAllListeners?.('plotly_click')

    graph.on?.('plotly_hover', (eventData) => {
      const point = eventData.points?.[0]
      if (point?.curveNumber === undefined) return
      const peakTrace = links.peakTrace
      if (peakTrace && point.curveNumber === peakTrace.traceIndex) {
        const peakId = typeof point.pointNumber === 'number' ? peakTrace.peakIds[point.pointNumber] : undefined
        if (peakId) sendPeakHover({ datasetId: peakTrace.datasetId, peakId })
        return
      }
      sendHover(resolvePoint(point))
    })

    graph.on?.('plotly_unhover', () => {
      sendHover(null)
      sendPeakHover(null)
    })

    graph.on?.('plotly_click', (eventData) => {
      if (!peakPickingEnabled) return
      // Only measured points qualify; peak markers and interpolated grid rows are excluded.
      const point = eventData.points?.[0]
      const peakTrace = links.peakTrace
      if (!point || (peakTrace && point.curveNumber === peakTrace.traceIndex)) return
      const target = resolvePoint(point)
      if (target) dispatch('peakpick', target)
    })

    handlersAttached = true
  }

  function buildFigure(style: PlotStylePreferences, state: HighlightState): PlotFigure {
    return buildPlotFigure({
      datasets,
      plotStyle: style,
      selectedSpectrumId,
      highlightedDatasetId: state.highlightedDatasetId,
      hoveredPeakId: peakHoverSelection?.peakId ?? null,
      hoverPoint: state.hoverPoint,
    })
  }

  async function renderPlot(): Promise<void> {
    if (!container) return
    const generation = ++renderGeneration
    plotReady = false
    peakZoom.reset()
    lastAppliedPeakZoomId = undefined

    const state = highlightState()
    let figure = buildFigure(plotStyle, state)
    if (figure.usesMath) {
      try {
        await ensureMathJax()
      } catch (error) {
        figure = buildFigure({ ...plotStyle, axisLabelFormat: 'slash' }, state)
        figure.notices.push(error instanceof Error ? error.message : 'Fraction labels are unavailable.')
      }
      if (generation !== renderGeneration) return
    }

    // WebGL scenes and 2D cartesian axes cannot be morphed into each other by Plotly.react.
    if (figure.mode !== renderedMode && (figure.mode === 'surface3d' || renderedMode === 'surface3d')) {
      plotly.purge?.(container)
      handlersAttached = false
    }
    renderedMode = figure.mode
    notices = figure.notices
    links = figure.links
    highlight = figure.highlight

    await plotly.react(container, figure.traces, figure.layout, { displaylogo: false, responsive: true })
    if (generation !== renderGeneration || !container) return

    plotReady = true
    // The figure already contains the highlight state it was built with.
    applied = stateKeys(state)
    attachHandlers()
    if (renderedMode === 'overlay') {
      applied.hover = ''
      applyOverlayHover(state)
    }
    scheduleHighlights()
  }

  function applyOverlayHover(state: HighlightState): void {
    const key = pointKey(state.hoverPoint)
    if (key === applied.hover || !container) return
    applied.hover = key
    const point = state.hoverPoint
    const link = point ? links.seriesTraces.find((item) => item.datasetId === point.datasetId) : undefined
    if (point && link) plotly.Fx?.hover(container, [{ curveNumber: link.traceIndex, pointNumber: point.pointIndex }])
    // A plot-originated hover already shows Plotly's own label, which unhover would remove.
    else if (pointKey(hoverSelection) !== dispatchedHoverKey) plotly.Fx?.unhover(container)
  }

  function applyHighlights(): void {
    if (!plotAlive() || !highlight || !container) return
    const target = container
    const context = highlight
    const state = highlightState()
    const keys = stateKeys(state)

    if (renderedMode === 'surface3d') {
      const order: Array<keyof typeof applied> = ['series', 'peak', 'hover']
      const changed = order.flatMap((key, slot) => (keys[key] !== applied[key] ? [slot] : []))
      applied = keys
      if (changed.length === 0) return
      const slots = sceneSlots(context, state)
      const update = sceneSlotRestyle(changed.map((slot) => slots[slot]))
      safe(() => plotly.restyle?.(target, update, changed.map((slot) => context.slotStart + slot)))
      return
    }

    if (renderedMode === 'overlay' && keys.series !== applied.series) {
      safe(() => plotly.restyle?.(
        target,
        {
          opacity: datasets.map((dataset) => (dataset.id === selectedSpectrumId || dataset.id === highlightedDatasetId ? 1 : 0.42)),
          'line.width': datasets.map((dataset) => dataset.style.lineWidth + (dataset.id === highlightedDatasetId ? 1 : 0)),
        },
        datasets.map((_, index) => index),
      ))
    }

    // Heatmap guides and peak rings are layout shapes: an arraydraw relayout, no trace recalculation.
    const shapesChanged = keys.peak !== applied.peak || (renderedMode === 'heatmap' && (keys.series !== applied.series || keys.hover !== applied.hover))
    if (shapesChanged) {
      const layer = highlightShapes(context, state)
      safe(() => plotly.relayout?.(target, renderedMode === 'heatmap' ? layer : { shapes: layer.shapes }))
    }
    if (renderedMode === 'overlay') {
      const hover = applied.hover
      applied = { ...keys, hover }
      applyOverlayHover(state)
    } else {
      applied = keys
    }
  }

  /** Hover traffic arrives far faster than frames; updates are coalesced to one per animation frame. */
  function scheduleHighlights(..._dependencies: unknown[]): void {
    if (highlightFrame !== null || typeof requestAnimationFrame === 'undefined') return
    highlightFrame = requestAnimationFrame(() => {
      highlightFrame = null
      applyHighlights()
    })
  }

  function checkRender(..._dependencies: unknown[]): void {
    const key = JSON.stringify(plotStyle)
    if (!plotReady || (lastRenderedDatasets === datasets && lastRenderedSelection === selectedSpectrumId && key === renderKey)) return
    lastRenderedDatasets = datasets
    lastRenderedSelection = selectedSpectrumId
    renderKey = key
    void renderPlot()
  }
  let lastRenderedDatasets: SpectrumDataset[] | null = null
  let lastRenderedSelection: string | null = null

  onMount(() => {
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (container && plotReady) plotly.Plots?.resize(container)
      })
      resizeObserver.observe(container)
    }
    lastRenderedDatasets = datasets
    lastRenderedSelection = selectedSpectrumId
    renderKey = JSON.stringify(plotStyle)
    void renderPlot()

    return () => {
      peakZoom.reset()
      if (highlightFrame !== null) cancelAnimationFrame(highlightFrame)
      resizeObserver?.disconnect()
      resizeObserver = null
    }
  })

  $: if (container) checkRender(datasets, selectedSpectrumId, plotStyle, plotReady)

  $: if (container && plotReady) scheduleHighlights(highlightedDatasetId, peakHoverSelection, hoverSelection)

  $: if (container && plotReady && peakZoomPeakId !== lastAppliedPeakZoomId) {
    lastAppliedPeakZoomId = peakZoomPeakId
    void peakZoom.apply(peakZoomPeakId)
  }

</script>

<div class="plot-shell">
  <div class="plotly-panel" bind:this={container}></div>
  {#if notices.length > 0}
    <ul class="plot-notices" aria-live="polite">
      {#each notices as notice}<li>{notice}</li>{/each}
    </ul>
  {/if}
</div>

<style>
  .plot-shell {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .plotly-panel {
    width: 100%;
    height: 100%;
  }

  .plot-notices {
    position: absolute;
    left: 76px;
    right: 24px;
    bottom: 60px;
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    pointer-events: none;
  }

  .plot-notices li {
    justify-self: start;
    max-width: 100%;
    padding: 5px 9px;
    border: 1px solid rgba(214, 177, 109, 0.35);
    border-radius: 6px;
    background: rgba(28, 26, 22, 0.88);
    color: #e2cfa6;
    font-size: 0.72rem;
    line-height: 1.35;
  }
</style>
