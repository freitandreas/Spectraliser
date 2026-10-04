<script lang="ts">
  import { onDestroy } from 'svelte'
  import Plotly from 'plotly.js-dist-min'
  import type { StartupPreferences } from '../services/startupPreferences'
  import { buildPlotFigure, type PlotFigure } from './plot/plotFigure'
  import { buildPreviewDatasets } from './plot/previewData'
  import { ensureMathJax } from './plot/mathJax'

  export let preferences: StartupPreferences
  export let height = 260

  type PlotlyExtras = typeof Plotly & { purge?: (target: HTMLDivElement) => void }

  let container: HTMLDivElement | null = null
  let notices: string[] = []
  let renderedMode: PlotFigure['mode'] | null = null
  let generation = 0

  async function render(current: StartupPreferences): Promise<void> {
    if (!container) return
    const run = ++generation
    const preview = buildPreviewDatasets(current.spectrumType, current.axes)
    let figure = buildPlotFigure({ datasets: preview.datasets, plotStyle: current.plotStyle, showPeaks: false })
    if (figure.usesMath) {
      try {
        await ensureMathJax()
      } catch (error) {
        figure = buildPlotFigure({
          datasets: preview.datasets,
          plotStyle: { ...current.plotStyle, axisLabelFormat: 'slash' },
          showPeaks: false,
        })
        figure.notices.push(error instanceof Error ? error.message : 'Fraction labels are unavailable.')
      }
    }
    if (run !== generation || !container) return
    if (renderedMode && figure.mode !== renderedMode && (figure.mode === 'surface3d' || renderedMode === 'surface3d')) {
      ;(Plotly as PlotlyExtras).purge?.(container)
    }
    renderedMode = figure.mode
    notices = [...preview.notices, ...figure.notices]
    await Plotly.react(
      container,
      figure.traces,
      { ...figure.layout, uirevision: 'startup-preview', showlegend: figure.mode === 'overlay', legend: { ...(figure.layout.legend as object), font: { size: 10 } } },
      { displaylogo: false, displayModeBar: false, responsive: true },
    )
  }

  $: if (container) void render(preferences)

  onDestroy(() => {
    generation += 1
    if (container) (Plotly as PlotlyExtras).purge?.(container)
  })
</script>

<figure class="startup-plot-preview" aria-label="Live plot preview">
  <div class="preview-plot" style={`height:${height}px`} bind:this={container}></div>
  <figcaption>
    Preview with five synthetic series at 0–480 s.
    {#each notices as notice}<span class="notice">{notice}</span>{/each}
  </figcaption>
</figure>

<style>
  .startup-plot-preview{display:grid;gap:6px;margin:0;padding:8px;border:1px solid #3b4148;border-radius:7px;background:#141519}
  .preview-plot{width:100%;min-width:0}
  figcaption{display:grid;gap:4px;color:#8f979e;font-size:.66rem;line-height:1.35}
  .notice{color:#e2cfa6}
</style>
