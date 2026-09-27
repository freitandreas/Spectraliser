<script lang="ts">
  import { tick } from 'svelte'
  import ImportWizard from './lib/ImportWizard.svelte'
  import WorkbenchHeader from './lib/workbench/WorkbenchHeader.svelte'
  import SampleExplorer from './lib/workbench/SampleExplorer.svelte'
  import WorkspaceMain from './lib/workbench/WorkspaceMain.svelte'
  import SettingsSidebar from './lib/workbench/SettingsSidebar.svelte'
  import ConfirmDialogs from './lib/workbench/ConfirmDialogs.svelte'
  import { importFileWithOptions } from './services/import/appImport'
  import { downloadReport } from './services/export/downloadReport'
  import type { ImportOptions } from './services/import/parsers'
  import { projectStore } from './state/projectStore'
  import { type NormalizationMode } from './types/project'
  import {
    applyGlobalAxisMetadata,
    applyGlobalLineWidth,
    applyGlobalNormalization,
    applyGlobalPalette,
    applyGlobalSmoothing,
    removeAllDatasets,
    setAllDatasetsVisible,
    setTransformEnabled,
    setTransformParams,
    type GlobalApplyContext,
  } from './state/workbenchActions'
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
  let exportOpen = false
  let exportFormat: 'html' | 'csv' | 'json' = 'html'

  let overwriteModalOpen = false
  let pendingGuiAction: (() => void) | null = null
  let globalScopeModalOpen = false
  let pendingGlobalAction: (() => void) | null = null

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
      for (const [index, file] of files.entries()) {
        const error = await importFileWithOptions(file, {
          ...options,
          seriesLabelOverrides: options.seriesLabelOverridesByFile?.[index],
        })
        if (error) {
          importError = error
          return
        }
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

  function convertDatasetAbscissa(datasetId: string, targetUnit: string): void {
    queueGuiAction(() => projectStore.convertDatasetAbscissa(datasetId, targetUnit))
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

  function updateTransformEnabled(
    datasetId: string,
    transformId: string,
    enabled: boolean,
    scope: 'no' | 'individual' | 'global',
  ): void {
    setTransformEnabled(globalContext, datasetId, transformId, enabled, scope)
  }

  function updateTransformScope(
    datasetId: string,
    transformId: string,
    scope: 'no' | 'individual' | 'global',
    snapshot: { enabled: boolean; params: Record<string, number | string | boolean> },
  ): void {
    if (scope === 'global') {
      pendingGlobalAction = () => {
        // Switching to global also pushes this step's current configuration to every sample.
        queueGuiAction(() => projectStore.updateTransformGlobal(transformId, {
          scope: 'global',
          enabled: snapshot.enabled,
          params: snapshot.params,
        }))
      }
      globalScopeModalOpen = true
      return
    }

    queueGuiAction(() => projectStore.updateTransform(datasetId, transformId, { scope }))
  }

  function updateTransformParam(
    datasetId: string,
    transformId: string,
    params: Record<string, number | string | boolean>,
    currentScope: 'no' | 'individual' | 'global',
  ): void {
    setTransformParams(globalContext, datasetId, transformId, params, currentScope)
  }

  function confirmGlobalScopeApply(): void {
    const action = pendingGlobalAction
    pendingGlobalAction = null
    globalScopeModalOpen = false
    action?.()
  }

  function confirmExport(): void {
    exportOpen = false
    downloadReport(exportFormat)
  }

  function cancelGlobalScopeApply(): void {
    pendingGlobalAction = null
    globalScopeModalOpen = false
  }

  function requestGlobalApply(action: () => void): void {
    pendingGlobalAction = () => queueGuiAction(action)
    globalScopeModalOpen = true
  }

  const globalContext: GlobalApplyContext = { queueGuiAction, requestGlobalApply }

  function removeAllSamples(): void {
    if ($projectStore.datasets.length === 0) return
    if (!confirm(`Remove all ${$projectStore.datasets.length} samples?`)) return
    removeAllDatasets()
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
    onRemoveAll={removeAllSamples}
    onShowAll={() => setAllDatasetsVisible(globalContext, true)}
    onHideAll={() => setAllDatasetsVisible(globalContext, false)}
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
      datasetCount={$projectStore.datasets.length}
      onClose={() => { rightPanelOpen = false }}
      onBackToGeneral={() => { rightPanelDatasetId = null }}
      onRename={renameDataset}
      onUpdateStyle={updateDatasetStyle}
      onUpdateMetadata={updateDatasetMetadata}
      onConvertAbscissa={convertDatasetAbscissa}
      onRerunPipeline={(datasetId) => projectStore.rerunPipeline(datasetId)}
      onTransformEnabled={updateTransformEnabled}
      onTransformScope={updateTransformScope}
      onTransformParam={updateTransformParam}
      onApplyPalette={(paletteId) => applyGlobalPalette(globalContext, paletteId)}
      onApplyLineWidth={(width) => applyGlobalLineWidth(globalContext, width)}
      onApplyNormalization={(mode: NormalizationMode) => applyGlobalNormalization(globalContext, mode)}
      onApplySmoothing={(windowLength, polyorder) => applyGlobalSmoothing(globalContext, windowLength, polyorder)}
      onApplyAxisMetadata={(metadata) => applyGlobalAxisMetadata(globalContext, metadata)}
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
  on:close={() => {
    importOpen = false
    wizardFiles = []
  }}
  on:import={handleImport}
/>

<ConfirmDialogs
  overwriteOpen={overwriteModalOpen}
  globalScopeOpen={globalScopeModalOpen}
  datasetCount={$projectStore.datasets.length}
  onCancelOverwrite={cancelOverwrite}
  onConfirmOverwrite={confirmOverwriteAndApply}
  onCancelGlobal={cancelGlobalScopeApply}
  onConfirmGlobal={confirmGlobalScopeApply}
/>
