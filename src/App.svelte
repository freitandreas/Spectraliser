<script lang="ts">
  import { tick } from 'svelte'
  import ImportWizard from './lib/ImportWizard.svelte'
  import StartupWizard from './lib/StartupWizard.svelte'
  import WorkbenchHeader from './lib/workbench/WorkbenchHeader.svelte'
  import SampleExplorer from './lib/workbench/SampleExplorer.svelte'
  import WorkspaceMain from './lib/workbench/WorkspaceMain.svelte'
  import SettingsSidebar from './lib/workbench/SettingsSidebar.svelte'
  import ConfirmDialogs from './lib/workbench/ConfirmDialogs.svelte'
  import { importFilesWithOptions } from './services/import/appImport'
  import { downloadReport, type ExportFormat } from './services/export/downloadReport'
  import type { ImportOptions } from './services/import/parsers'
  import { projectStore } from './state/projectStore'
  import {
    hasCompletedStartupWizard,
    loadStartupPreferences,
    saveStartupPreferences,
    type StartupPreferences,
  } from './services/startupPreferences'
  import { computePrecision } from './state/computeSettings'
  import { quantityNotation } from './state/displaySettings'
  import { removeAllDatasets, setAllDatasetsVisible, setTransformEnabled, setTransformParams } from './state/workbenchActions'
  import { applyGeneralChange, planGeneralChange, type GeneralSettingsContext } from './state/generalSettingsActions'
  import {
    beginResize,
    resolveResize,
    type ActiveResize,
    type PanelSizes,
  } from './lib/workbench/panelResize'
  import {
    makeSampleTabId,
    parseSampleTabId,
    type ResizeKind,
    type SampleSubView,
  } from './lib/workbench/workbenchUtils'

  let importOpen = false
  let importError = ''
  let wizardFiles: File[] = []
  let startupWizardOpen = !hasCompletedStartupWizard()
  let startupPreferences: StartupPreferences = loadStartupPreferences()
  $: computePrecision.set(startupPreferences.computePrecision)
  $: quantityNotation.set(startupPreferences.plotStyle.quantityNotation)
  let exportOpen = false
  let exportFormat: ExportFormat = 'html'

  let overwriteModalOpen = false
  let pendingGuiAction: (() => void) | null = null

  let layoutEl: HTMLDivElement | null = null
  let workspaceMain: any = null
  let openSampleTabIds: string[] = []
  let expandedSampleId: string | null = null
  let explorerFocusDatasetId: string | null = null
  let activeWorkspaceTab: 'script_view' | string = 'script_view'
  let leftPanelWidth = 260
  let rightPanelWidth = 320
  let bottomPanelHeight = 360

  let leftPanelOpen = true
  let rightPanelOpen = true
  let bottomPanelOpen = true
  let rightPanelDatasetId: string | null = null
  let explorerHoverDatasetId: string | null = null

  let activeResize: ActiveResize | null = null

  $: panelSizes = { left: leftPanelWidth, right: rightPanelWidth, bottom: bottomPanelHeight } as PanelSizes

  $: plotSelectedSpectrumId = explorerFocusDatasetId
    ?? (activeWorkspaceTab === 'script_view' ? null : $projectStore.viewState.selectedSpectrumId)

  $: openedSampleTabs = openSampleTabIds
    .map((tabId) => {
      const parsed = parseSampleTabId(tabId)
      if (!parsed) return null

      const dataset = $projectStore.datasets.find((item) => item.id === parsed.datasetId)
      if (!dataset) return null

      return { tabId, dataset, subView: parsed.subView }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  $: visibleDatasets = $projectStore.datasets.filter((dataset) => dataset.style.visible !== false)
  $: activeSampleTabMeta = activeWorkspaceTab === 'script_view' ? null : parseSampleTabId(activeWorkspaceTab)
  $: activeSampleTabDataset = activeSampleTabMeta
    ? ($projectStore.datasets.find((dataset) => dataset.id === activeSampleTabMeta.datasetId) ?? null)
    : null
  $: activeSampleSubView = activeSampleTabMeta?.subView ?? 'data'

  $: {
    const available = new Set($projectStore.datasets.map((dataset) => dataset.id))
    const filtered = openSampleTabIds.filter((id) => {
      const parsed = parseSampleTabId(id)
      return parsed ? available.has(parsed.datasetId) : false
    })

    if (filtered.length !== openSampleTabIds.length) openSampleTabIds = filtered

    if (activeWorkspaceTab !== 'script_view') {
      const activeParsed = parseSampleTabId(activeWorkspaceTab)
      if (!activeParsed || !available.has(activeParsed.datasetId)) {
        activeWorkspaceTab = filtered[filtered.length - 1] ?? 'script_view'
      }
    }

    if (expandedSampleId && !available.has(expandedSampleId)) expandedSampleId = null
    if (explorerFocusDatasetId && !available.has(explorerFocusDatasetId)) explorerFocusDatasetId = null
    if (explorerHoverDatasetId && !available.has(explorerHoverDatasetId)) explorerHoverDatasetId = null
    if (rightPanelDatasetId && !available.has(rightPanelDatasetId)) rightPanelDatasetId = null
  }

  $: rightPanelDataset = rightPanelDatasetId
    ? ($projectStore.datasets.find((dataset) => dataset.id === rightPanelDatasetId) ?? null)
    : null

  async function handleImport(event: CustomEvent<{ files: File[]; options: ImportOptions }>): Promise<void> {
    importError = ''
    const { files, options } = event.detail

    try {
      const error = await importFilesWithOptions(files, options)
      if (error) {
        importError = error
        return
      }
      importOpen = false
      wizardFiles = []
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Import failed.'
    }
  }

  function openWizardWithFiles(files: File[]): void {
    if (files.length === 0) return
    wizardFiles = files
    importOpen = true
  }

  function completeStartupWizard(event: CustomEvent<StartupPreferences>): void {
    const chosen = event.detail
    // Wizard choices are explicit project-wide defaults, so every sample adopts them.
    const direct: GeneralSettingsContext = { ...generalContext, queueGuiAction: (action) => action() }
    queueGuiAction(() => {
      applyGeneralChange(planGeneralChange({ kind: 'axes', axes: chosen.axes }, direct), 'all')
      applyGeneralChange(planGeneralChange({ kind: 'lineWidth', lineWidth: chosen.plotStyle.lineWidth }, direct), 'all')
    })
    startupPreferences = chosen
    saveStartupPreferences(startupPreferences)
    startupWizardOpen = false
  }

  function persistAxes(axes: StartupPreferences['axes']): void {
    startupPreferences = { ...startupPreferences, axes: { ...axes } }
    saveStartupPreferences(startupPreferences)
  }

  function persistLineWidth(lineWidth: number): void {
    updatePlotStyle({ ...startupPreferences.plotStyle, lineWidth })
  }

  $: generalContext = { axes: startupPreferences.axes, queueGuiAction, persistAxes, persistLineWidth } satisfies GeneralSettingsContext

  function updatePlotStyle(plotStyle: StartupPreferences['plotStyle']): void {
    startupPreferences = { ...startupPreferences, plotStyle }
    saveStartupPreferences(startupPreferences)
  }

  function updateComputePrecision(precision: StartupPreferences['computePrecision']): void {
    startupPreferences = { ...startupPreferences, computePrecision: precision }
    saveStartupPreferences(startupPreferences)
  }

  function queueGuiAction(action: () => void): void {
    if ($projectStore.syncMode === 'desync_active') {
      pendingGuiAction = action
      overwriteModalOpen = true
      return
    }
    action()
  }

  function renameDataset(datasetId: string, label: string): void {
    queueGuiAction(() => projectStore.updateStyle(datasetId, { label }))
  }

  function updateDatasetStyle(datasetId: string, patch: Record<string, unknown>): void {
    queueGuiAction(() => projectStore.updateStyle(datasetId, patch as any))
  }

  function updateDatasetMetadata(datasetId: string, patch: Record<string, unknown>): void {
    queueGuiAction(() => projectStore.updateDatasetMetadata(datasetId, patch as any))
  }

  function confirmOverwriteAndApply(): void {
    if (!pendingGuiAction) {
      overwriteModalOpen = false
      return
    }

    projectStore.confirmOverwriteForGuiEdits()
    pendingGuiAction()
    pendingGuiAction = null
    overwriteModalOpen = false
  }

  function cancelOverwrite(): void {
    pendingGuiAction = null
    overwriteModalOpen = false
  }

  function updateTransformEnabled(datasetId: string, transformId: string, enabled: boolean): void {
    setTransformEnabled(queueGuiAction, datasetId, transformId, enabled)
  }

  function updateTransformParam(datasetId: string, transformId: string, params: Record<string, number | string | boolean>): void {
    setTransformParams(queueGuiAction, datasetId, transformId, params)
  }

  function confirmExport(): void {
    exportOpen = false
    downloadReport(exportFormat)
  }

  function startNewSession(): void {
    if ($projectStore.datasets.length > 0) {
      if (!confirm(`Start a new session and remove all ${$projectStore.datasets.length} samples?`)) return
      removeAllDatasets()
    }
    startupWizardOpen = true
  }

  function clearFileSelection(): void {
    explorerFocusDatasetId = null
    rightPanelDatasetId = null
  }

  function removeDatasetFromExplorer(datasetId: string): void {
    const dataset = $projectStore.datasets.find((item) => item.id === datasetId)
    if (dataset && confirm(`Remove ${dataset.style.label}?`)) projectStore.removeDataset(dataset.id)
  }

  function toggleSampleExpanded(datasetId: string): void {
    expandedSampleId = expandedSampleId === datasetId ? null : datasetId
  }

  function focusSampleInExplorer(datasetId: string): void {
    toggleSampleExpanded(datasetId)
    explorerFocusDatasetId = datasetId
    rightPanelDatasetId = datasetId
    rightPanelOpen = true
    workspaceMain?.clearHoverSelection()
    projectStore.selectDataset(datasetId)
  }

  function toggleSampleVisibility(datasetId: string): void {
    const dataset = $projectStore.datasets.find((item) => item.id === datasetId)
    if (!dataset) return

    const currentlyVisible = dataset.style.visible !== false
    queueGuiAction(() => projectStore.updateStyle(datasetId, { visible: !currentlyVisible }))
  }

  function activateScriptTab(): void {
    activeWorkspaceTab = 'script_view'
    explorerFocusDatasetId = null
    projectStore.setActiveTab('script_view')
  }

  function openSampleSubTab(datasetId: string, subView: SampleSubView): void {
    const tabId = makeSampleTabId(datasetId, subView)
    if (!openSampleTabIds.includes(tabId)) openSampleTabIds = [...openSampleTabIds, tabId]

    activeWorkspaceTab = tabId
    explorerFocusDatasetId = null
    rightPanelDatasetId = datasetId
    rightPanelOpen = true
    bottomPanelOpen = true
    projectStore.selectDataset(datasetId)
    projectStore.setActiveTab(subView === 'peaks' ? 'peak_table' : 'sample_view')
  }

  function startResize(kind: ResizeKind, event: MouseEvent): void {
    event.preventDefault()
    activeResize = beginResize(kind, event, panelSizes)

    document.body.style.userSelect = 'none'
    document.body.style.cursor = kind === 'bottom' ? 'row-resize' : 'col-resize'
    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', stopResize)
  }

  function handleResizeMove(event: MouseEvent): void {
    if (!activeResize || !layoutEl) return

    const next = resolveResize(activeResize, event, panelSizes, {
      layoutWidth: layoutEl.clientWidth,
      mainHeight: workspaceMain?.getMainHeight() ?? 0,
    })

    leftPanelWidth = next.left
    rightPanelWidth = next.right
    bottomPanelHeight = next.bottom
    workspaceMain?.requestScriptMeasure()
  }

  function stopResize(): void {
    activeResize = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    window.removeEventListener('mousemove', handleResizeMove)
    window.removeEventListener('mouseup', stopResize)
  }

  function closeSampleTab(tabId: string): void {
    const nextTabs = openSampleTabIds.filter((id) => id !== tabId)
    const wasActive = activeWorkspaceTab === tabId
    openSampleTabIds = nextTabs
    if (!wasActive) return

    const fallbackId = nextTabs[nextTabs.length - 1]
    if (!fallbackId) {
      activateScriptTab()
      void tick().then(() => workspaceMain?.requestScriptMeasure())
      return
    }

    activeWorkspaceTab = fallbackId
    const parsed = parseSampleTabId(fallbackId)
    if (parsed) {
      projectStore.selectDataset(parsed.datasetId)
      projectStore.setActiveTab(parsed.subView === 'peaks' ? 'peak_table' : 'sample_view')
    }
  }
</script>

<div class="workbench">
  <WorkbenchHeader
    {leftPanelOpen}
    {bottomPanelOpen}
    {rightPanelOpen}
    scriptProgress={$projectStore.scriptProgress}
    onToggleData={() => { leftPanelOpen = !leftPanelOpen }}
    onToggleScript={() => {
      bottomPanelOpen = !bottomPanelOpen
      if (bottomPanelOpen) {
        activateScriptTab()
        void tick().then(() => workspaceMain?.requestScriptMeasure())
      }
    }}
    onAnalyse={() => {
      const selectedId = $projectStore.viewState.selectedSpectrumId ?? $projectStore.datasets[0]?.id
      if (selectedId) openSampleSubTab(selectedId, 'data')
    }}
    onToggleSettings={() => {
      rightPanelOpen = !rightPanelOpen
      if (rightPanelOpen) rightPanelDatasetId = null
    }}
    onExport={() => { exportOpen = true }}
    datasetCount={$projectStore.datasets.length}
    onStartNewSession={startNewSession}
    onShowAll={() => setAllDatasetsVisible(queueGuiAction, true)}
    onHideAll={() => setAllDatasetsVisible(queueGuiAction, false)}
  />

  <div
    class="layout"
    bind:this={layoutEl}
    style={`grid-template-columns:${leftPanelOpen ? leftPanelWidth : 0}px ${leftPanelOpen ? 6 : 0}px minmax(0, 1fr) ${rightPanelOpen ? 6 : 0}px ${rightPanelOpen ? rightPanelWidth : 0}px;`}
  >
    <SampleExplorer
      open={leftPanelOpen}
      datasets={$projectStore.datasets}
      {expandedSampleId}
      selectedDatasetId={explorerFocusDatasetId ?? $projectStore.viewState.selectedSpectrumId}
      onClose={() => { leftPanelOpen = false }}
      onFiles={openWizardWithFiles}
      onFocus={focusSampleInExplorer}
      onToggleVisibility={toggleSampleVisibility}
      onRemove={removeDatasetFromExplorer}
      onOpenSubTab={openSampleSubTab}
      onHoverSample={(datasetId) => { explorerHoverDatasetId = datasetId }}
    />

    <button
      type="button"
      class="resizer-col"
      class:hidden={!leftPanelOpen}
      aria-label="Resize left panel"
      on:mousedown={(event) => startResize('left', event)}
    ></button>

    <WorkspaceMain
      bind:this={workspaceMain}
      {visibleDatasets}
      selectedSpectrumId={plotSelectedSpectrumId}
      {activeWorkspaceTab}
      {activeSampleSubView}
      {activeSampleTabDataset}
      {openedSampleTabs}
      {bottomPanelOpen}
      {bottomPanelHeight}
      highlightedDatasetId={explorerHoverDatasetId}
      plotStyle={startupPreferences.plotStyle}
      onClearFileSelection={clearFileSelection}
      onStartBottomResize={(event) => startResize('bottom', event)}
      onOpenSubTab={openSampleSubTab}
      onActivateScript={activateScriptTab}
      onCloseTab={closeSampleTab}
      onCloseBottomPanel={() => { bottomPanelOpen = false }}
    />

    <button
      type="button"
      class="resizer-col"
      class:hidden={!rightPanelOpen}
      aria-label="Resize right panel"
      on:mousedown={(event) => startResize('right', event)}
    ></button>

    <SettingsSidebar
      open={rightPanelOpen}
      dataset={rightPanelDataset}
      datasets={$projectStore.datasets}
      generalSettings={$projectStore.generalSettings}
      {generalContext}
      onClose={() => { rightPanelOpen = false }}
      onRename={renameDataset}
      onUpdateStyle={updateDatasetStyle}
      onUpdateMetadata={updateDatasetMetadata}
      onRerunPipeline={(datasetId) => projectStore.rerunPipeline(datasetId)}
      onTransformEnabled={updateTransformEnabled}
      onTransformParam={updateTransformParam}
      plotStyle={startupPreferences.plotStyle}
      onUpdatePlotStyle={updatePlotStyle}
      computePrecision={startupPreferences.computePrecision}
      onUpdateComputePrecision={updateComputePrecision}
    />
  </div>

  {#if importError}
    <div class="toast toast-error">{importError}</div>
  {/if}
</div>

{#if exportOpen}
  <div class="confirm-backdrop" role="presentation">
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="Export options">
      <h3>Export project</h3>
      <div class="export-options">
        <label>
          <input type="radio" bind:group={exportFormat} value="html" />
          HTML report
        </label>
        <label>
          <input type="radio" bind:group={exportFormat} value="csv" />
          CSV summary
        </label>
        <label>
          <input type="radio" bind:group={exportFormat} value="json" />
          JSON snapshot
        </label>
        <label>
          <input type="radio" bind:group={exportFormat} value="python" />
          Python project (.zip) — current scripts, samples.json and imported data
        </label>
      </div>
      <div class="confirm-actions">
        <button type="button" class="ghost" on:click={() => { exportOpen = false }}>Cancel</button>
        <button type="button" class="run" on:click={confirmExport}>Download</button>
      </div>
    </div>
  </div>
{/if}

<ImportWizard
  open={importOpen}
  files={wizardFiles}
  defaultSpectrumType={startupPreferences.spectrumType}
  {startupPreferences}
  on:close={() => {
    importOpen = false
    wizardFiles = []
  }}
  on:import={handleImport}
/>

<StartupWizard
  open={startupWizardOpen}
  initialPreferences={startupPreferences}
  on:complete={completeStartupWizard}
/>

<ConfirmDialogs
  overwriteOpen={overwriteModalOpen}
  onCancelOverwrite={cancelOverwrite}
  onConfirmOverwrite={confirmOverwriteAndApply}
/>
