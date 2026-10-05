<script lang="ts">
  import { tick } from 'svelte'
  import type { AppState, SpectrumDataset } from '../../types/project'
  import PlotPanel from '../PlotPanel.svelte'
  import ReportBody from './ReportBody.svelte'
  import ScaledFigure from './ScaledFigure.svelte'
  import LoadingOverlay from './LoadingOverlay.svelte'
  import { buildReportContent, type PeakColumn, type ReportContent } from '../../services/export/reportContent'
  import { afterPaint, beginActivity } from '../../state/activityState'
  import { exportImageScale, exportLayoutSize, exportPixelSize, formatCm, type ExportSettings } from '../../services/export/exportSettings'
  import type { ExportAppearance } from '../plot/exportAppearance'
  import { workspaceSceneCamera } from '../plot/sceneCamera'
  import type { PlotStylePreferences } from '../../services/startupPreferences'

  export let state: AppState
  export let datasets: SpectrumDataset[]
  export let plotStyle: PlotStylePreferences
  export let settings: ExportSettings
  export let onClose: () => void

  let plotPanel: PlotPanel | null = null
  let plotRendering = false
  let content: ReportContent | null = null
  let preparing = false
  let contentGeneration = 0

  $: layoutSize = exportLayoutSize(settings)
  $: pixelSize = exportPixelSize(settings)
  $: isTable = settings.format === 'excel-table' || settings.format === 'latex-table'
  $: isPlot = settings.format === 'plot-image'
  $: isReport = settings.format === 'pdf-report' || settings.format === 'latex-report' || settings.format === 'html'
  $: needsContent = isReport || isTable
  // A string key: the column array is a new object on every settings change.
  $: peakColumnKey = settings.peakColumns.join(',')
  $: void prepareContent(needsContent, state, peakColumnKey)
  $: appearance = {
    width: layoutSize.width,
    height: layoutSize.height,
    fontFamily: settings.fontFamily,
    fontSizePt: settings.fontSizePt,
    background: settings.background,
    showPeaks: settings.showPeaks,
    camera: $workspaceSceneCamera,
  } satisfies ExportAppearance

  /** Builds the report model after a paint, so the preview overlay shows before the synchronous work. */
  async function prepareContent(needed: boolean, current: AppState, columnKey: string): Promise<void> {
    const generation = ++contentGeneration
    if (!needed) {
      content = null
      preparing = false
      return
    }
    preparing = true
    const activity = beginActivity(`Preparing report preview (${current.datasets.length} samples)`)
    try {
      await afterPaint()
      if (generation !== contentGeneration) return
      content = buildReportContent(current, { peakColumns: columnKey ? (columnKey.split(',') as PeakColumn[]) : [] })
      await tick()
      await afterPaint()
    } finally {
      activity.end()
      if (generation === contentGeneration) preparing = false
    }
  }

  export function getPlotImage(): Promise<string> {
    if (!plotPanel) return Promise.reject(new Error('The plot preview is not ready yet.'))
    return plotPanel.toImage(exportImageScale(settings))
  }
</script>

