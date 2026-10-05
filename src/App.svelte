<script lang="ts">
  import { workspaceSceneCamera } from './lib/plot/sceneCamera'
  import { tick } from 'svelte'
  import ImportWizard from './lib/ImportWizard.svelte'
  import ExperimentMetadataImport from './lib/ExperimentMetadataImport.svelte'
  import StartupWizard from './lib/StartupWizard.svelte'
  import WorkbenchHeader from './lib/workbench/WorkbenchHeader.svelte'
  import SampleExplorer from './lib/workbench/SampleExplorer.svelte'
  import WorkspaceMain from './lib/workbench/WorkspaceMain.svelte'
  import SettingsSidebar from './lib/workbench/SettingsSidebar.svelte'
  import ExportSidebar from './lib/workbench/ExportSidebar.svelte'
  import ConfirmDialogs from './lib/workbench/ConfirmDialogs.svelte'
  import { importFilesWithOptions } from './services/import/appImport'
  import { executeExport } from './services/export/executeExport'
  import { DEFAULT_EXPORT_SETTINGS, type ExportSettings } from './services/export/exportSettings'
  import type { ImportOptions } from './services/import/parsers'
  import { projectStore } from './state/projectStore'
  import type { MetadataPatch, StylePatch } from './state/datasetActions'
  import type { SpectrumDataset } from './types/project'
  import {
    hasCompletedStartupWizard,
    loadStartupPreferences,
    saveStartupPreferences,
    type StartupPreferences,
  } from './services/startupPreferences'
  import { computePrecision } from './state/computeSettings'
  import { quantityNotation } from './state/displaySettings'
  import { removeAllDatasets, setAllDatasetsVisible, setTransformEnabled, setTransformParams } from './state/workbenchActions'
  import { applyGeneralChange, generalSettingsError, planGeneralChange, type GeneralSettingsContext } from './state/generalSettingsActions'
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
  let metadataImportOpen = false
  let metadataError = ''
  let importError = ''
  let wizardFiles: File[] = []
  let startupWizardOpen = !hasCompletedStartupWizard()
  let startupPreferences: StartupPreferences = loadStartupPreferences()
  $: computePrecision.set(startupPreferences.computePrecision)
  $: quantityNotation.set(startupPreferences.plotStyle.quantityNotation)
  let exportOpen = false
  let exportSettings: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS }
  let exportBusy = false
  let exportError = ''
  let previousExportLayout: {
    bottomPanelOpen: boolean
    bottomPanelHeight: number
    rightPanelOpen: boolean
    rightPanelDatasetId: string | null
  } | null = null

  let overwriteModalOpen = false
  let pendingGuiAction: (() => void) | null = null

  let layoutEl: HTMLDivElement | null = null
  let workspaceMain: WorkspaceMain | null = null
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

  // Only a new datasets array changes the plotted set; view-state updates keep the same reference.
  let visibleSource: SpectrumDataset[] | null = null
  let visibleDatasets: SpectrumDataset[] = []
  $: if ($projectStore.datasets !== visibleSource) {
    visibleSource = $projectStore.datasets
    visibleDatasets = visibleSource.filter((dataset) => dataset.style.visible !== false)
  }
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
  $: selectedDatasetId = $projectStore.datasets.find(
    (dataset) => dataset.id === $projectStore.viewState.selectedSpectrumId,
  )?.id ?? null
  $: allDatasetsVisible = $projectStore.datasets.length > 0
    && $projectStore.datasets.every((dataset) => dataset.style.visible !== false)

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

  function handleMetadataImport(event: CustomEvent<{
    table: import('./services/metadata/importMetadata').MetadataTable
    delimiter: import('./services/metadata/importMetadata').MetadataDelimiter
    matchField: import('./services/metadata/importMetadata').MetadataMatchField
    keyColumn: string
  }>): void {
    const { table, ...options } = event.detail
    const result = projectStore.linkExperimentMetadata(table, options)
    if (result.errors.length) {
      metadataError = result.errors.join(' ')
      return
    }
    metadataError = ''
    metadataImportOpen = false
  }

  function openWizardWithFiles(files: File[]): void {
    if (files.length === 0) return
    wizardFiles = files
    importOpen = true
  }

  function openImportFiles(): void {
    importError = ''
    wizardFiles = []
    importOpen = true
  }

  function startNewSession(): void {
    if ($projectStore.datasets.length > 0) {
      if (!confirm(`Start a new session and remove all ${$projectStore.datasets.length} samples?`)) return
      removeAllDatasets()
    }
    startupWizardOpen = true
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

  function openMetadataLink(): void {
    metadataError = ''
    metadataImportOpen = true
  }

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

  function updateDatasetStyle(datasetId: string, patch: StylePatch): void {
    queueGuiAction(() => projectStore.updateStyle(datasetId, patch))
  }

  function updateDatasetMetadata(datasetId: string, patch: MetadataPatch): void {
    queueGuiAction(() => {
      try {
        projectStore.updateDatasetMetadata(datasetId, patch)
        if (patch.units) generalSettingsError.set('')
      } catch (error) {
        generalSettingsError.set(error instanceof Error ? error.message : String(error))
      }
    })
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

  function openExport(): void {
    if (exportOpen) return
    previousExportLayout = {
      bottomPanelOpen,
      bottomPanelHeight,
      rightPanelOpen,
      rightPanelDatasetId,
    }
    exportError = ''
    exportOpen = true
    rightPanelOpen = true
    bottomPanelOpen = true
    const availableHeight = layoutEl?.clientHeight ?? window.innerHeight - 100
    bottomPanelHeight = Math.round(availableHeight * 0.76)
  }

  function closeExport(): void {
    if (!exportOpen) return
    exportOpen = false
    if (previousExportLayout) {
      bottomPanelOpen = previousExportLayout.bottomPanelOpen
      bottomPanelHeight = previousExportLayout.bottomPanelHeight
      rightPanelOpen = previousExportLayout.rightPanelOpen
      rightPanelDatasetId = previousExportLayout.rightPanelDatasetId
    }
    previousExportLayout = null
  }

  async function runExport(): Promise<void> {
    if (exportBusy) return
    exportBusy = true
    exportError = ''
    let pdfWindow: Window | null = null
    try {
      if (exportSettings.format === 'pdf-report') {
        pdfWindow = window.open('', '_blank')
        if (!pdfWindow) throw new Error('The PDF print window was blocked. Allow pop-ups and try again.')
      }
      const needsPlot = ['plot-image', 'latex-report'].includes(exportSettings.format)
        || (['pdf-report', 'html'].includes(exportSettings.format) && visibleDatasets.length > 0)
      const image = needsPlot ? await workspaceMain?.getExportPlotImage() ?? null : null
      executeExport(projectStore.snapshot(), exportSettings, image, {
        plotStyle: startupPreferences.plotStyle,
        camera: $workspaceSceneCamera,
      }, pdfWindow)
      closeExport()
    } catch (error) {
      pdfWindow?.close()
      exportError = error instanceof Error ? error.message : String(error)
    } finally {
      exportBusy = false
    }
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
    {allDatasetsVisible}
    {selectedDatasetId}
    onToggleAllVisibility={() => setAllDatasetsVisible(queueGuiAction, !allDatasetsVisible)}
    onImportFiles={openImportFiles}
    onStartNewSession={startNewSession}
    onToggleSampleExplorer={() => { leftPanelOpen = !leftPanelOpen }}
    onShowDataTable={() => {
      if (selectedDatasetId) openSampleSubTab(selectedDatasetId, 'data')
    }}
    onShowPeakAssignments={() => {
      if (selectedDatasetId) openSampleSubTab(selectedDatasetId, 'peaks')
    }}
    onShowScript={() => {
      bottomPanelOpen = true
      activateScriptTab()
      void tick().then(() => workspaceMain?.requestScriptMeasure())
    }}
    onShowSettings={() => {
      rightPanelOpen = true
      rightPanelDatasetId = null
    }}
    onExport={openExport}
    onLinkMetadata={openMetadataLink}
    datasetCount={$projectStore.datasets.length}
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
      onCloseBottomPanel={() => {
        if (exportOpen) closeExport()
        else bottomPanelOpen = false
      }}
      onLinkMetadata={openMetadataLink}
      exportPreviewOpen={exportOpen}
      {exportSettings}
    />

    <button
      type="button"
      class="resizer-col"
      class:hidden={!rightPanelOpen}
      aria-label="Resize right panel"
      on:mousedown={(event) => startResize('right', event)}
    ></button>

    {#if exportOpen}
      <ExportSidebar
        settings={exportSettings}
        onChange={(next) => { exportSettings = next }}
        onExport={() => { void runExport() }}
        onClose={closeExport}
        error={exportError}
        busy={exportBusy}
      />
    {:else}
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
    {/if}
  </div>

  {#if importError}
    <div class="toast toast-error">{importError}</div>
  {/if}
</div>

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

<ExperimentMetadataImport
  open={metadataImportOpen}
  datasets={$projectStore.datasets}
  error={metadataError}
  on:close={() => { metadataImportOpen = false }}
  on:import={handleMetadataImport}
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
