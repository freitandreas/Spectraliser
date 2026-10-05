<script lang="ts">
  import type { SpectrumDataset } from '../../types/project'
  import { tick } from 'svelte'
  import PlotPanel from '../PlotPanel.svelte'
  import { projectStore } from '../../state/projectStore'
  import type { SampleSubView } from './workbenchUtils'
  import WorkspaceTabs from './WorkspaceTabs.svelte'
  import SampleDataTable from './SampleDataTable.svelte'
  import PeakWorkspace from './PeakWorkspace.svelte'
  import ScriptWorkspace from './ScriptWorkspace.svelte'
  import ExportPreview from './ExportPreview.svelte'
  import type { ExportSettings } from '../../services/export/exportSettings'
  import type { PlotStylePreferences } from '../../services/startupPreferences'
  import { peakSingleSeriesView } from '../../state/displaySettings'
  import { singleSeriesView, type PlotView } from '../plot/singleSeriesView'

  export let visibleDatasets: SpectrumDataset[]
  export let selectedSpectrumId: string | null
  export let activeWorkspaceTab: string
  export let activeSampleSubView: SampleSubView
  export let activeSampleTabDataset: SpectrumDataset | null
  export let openedSampleTabs: Array<{ tabId: string; dataset: SpectrumDataset; subView: SampleSubView }>
  export let bottomPanelOpen: boolean
  export let bottomPanelHeight: number
  export let highlightedDatasetId: string | null = null
  export let plotStyle: PlotStylePreferences
  export let onClearFileSelection: () => void
  export let onStartBottomResize: (event: MouseEvent) => void
  export let onOpenSubTab: (datasetId: string, subView: SampleSubView) => void
  export let onActivateScript: () => void
  export let onCloseTab: (tabId: string) => void
  export let onCloseBottomPanel: () => void
  export let onLinkMetadata: (() => void) | null = null
  export let exportPreviewOpen = false
  export let exportSettings: ExportSettings

  let mainEl: HTMLElement | null = null
  let scriptWorkspace: ScriptWorkspace | null = null
  let exportPreview: ExportPreview | null = null
  let hoverSelection: { datasetId: string; pointIndex: number } | null = null
  let peakHoverSelection: { datasetId: string; peakId: string } | null = null
  let peakZoomPeakId: string | null = null
  let peakProminence = 0.01
  let peakMinDistance = 1
  let peakMinHeight: number | null = null
  let peakMode: 'maxima' | 'minima' = 'maxima'
  let peakAuto = false
  let scriptExecutionTrigger = 0

  $: peakPanelActive = activeSampleSubView === 'peaks' && activeWorkspaceTab !== 'script_view' && !!activeSampleTabDataset
  let plotView: PlotView
  $: plotView = peakPanelActive && $peakSingleSeriesView && activeSampleTabDataset
    ? singleSeriesView(activeSampleTabDataset, plotStyle)
    : { datasets: visibleDatasets, plotStyle, selectedSpectrumId }

  $: if (activeWorkspaceTab === 'script_view' || !activeSampleTabDataset) {
    hoverSelection = null
  }

  $: if (activeSampleSubView !== 'peaks' || !activeSampleTabDataset) {
    peakHoverSelection = null
    peakZoomPeakId = null
  }

  $: if (activeSampleTabDataset?.peakDetection) {
    peakProminence = activeSampleTabDataset.peakDetection.prominence
    peakMinDistance = activeSampleTabDataset.peakDetection.minDistance
    peakMinHeight = activeSampleTabDataset.peakDetection.minHeight
    peakMode = activeSampleTabDataset.peakDetection.mode
    peakAuto = activeSampleTabDataset.peakDetection.auto === true
  }

  // Hover state fans out to the plot and both tables; it is only reassigned when it actually changes.
  function setHoverSelection(datasetId: string, pointIndex: number | null): void {
    if (pointIndex === null || activeSampleTabDataset?.id !== datasetId) {
      if (hoverSelection) hoverSelection = null
      return
    }
    if (hoverSelection?.datasetId === datasetId && hoverSelection.pointIndex === pointIndex) return
    hoverSelection = { datasetId, pointIndex }
  }

  function handlePlotHover(event: CustomEvent<{ datasetId: string; pointIndex: number } | null>): void {
    if (!event.detail) {
      if (hoverSelection) hoverSelection = null
      return
    }
    setHoverSelection(event.detail.datasetId, event.detail.pointIndex)
  }

  function handlePlotPeakPick(event: CustomEvent<{ datasetId: string; pointIndex: number }>): void {
    if (!activeSampleTabDataset || activeSampleSubView !== 'peaks') return
    if (event.detail.datasetId !== activeSampleTabDataset.id) return
    projectStore.addPeakAtIndex(event.detail.datasetId, event.detail.pointIndex)
  }

  function setPeakHover(datasetId: string, peakId: string | null, fromTable: boolean): void {
    if (fromTable && peakZoomPeakId !== peakId) peakZoomPeakId = peakId
    if (!peakId) {
      if (peakHoverSelection) peakHoverSelection = null
      return
    }
    if (peakHoverSelection?.datasetId === datasetId && peakHoverSelection.peakId === peakId) return
    peakHoverSelection = { datasetId, peakId }
  }

  function handlePlotPeakHover(event: CustomEvent<{ datasetId: string; peakId: string } | null>): void {
    if (!event.detail) {
      setPeakHover('', null, false)
      return
    }
    setPeakHover(event.detail.datasetId, event.detail.peakId, false)
  }

  function clearSelection(): void {
    hoverSelection = null
    onClearFileSelection()
  }

  function activateScript(): void {
    onActivateScript()
    void tick().then(() => scriptWorkspace?.requestMeasure())
  }

  function triggerScriptExecution(): void {
    scriptExecutionTrigger += 1
    scriptWorkspace?.requestAutoExecute()
  }

  function handlePeakModeChange(mode: 'maxima' | 'minima'): void {
    peakMode = mode
  }

  function handlePeakParametersChange(): void {
    if (!activeSampleTabDataset) return
    projectStore.updatePeakDetectionSettings(activeSampleTabDataset.id, {
      prominence: peakProminence,
      minDistance: peakMinDistance,
      minHeight: peakMinHeight,
      mode: peakMode,
      auto: peakAuto,
    })
  }

  export function clearHoverSelection(): void {
    hoverSelection = null
  }

  export function requestScriptMeasure(): void {
    scriptWorkspace?.requestMeasure()
  }

  export function getMainHeight(): number {
    return mainEl?.clientHeight ?? 0
  }

  export function getExportPlotImage(): Promise<string> {
    if (!exportPreview) return Promise.reject(new Error('The export preview is not open.'))
    return exportPreview.getPlotImage()
  }