<section class="export-preview" aria-label="Export preview">
  <header class="export-preview-header">
    <div>
      <strong>Export preview</strong>
      <span>{formatCm(settings.widthCm)} × {formatCm(settings.heightCm)} cm · {settings.dpi} dpi ({pixelSize.width} × {pixelSize.height} px) · {settings.fontFamily} {settings.fontSizePt} pt</span>
    </div>
    <button type="button" class="panel-close" aria-label="Close export preview" on:click={onClose}>x</button>
  </header>
  <div class="export-preview-body">
  {#if needsContent && !content}
    <div class="report-scroll"></div>
  {:else if isReport && content}
    <div class="report-scroll">
      <article class="report-page" style={`font-family:${settings.fontFamily};font-size:${settings.fontSizePt}pt`}>
        <h1>{content.title}</h1>
        <p class="report-meta">Generated {content.generated}</p>
        {#if datasets.length}
          <div class="report-figure">
            <ScaledFigure width={layoutSize.width} height={layoutSize.height}>
              <div class="plot-paper" class:transparent={settings.background === 'transparent'} class:dark={settings.background === 'dark'}>
                <PlotPanel bind:this={plotPanel} bind:rendering={plotRendering} {datasets} {plotStyle} {appearance} />
              </div>
            </ScaledFigure>
          </div>
        {/if}
        <ReportBody {content} />
      </article>
    </div>
  {:else if isPlot}
    {#if datasets.length}
      <div class="plot-stage">
        <ScaledFigure width={layoutSize.width} height={layoutSize.height} fit="contain">
          <div class="plot-paper outlined" class:transparent={settings.background === 'transparent'} class:dark={settings.background === 'dark'}>
            <PlotPanel bind:this={plotPanel} bind:rendering={plotRendering} {datasets} {plotStyle} {appearance} />
          </div>
        </ScaledFigure>
      </div>
    {:else}
      <p class="preview-empty">Import a spectrum to preview the plot export.</p>
    {/if}
  {:else if isTable && content}
    <div class="report-scroll">
      <article class="report-page" style={`font-family:${settings.fontFamily};font-size:${settings.fontSizePt}pt`}>
        <ReportBody {content} />
        {#if settings.format === 'excel-table'}
          <p class="report-meta">The workbook additionally contains a “Spectral data” sheet with the original and processed ordinates of every sample.</p>
        {/if}
      </article>
    </div>
  {:else}
    <div class="export-description">
      <h2>{settings.format === 'python' ? 'Standalone Python project' : settings.format === 'csv' ? 'Project CSV summary' : settings.format === 'json' ? 'Project JSON snapshot' : 'Export preview'}</h2>
      <p>{settings.format === 'python'
        ? 'The ZIP contains the current Python project files, samples.json, and one CSV data file per imported sample.'
        : settings.format === 'csv'
          ? 'A row per sample with spectrum type, axis units, point count, and numeric ranges.'
          : 'A complete snapshot of the current project state, including samples, metadata, pipelines, and script files.'}</p>
      <p>{state.datasets.length} sample(s) · {state.datasets.reduce((count, dataset) => count + dataset.data.abscissa.length, 0)} total points</p>
    </div>
  {/if}
  {#if needsContent && preparing}
    <LoadingOverlay message="Preparing report preview…" />
  {:else if (isReport || isPlot) && plotRendering}
    <LoadingOverlay message="Rendering export plot…" />
  {/if}
  </div>
</section>

<style>
  .export-preview{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);background:#202126}
  .export-preview-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 12px;border-bottom:1px solid var(--border);color:var(--text)}
  .export-preview-header div{display:flex;align-items:baseline;gap:12px;min-width:0}
  .export-preview-header span{color:var(--text-dim);font-size:.74rem}
  .export-preview-body{position:relative;min-height:0;height:100%}
  .plot-stage{min-height:0;height:100%;box-sizing:border-box;padding:12px}
  .plot-paper{width:100%;height:100%;box-sizing:border-box;background:#fff}
  .plot-paper.outlined{outline:1px solid #777}
  .plot-paper.transparent{background:repeating-conic-gradient(#e6e6e6 0 25%,#fff 0 50%) 0 0/16px 16px}
  .plot-paper.dark{background:#141519}
  .plot-paper :global(.plot-shell){background:transparent}
  .plot-paper :global(.plotly-panel){min-height:0}
  .report-scroll{height:100%;min-height:0;overflow:auto;background:#55575e;padding:16px 0;box-sizing:border-box}
  /* A4 page with 2 cm margins; narrower panels shrink the margins first, then the text block. */
  .report-page{width:21cm;max-width:calc(100% - 24px);margin:0 auto;box-sizing:border-box;padding:min(2cm,5%);background:#fff;color:#111}
  .report-page h1{font-size:1.6em;margin:0 0 .2em}
  .report-meta{color:#555;margin:0}
  .report-figure{margin:1em 0}
  .export-description{margin:0;height:100%;box-sizing:border-box;min-height:0;overflow:auto;padding:20px 26px;background:transparent;color:var(--text);font-size:.9rem}
  .preview-empty{align-self:center;justify-self:center;color:var(--text-dim)}
</style>
