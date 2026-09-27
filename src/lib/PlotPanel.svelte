<script lang="ts">
  import { onMount } from 'svelte'
  import Plotly from 'plotly.js-dist-min'
  import type { SpectrumDataset } from '../types/project'
  import { axisLabel, isPercentUnit } from '../services/spectrumPresets'
  import { buildLineTraces, buildPeakAnnotations, buildPeakTrace, type PlotTrace } from './plot/plotTraces'
  import { AxisRangeTween } from './plot/zoomTween'

  export let datasets: SpectrumDataset[] = []
  export let selectedSpectrumId: string | null = null
  export let hoverSelection: { datasetId: string; pointIndex: number } | null = null
  export let peakPickingEnabled = false
  export let peakHoverSelection: { datasetId: string; peakId: string } | null = null
  export let peakZoomPeakId: string | null = null
  export let highlightedDatasetId: string | null = null

  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher<{
    hoverpoint: { datasetId: string; pointIndex: number } | null
    peakpick: { datasetId: string; pointIndex: number }
    peakhover: { datasetId: string; peakId: string } | null
  }>()

  let container: HTMLDivElement | null = null
  let lastDatasetsRef: SpectrumDataset[] | null = null
  let lastSelectedSpectrumId: string | null = null
  let lastHoverKey = ''
  let resizeObserver: ResizeObserver | null = null

  type PlotlyTracePoint = {
    curveNumber?: number
    pointNumber?: number
  }

  type PlotlyGraphDiv = HTMLDivElement & {
    on?: (eventName: string, handler: (eventData: { points?: PlotlyTracePoint[] }) => void) => void
    removeAllListeners?: (eventName?: string) => void
  }

  let hoverHandlerAttached = false
  let preZoomRange: { x: [number, number] | null; y: [number, number] | null } | null = null
  let lastAppliedPeakZoomId: string | null | undefined = undefined
  let lastHighlightedDatasetId: string | null = null
  let zoomGeneration = 0
  const zoomTween = new AxisRangeTween()

  function getPeaksDataset(): SpectrumDataset | null {
    return datasets.find((dataset) => dataset.id === selectedSpectrumId) ?? null
  }

  function buildTraces(): PlotTrace[] {
    const traces = buildLineTraces(datasets, selectedSpectrumId, highlightedDatasetId)

    const peaksDataset = getPeaksDataset()
    if (peaksDataset) {
      const hoveredId = peakHoverSelection?.datasetId === peaksDataset.id ? peakHoverSelection.peakId : null
      traces.push(buildPeakTrace(peaksDataset, peaksDataset.peaks, hoveredId))
    }

    return traces
  }

  function traceDatasetId(curveNumber: number | undefined): string | null {
    if (curveNumber === undefined) {
      return null
    }

    return datasets[curveNumber]?.id ?? null
  }

  function attachHoverHandlers(): void {
    if (!container || hoverHandlerAttached) {
      return
    }

    const graph = container as PlotlyGraphDiv
    graph.removeAllListeners?.('plotly_hover')
    graph.removeAllListeners?.('plotly_unhover')
    graph.removeAllListeners?.('plotly_click')

    graph.on?.('plotly_hover', (eventData) => {
      const point = eventData.points?.[0]
      if (point?.curveNumber === undefined) {
        return
      }

      const peaksDataset = getPeaksDataset()
      if (peaksDataset) {
        const enabledTraceIndex = datasets.length
        if (point.curveNumber === enabledTraceIndex) {
          const peaks = peaksDataset.peaks
          const peak = point.pointNumber !== undefined ? peaks[point.pointNumber] : undefined
          if (peak) {
            dispatch('peakhover', { datasetId: peaksDataset.id, peakId: peak.id })
          }
          return
        }
      }

      const datasetId = traceDatasetId(point.curveNumber)
      const pointIndex = point.pointNumber
      if (datasetId === null || pointIndex === undefined) {
        return
      }

      dispatch('hoverpoint', { datasetId, pointIndex })
    })

    graph.on?.('plotly_unhover', () => {
      dispatch('hoverpoint', null)
      dispatch('peakhover', null)
    })

    graph.on?.('plotly_click', (eventData) => {
      if (!peakPickingEnabled) {
        return
      }

      const point = eventData.points?.[0]
      // Only main line traces (index < datasets.length) qualify; the peaks overlay trace is excluded.
      if (point?.curveNumber === undefined || point.curveNumber >= datasets.length) {
        return
      }

      const datasetId = traceDatasetId(point.curveNumber)
      const pointIndex = point.pointNumber
      if (datasetId === null || pointIndex === undefined) {
        return
      }

      dispatch('peakpick', { datasetId, pointIndex })
    })

    hoverHandlerAttached = true
  }

  async function renderPlot(): Promise<void> {
    if (!container) {
      return
    }

    const plotly = Plotly as typeof Plotly & {
      Fx?: {
        hover: (target: HTMLDivElement, points: Array<{ curveNumber: number; pointNumber: number }>) => void
        unhover: (target: HTMLDivElement) => void
      }
    }

    const abscissaReversed = datasets.some((dataset) => dataset.style.abscissaInverted)
    const ordinateReversed = datasets.some((dataset) => dataset.style.ordinateInverted)

    await plotly.react(
      container,
      buildTraces(),
      {
        autosize: true,
        uirevision: 'spectraliser-plot',
        margin: { l: 56, r: 18, t: 16, b: 48 },
        paper_bgcolor: '#141519',
        plot_bgcolor: '#141519',
        font: { color: '#d4d4d4', family: 'Segoe UI, sans-serif' },
        xaxis: {
          title: axisLabel(datasets[0]?.units.xQuantity ?? 'Abscissa', datasets[0]?.units.x ?? ''),
          gridcolor: 'rgba(255,255,255,0.08)',
          zerolinecolor: 'rgba(255,255,255,0.12)',
          reversed: abscissaReversed,
        },
        yaxis: {
          title: axisLabel(datasets[0]?.units.yQuantity ?? 'Ordinate', datasets[0]?.units.y ?? ''),
          gridcolor: 'rgba(255,255,255,0.08)',
          zerolinecolor: 'rgba(255,255,255,0.12)',
          reversed: ordinateReversed,
          ticksuffix: isPercentUnit(datasets[0]?.units.y ?? '') ? ' %' : undefined,
        },
        legend: {
          bgcolor: 'rgba(20,20,22,0.6)',
          bordercolor: 'rgba(255,255,255,0.08)',
          borderwidth: 1,
        },
        annotations: buildPeakAnnotations(getPeaksDataset()),
      },
      {
        displaylogo: false,
        responsive: true,
      },
    )

    lastDatasetsRef = datasets
    lastSelectedSpectrumId = selectedSpectrumId

    attachHoverHandlers()
    applyHoverOverlay(plotly)
  }

  function applyHoverOverlay(
    plotly: typeof Plotly & {
      Fx?: {
        hover: (target: HTMLDivElement, points: Array<{ curveNumber: number; pointNumber: number }>) => void
        unhover: (target: HTMLDivElement) => void
      }
    },
  ): void {
    if (!container) {
      return
    }

    const hoverKey = hoverSelection
      ? `${hoverSelection.datasetId}:${hoverSelection.pointIndex}`
      : 'none'

    if (hoverKey === lastHoverKey) {
      return
    }

    if (hoverSelection) {
      const traceIndex = datasets.findIndex((dataset) => dataset.id === hoverSelection.datasetId)
      if (traceIndex >= 0) {
        plotly.Fx?.hover(container, [{ curveNumber: traceIndex, pointNumber: hoverSelection.pointIndex }])
        lastHoverKey = hoverKey
      }
      return
    }

    plotly.Fx?.unhover(container)
    lastHoverKey = 'none'
  }

  function applyPeakHoverStyle(): void {
    if (!container) {
      return
    }

    const peaksDataset = getPeaksDataset()
    if (!peaksDataset) {
      return
    }

    const hoveredId = peakHoverSelection?.datasetId === peaksDataset.id ? peakHoverSelection.peakId : null
    const plotly = Plotly as typeof Plotly & {
      restyle?: (target: HTMLDivElement, update: Record<string, unknown>, indices: number[]) => void
    }

    plotly.restyle?.(
      container,
      { 'marker.size': [peaksDataset.peaks.map((peak) => (peak.id === hoveredId ? 14 : 9))] },
      [datasets.length],
    )
  }

  async function applyPeakZoom(peakId: string | null): Promise<void> {
    if (!container) {
      return
    }

    zoomGeneration += 1
    const generation = zoomGeneration

    const plotly = Plotly as typeof Plotly & {
      relayout?: (target: HTMLDivElement, update: Record<string, unknown>) => Promise<unknown>
    }

    const currentXRange = (): [number, number] | null => {
      const full = (container as unknown as { _fullLayout?: { xaxis?: { range?: number[] } } })._fullLayout
      const range = full?.xaxis?.range
      return range && range.length === 2 ? [Number(range[0]), Number(range[1])] : null
    }

    const dataXRange = (): [number, number] | null => {
      const values = datasets.flatMap((dataset) => dataset.data.abscissa)
      if (values.length === 0) return null
      return [Math.min(...values), Math.max(...values)]
    }

    const tweenXRange = (from: [number, number], to: [number, number]): Promise<void> => {
      if (!container) return Promise.resolve()
      return zoomTween.run(container, (target, update) => plotly.relayout?.(target, update), from, to)
    }

    if (peakId) {
      const peaksDataset = getPeaksDataset()
      const peak = peaksDataset?.peaks.find((item) => item.id === peakId)
      if (!peaksDataset || !peak) {
        return
      }

      const from = currentXRange() ?? dataXRange()
      if (!from) {
        return
      }

      // Captured once per zoom session so hopping between rows still restores the original view.
      if (preZoomRange === null) {
        preZoomRange = { x: from, y: null }
      }

      const abscissa = peaksDataset.data.abscissa
      const span = Math.abs((abscissa[abscissa.length - 1] ?? 0) - (abscissa[0] ?? 0)) || 1
      const margin = Math.max(span * 0.03, 1)
      const direction = from[0] <= from[1] ? 1 : -1
      const target: [number, number] = direction === 1
        ? [peak.x - margin, peak.x + margin]
        : [peak.x + margin, peak.x - margin]

      await tweenXRange(from, target)
      return
    }

    const restore = preZoomRange?.x ?? dataXRange()
    const from = currentXRange()
    if (!restore || !from) {
      preZoomRange = null
      await plotly.relayout?.(container, { 'xaxis.autorange': true })
      return
    }

    await tweenXRange(from, restore)

    if (generation === zoomGeneration) {
      preZoomRange = null
    }
  }

  onMount(() => {
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        const plotly = Plotly as typeof Plotly & {
          Plots?: {
            resize: (target: HTMLDivElement) => void
          }
        }

        if (container) {
          plotly.Plots?.resize(container)
        }
      })
      resizeObserver.observe(container)
    }

    void renderPlot()

    return () => {
      zoomTween.cancel()
      resizeObserver?.disconnect()
      resizeObserver = null
    }
  })

  function applyHighlightStyle(): void {
    if (!container || datasets.length === 0) {
      return
    }

    const plotly = Plotly as typeof Plotly & {
      restyle?: (target: HTMLDivElement, update: Record<string, unknown>, indices: number[]) => void
    }

    plotly.restyle?.(
      container,
      {
        opacity: datasets.map((dataset) =>
          dataset.id === selectedSpectrumId || dataset.id === highlightedDatasetId ? 1 : 0.42,
        ),
        'line.width': datasets.map((dataset) =>
          dataset.id === highlightedDatasetId ? dataset.style.lineWidth + 1 : dataset.style.lineWidth,
        ),
      },
      datasets.map((_, index) => index),
    )
  }

  $: if (container && highlightedDatasetId !== lastHighlightedDatasetId) {
    lastHighlightedDatasetId = highlightedDatasetId
    applyHighlightStyle()
  }

  let lastPeakHoverKey = ''
  $: if (container) {
    const peakHoverKey = peakHoverSelection ? `${peakHoverSelection.datasetId}:${peakHoverSelection.peakId}` : 'none'
    if (peakHoverKey !== lastPeakHoverKey) {
      lastPeakHoverKey = peakHoverKey
      applyPeakHoverStyle()
    }
  }

  $: if (container) {
    if (peakZoomPeakId !== lastAppliedPeakZoomId) {
      lastAppliedPeakZoomId = peakZoomPeakId
      void applyPeakZoom(peakZoomPeakId)
    }
  }

  $: if (container) {
    const hoverKey = hoverSelection
      ? `${hoverSelection.datasetId}:${hoverSelection.pointIndex}`
      : 'none'

    if (
      lastDatasetsRef !== datasets
      || lastSelectedSpectrumId !== selectedSpectrumId
      || hoverKey !== lastHoverKey
    ) {
      if (lastDatasetsRef !== datasets || lastSelectedSpectrumId !== selectedSpectrumId) {
        lastHoverKey = hoverKey
        void renderPlot()
      } else {
        const plotly = Plotly as typeof Plotly & {
          Fx?: {
            hover: (target: HTMLDivElement, points: Array<{ curveNumber: number; pointNumber: number }>) => void
            unhover: (target: HTMLDivElement) => void
          }
        }

        applyHoverOverlay(plotly)
      }
    }
  }
</script>

<div class="plotly-panel" bind:this={container}></div>

<style>
  .plotly-panel {
    width: 100%;
    height: 100%;
  }
</style>
