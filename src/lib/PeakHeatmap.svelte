<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte'
  import Plotly from 'plotly.js-dist-min'

  export let prominenceValues: number[] = []
  export let distanceValues: number[] = []
  export let counts: number[][] = []
  export let currentProminence: number | null = null
  export let currentDistance: number | null = null
  export let loading = false

  const dispatch = createEventDispatcher<{
    select: { prominence: number; distance: number }
  }>()

  let container: HTMLDivElement | null = null

  type PlotlyGraphDiv = HTMLDivElement & {
    on?: (eventName: string, handler: (eventData: { points?: Array<{ x?: number; y?: number }> }) => void) => void
    removeAllListeners?: (eventName?: string) => void
  }

  async function render(): Promise<void> {
    if (!container) {
      return
    }

    const shapes = []
    if (currentProminence !== null && currentDistance !== null) {
      shapes.push({
        type: 'line',
        x0: currentDistance,
        x1: currentDistance,
        y0: prominenceValues[0],
        y1: prominenceValues[prominenceValues.length - 1],
        line: { color: '#ffffff', width: 1, dash: 'dot' },
      })
      shapes.push({
        type: 'line',
        x0: distanceValues[0],
        x1: distanceValues[distanceValues.length - 1],
        y0: currentProminence,
        y1: currentProminence,
        line: { color: '#ffffff', width: 1, dash: 'dot' },
      })
    }

    await Plotly.react(
      container,
      [
        {
          type: 'heatmap',
          x: distanceValues,
          y: prominenceValues,
          z: counts,
          colorscale: 'Viridis',
          hovertemplate: 'Min distance: %{x}<br>Prominence: %{y:.4f}<br>Peaks found: %{z}<extra></extra>',
          colorbar: { title: 'Peaks', titleside: 'right' },
        },
      ],
      {
        margin: { l: 60, r: 12, t: 12, b: 42 },
        paper_bgcolor: '#141519',
        plot_bgcolor: '#141519',
        font: { color: '#d4d4d4', family: 'Segoe UI, sans-serif', size: 11 },
        xaxis: { title: 'Min distance (points)' },
        yaxis: { title: 'Prominence' },
        shapes,
      },
      { displaylogo: false, responsive: true },
    )

    const graph = container as PlotlyGraphDiv
    graph.removeAllListeners?.('plotly_click')
    graph.on?.('plotly_click', (eventData) => {
      const point = eventData.points?.[0]
      if (point?.x === undefined || point?.y === undefined) {
        return
      }
      dispatch('select', { prominence: point.y, distance: point.x })
    })
  }

  onMount(() => {
    void render()
  })

  $: if (container && counts.length > 0) {
    void render()
  }
</script>

<div class="peak-heatmap-wrap">
  {#if loading}
    <div class="peak-heatmap-loading">Computing heatmap...</div>
  {/if}
  <div class="peak-heatmap-plot" bind:this={container}></div>
</div>

<style>
  .peak-heatmap-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 220px;
  }

  .peak-heatmap-plot {
    width: 100%;
    height: 100%;
  }

  .peak-heatmap-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    font-size: 0.82rem;
    background: rgba(20, 20, 22, 0.55);
    z-index: 1;
  }
</style>
