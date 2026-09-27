<script lang="ts">
  import { tick } from 'svelte'
  import PlotPanel from '../PlotPanel.svelte'
  import { projectStore } from '../../state/projectStore'
  import type { SampleSubView } from './workbenchUtils'
  import WorkspaceTabs from './WorkspaceTabs.svelte'
  import SampleDataTable from './SampleDataTable.svelte'
  import PeakWorkspace from './PeakWorkspace.svelte'
  import ScriptWorkspace from './ScriptWorkspace.svelte'

  export let visibleDatasets: any[]
  export let selectedSpectrumId: string | null
  export let activeWorkspaceTab: string
  export let activeSampleSubView: SampleSubView
  export let activeSampleTabDataset: any | null
  export let openedSampleTabs: Array<{ tabId: string; dataset: any; subView: SampleSubView }>
  export let bottomPanelOpen: boolean
  export let bottomPanelHeight: number
  export let highlightedDatasetId: string | null = null
  export let onClearFileSelection: () => void
  export let onStartBottomResize: (event: MouseEvent) => void
  export let onOpenSubTab: (datasetId: string, subView: SampleSubView) => void
  export let onActivateScript: () => void
  export let onCloseTab: (tabId: string) => void
  export let onCloseBottomPanel: () => void

  let mainEl: HTMLElement | null = null
  let scriptWorkspace: any = null
  let hoverSelection: { datasetId: string; pointIndex: number } | null = null
  let peakHoverSelection: { datasetId: string; peakId: string } | null = null
  let peakZoomPeakId: string | null = null
  let peakProminence = 0.01
  let peakMinDistance = 1
  let peakMinHeight: number | null = null
  let peakMode: 'maxima' | 'minima' = 'maxima'
  let scriptExecutionTrigger = 0

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
  }

  function setHoverSelection(datasetId: string, pointIndex: number | null): void {
    if (pointIndex === null) {
      hoverSelection = null
      return
    }

    if (activeSampleTabDataset?.id === datasetId) {
      hoverSelection = { datasetId, pointIndex }
    }
  }

  function handlePlotHover(event: CustomEvent<{ datasetId: string; pointIndex: number } | null>): void {
    if (!event.detail) {
      hoverSelection = null
      return
    }
    setHoverSelection(event.detail.datasetId, event.detail.pointIndex)
  }

  function handlePlotPeakPick(event: CustomEvent<{ datasetId: string; pointIndex: number }>): void {
    if (!activeSampleTabDataset || activeSampleSubView !== 'peaks') return
    if (event.detail.datasetId !== activeSampleTabDataset.id) return
    projectStore.addPeakAtIndex(event.detail.datasetId, event.detail.pointIndex)
    triggerScriptExecution()
  }

  function setPeakHover(datasetId: string, peakId: string | null, fromTable: boolean): void {
    peakHoverSelection = peakId ? { datasetId, peakId } : null
    if (fromTable) peakZoomPeakId = peakId
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
    triggerScriptExecution()
  }

  function handlePeakParametersChange(): void {
    if (!activeSampleTabDataset) return
    projectStore.updatePeakDetectionSettings(activeSampleTabDataset.id, {
      prominence: peakProminence,
      minDistance: peakMinDistance,
      minHeight: peakMinHeight,
      mode: peakMode,
    })
    triggerScriptExecution()
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
</script>

<main
  class="main"
  bind:this={mainEl}
  style={`grid-template-rows:minmax(220px, 1fr) ${bottomPanelOpen ? 8 : 0}px ${bottomPanelOpen ? bottomPanelHeight : 0}px;`}
>
  <section class="plot-shell" role="presentation" on:click={clearSelection}>
    <PlotPanel
      datasets={visibleDatasets}
      {selectedSpectrumId}
      {hoverSelection}
      {peakHoverSelection}
      {peakZoomPeakId}
      {highlightedDatasetId}
      peakPickingEnabled={activeSampleSubView === 'peaks' && activeWorkspaceTab !== 'script_view'}
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

  <section class="bottom-panel" class:hidden={!bottomPanelOpen}>
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
  </section>
</main>
