<script lang="ts">
  import { onMount } from 'svelte'
  import Plotly from 'plotly.js-dist-min'
  import type { SpectrumDataset } from '../types/project'

  export let datasets: SpectrumDataset[] = []
  export let selectedSpectrumId: string | null = null
  export let hoverSelection: { datasetId: string; pointIndex: number } | null = null

  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher<{
    hoverpoint: { datasetId: string; pointIndex: number } | null
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

  type PlotTrace = {
    x: number[]
    y: number[]
    type: string
    mode: string
    name: string
    line?: {
      color: string
      width: number
    }
    opacity?: number
    hoverinfo?: string
    showlegend?: boolean
    marker?: {
      size: number
      color: string
      line: {
        color: string
        width: number
      }
    }
  }

  type PlotlyGraphDiv = HTMLDivElement & {
    on?: (eventName: string, handler: (eventData: { points?: PlotlyTracePoint[] }) => void) => void
    removeAllListeners?: (eventName?: string) => void
  }

  let hoverHandlerAttached = false

  function buildTraces(): PlotTrace[] {
    return datasets.map((dataset) => ({
      x: dataset.data.abscissa,
      y: dataset.data.ordinateModified,
      type: 'scatter',
      mode: 'lines',
      name: dataset.style.label,
      line: {
        color: dataset.style.lineColor,
        width: dataset.style.lineWidth,
      },
      opacity: dataset.id === selectedSpectrumId ? 1 : 0.42,
    }))
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

    graph.on?.('plotly_hover', (eventData) => {
      const point = eventData.points?.[0]
      const datasetId = traceDatasetId(point?.curveNumber)
      const pointIndex = point?.pointNumber
      if (datasetId === null || pointIndex === undefined) {
        return
      }

      dispatch('hoverpoint', { datasetId, pointIndex })
    })

    graph.on?.('plotly_unhover', () => {
      dispatch('hoverpoint', null)
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
          title: datasets[0]?.units.x ?? 'X',
          gridcolor: 'rgba(255,255,255,0.08)',
          zerolinecolor: 'rgba(255,255,255,0.12)',
        },
        yaxis: {
          title: datasets[0]?.units.y ?? 'Y',
          gridcolor: 'rgba(255,255,255,0.08)',
          zerolinecolor: 'rgba(255,255,255,0.12)',
        },
        legend: {
          bgcolor: 'rgba(20,20,22,0.6)',
          bordercolor: 'rgba(255,255,255,0.08)',
          borderwidth: 1,
        },
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
      resizeObserver?.disconnect()
      resizeObserver = null
    }
  })

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