</script>

<main
  class="main"
  bind:this={mainEl}
  style={`grid-template-rows:minmax(${exportPreviewOpen ? 120 : 220}px, 1fr) ${bottomPanelOpen ? 8 : 0}px ${bottomPanelOpen ? bottomPanelHeight : 0}px;`}
>
  <section class="plot-shell" role="presentation" on:click={clearSelection}>
    <PlotPanel
      datasets={plotView.datasets}
      selectedSpectrumId={plotView.selectedSpectrumId}
      {hoverSelection}
      {peakHoverSelection}
      {peakZoomPeakId}
      {highlightedDatasetId}
      plotStyle={plotView.plotStyle}
      peakPickingEnabled={peakPanelActive}
      on:hoverpoint={handlePlotHover}
      on:peakpick={handlePlotPeakPick}
      on:peakhover={handlePlotPeakHover}
    />
  </section>

  <button
    type="button"
    class="resizer-row"
    class:hidden={!bottomPanelOpen}
    aria-label="Resize bottom panel"
    on:mousedown={onStartBottomResize}
  ></button>

  <section class="bottom-panel" class:hidden={!bottomPanelOpen} class:export-mode={exportPreviewOpen}>
    {#if exportPreviewOpen}
      <ExportPreview
        bind:this={exportPreview}
        state={$projectStore}
        datasets={visibleDatasets}
        {plotStyle}
        settings={exportSettings}
        onClose={onCloseBottomPanel}
      />
    {:else}
      <WorkspaceTabs
        {openedSampleTabs}
        {activeWorkspaceTab}
        onOpenSubTab={onOpenSubTab}
        onActivateScript={activateScript}
        onCloseTab={onCloseTab}
        onClosePanel={onCloseBottomPanel}
      />

      {#if activeWorkspaceTab !== 'script_view' && activeSampleTabDataset}
        <div class="sample-shell">
          {#if activeSampleSubView === 'data'}
            <SampleDataTable
              dataset={activeSampleTabDataset}
              {hoverSelection}
              onHover={setHoverSelection}
              {onLinkMetadata}
            />
          {:else}
            <PeakWorkspace
              dataset={activeSampleTabDataset}
              {peakHoverSelection}
              onPeakHover={setPeakHover}
              bind:prominence={peakProminence}
              bind:minDistance={peakMinDistance}
              bind:minHeight={peakMinHeight}
              bind:mode={peakMode}
              bind:auto={peakAuto}
              onModeChange={handlePeakModeChange}
              onParametersChange={handlePeakParametersChange}
              onDetectionComplete={triggerScriptExecution}
            />
          {/if}
        </div>
      {/if}

      <ScriptWorkspace
        bind:this={scriptWorkspace}
        active={activeWorkspaceTab === 'script_view'}
        executionTrigger={scriptExecutionTrigger}
      />
    {/if}
  </section>
</main>
