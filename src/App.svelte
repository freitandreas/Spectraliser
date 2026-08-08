<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { EditorState, Transaction } from '@codemirror/state'
  import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { python } from '@codemirror/lang-python'
  import { oneDark } from '@codemirror/theme-one-dark'
  import ImportWizard from './lib/ImportWizard.svelte'
  import PlotPanel from './lib/PlotPanel.svelte'
  import { validateImportOptions } from './services/import/importWizard'
  import { generateSelfContainedHtmlReport } from './services/export/htmlReport'
  import {
    parseDelimitedCollection,
    parseXlsxCollection,
    type ImportOptions,
  } from './services/import/parsers'
  import { activeDataset, projectStore } from './state/projectStore'

  let importOpen = false
  let importError = ''
  let wizardFiles: File[] = []
  let explorerFileInputEl: HTMLInputElement | null = null

  let overwriteModalOpen = false
  let pendingGuiAction: (() => void) | null = null
  let globalScopeModalOpen = false
  let pendingGlobalAction: (() => void) | null = null

  let editingTitle = false
  let titleDraft = ''
  let titleInputEl: HTMLInputElement | null = null
  let layoutEl: HTMLDivElement | null = null
  let mainEl: HTMLElement | null = null
  let tableScrollEl: HTMLDivElement | null = null
  let scriptEditorHostEl: HTMLDivElement | null = null
  let openSampleTabIds: string[] = []
  let expandedSampleId: string | null = null
  let explorerFocusDatasetId: string | null = null
  let activeWorkspaceTab: 'script_view' | string = 'script_view'
  let hoverSelection: { datasetId: string; pointIndex: number } | null = null
  let rightPanelSection: 'general' | 'style' | 'pipeline' | null = 'general'
  let leftPanelWidth = 260
  let rightPanelWidth = 230
  let bottomPanelHeight = 360
  let codeMirrorView: EditorView | null = null
  let scriptAutoExecute = false
  let scriptExecuting = false
  let suppressEditorSync = false
  let autoExecuteTimer: number | null = null
  let lastScriptDebugSignature = ''

  type SampleSubView = 'data' | 'peaks'

  type ResizeKind = 'left' | 'right' | 'bottom'

  let activeResize: {
    kind: ResizeKind
    startX: number
    startY: number
    startLeft: number
    startRight: number
    startBottom: number
  } | null = null

  $: currentScript = $projectStore.userScriptOverride ?? $projectStore.generatedScript
  $: {
    const signature = [
      $projectStore.syncMode,
      $projectStore.scriptSyncEnabled ? 'sync-on' : 'sync-off',
      $projectStore.userScriptOverride === null ? 'generated' : 'override',
      String($projectStore.generatedScript.length),
      String($projectStore.userScriptOverride?.length ?? 0),
    ].join('|')

    if (signature !== lastScriptDebugSignature) {
      lastScriptDebugSignature = signature
      console.debug('[script-debug] editor_script_source', {
        syncMode: $projectStore.syncMode,
        scriptSyncEnabled: $projectStore.scriptSyncEnabled,
        source: $projectStore.userScriptOverride === null ? 'generatedScript' : 'userScriptOverride',
        generatedLength: $projectStore.generatedScript.length,
        overrideLength: $projectStore.userScriptOverride?.length ?? 0,
      })
    }
  }
  $: plotSelectedSpectrumId = explorerFocusDatasetId
    ?? (activeWorkspaceTab === 'script_view' ? null : $projectStore.viewState.selectedSpectrumId)
  $: openedSampleTabs = openSampleTabIds
    .map((tabId) => {
      const parsed = parseSampleTabId(tabId)
      if (!parsed) {
        return null
      }
      const dataset = $projectStore.datasets.find((item) => item.id === parsed.datasetId)
      if (!dataset) {
        return null
      }

      return {
        tabId,
        dataset,
        subView: parsed.subView,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  $: visibleDatasets = $projectStore.datasets
    .filter((dataset) => dataset.style.visible !== false)
  $: activeSampleTabMeta = activeWorkspaceTab === 'script_view'
    ? null
    : parseSampleTabId(activeWorkspaceTab)
  $: activeSampleTabDataset = activeSampleTabMeta
    ? ($projectStore.datasets.find((dataset) => dataset.id === activeSampleTabMeta.datasetId) ?? null)
    : null
  $: activeSampleSubView = activeSampleTabMeta?.subView ?? 'data'

  $: if (activeWorkspaceTab === 'script_view' || !activeSampleTabDataset) {
    hoverSelection = null
  }

  $: if (hoverSelection && activeSampleTabDataset && hoverSelection.datasetId === activeSampleTabDataset.id) {
    void tick().then(() => {
      const row = tableScrollEl?.querySelector<HTMLTableRowElement>(
        `[data-row-index='${hoverSelection?.pointIndex}']`,
      )
      if (!row || !tableScrollEl) {
        return
      }

      const rowTop = row.offsetTop
      const rowBottom = rowTop + row.offsetHeight
      const visibleTop = tableScrollEl.scrollTop
      const visibleBottom = visibleTop + tableScrollEl.clientHeight

      if (rowTop < visibleTop) {
        tableScrollEl.scrollTop = rowTop - 8
      } else if (rowBottom > visibleBottom) {
        tableScrollEl.scrollTop = rowBottom - tableScrollEl.clientHeight + 8
      }
    })
  }

  $: {
    const available = new Set($projectStore.datasets.map((dataset) => dataset.id))
    const filtered = openSampleTabIds.filter((id) => {
      const parsed = parseSampleTabId(id)
      return parsed ? available.has(parsed.datasetId) : false
    })
    if (filtered.length !== openSampleTabIds.length) {
      openSampleTabIds = filtered
    }
    if (activeWorkspaceTab !== 'script_view') {
      const activeParsed = parseSampleTabId(activeWorkspaceTab)
      if (!activeParsed || !available.has(activeParsed.datasetId)) {
        activeWorkspaceTab = filtered[filtered.length - 1] ?? 'script_view'
      }
    }

    if (expandedSampleId && !available.has(expandedSampleId)) {
      expandedSampleId = null
    }

    if (explorerFocusDatasetId && !available.has(explorerFocusDatasetId)) {
      explorerFocusDatasetId = null
    }
  }

  $: if ($activeDataset && !editingTitle) {
    titleDraft = $activeDataset.style.label
  }

  function ensureCodeMirror(): void {
    if (!scriptEditorHostEl || codeMirrorView) {
      return
    }

    codeMirrorView = new EditorView({
      state: EditorState.create({
        doc: currentScript,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          python(),
          oneDark,
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) {
              return
            }
            if (suppressEditorSync) {
              return
            }
            projectStore.setScriptOverride(update.state.doc.toString())

            const userEdited = update.transactions.some((tx) => {
              const event = tx.annotation(Transaction.userEvent)
              return Boolean(event && (event.startsWith('input') || event.startsWith('delete') || event.startsWith('paste')))
            })

            if (scriptAutoExecute && userEdited) {
              scheduleAutoExecute()
            }
          }),
        ],
      }),
      parent: scriptEditorHostEl,
    })
  }

  onMount(() => {
    ensureCodeMirror()

    return () => {
      if (autoExecuteTimer !== null) {
        window.clearTimeout(autoExecuteTimer)
        autoExecuteTimer = null
      }
      codeMirrorView?.destroy()
      codeMirrorView = null
    }
  })

  $: if (scriptEditorHostEl && activeWorkspaceTab === 'script_view') {
    ensureCodeMirror()
  }

  $: if (codeMirrorView && currentScript !== codeMirrorView.state.doc.toString()) {
    suppressEditorSync = true
    codeMirrorView.dispatch({
      changes: {
        from: 0,
        to: codeMirrorView.state.doc.length,
        insert: currentScript,
      },
    })
    suppressEditorSync = false
  }

  function scheduleAutoExecute(): void {
    if (!scriptAutoExecute) {
      return
    }

    if (autoExecuteTimer !== null) {
      window.clearTimeout(autoExecuteTimer)
    }

    autoExecuteTimer = window.setTimeout(() => {
      void executeScriptAutoMode()
    }, 420)
  }

  async function executeScript(): Promise<void> {
    if (scriptExecuting || scriptAutoExecute || $projectStore.datasets.length === 0) {
      return
    }

    scriptExecuting = true
    try {
      await projectStore.executeScriptForDatasets(currentScript)
    } finally {
      scriptExecuting = false
    }
  }

  function handleAutoExecuteToggle(event: Event): void {
    const target = event.target as HTMLInputElement
    scriptAutoExecute = target.checked
    if (scriptAutoExecute) {
      void executeScriptAutoMode()
    } else if (autoExecuteTimer !== null) {
      window.clearTimeout(autoExecuteTimer)
      autoExecuteTimer = null
    }
  }

  async function executeScriptAutoMode(): Promise<void> {
    if (scriptExecuting || $projectStore.datasets.length === 0) {
      return
    }

    scriptExecuting = true
    try {
      await projectStore.executeScriptForDatasets(currentScript)
    } finally {
      scriptExecuting = false
    }
  }

  async function importFileWithOptions(file: File, options: ImportOptions): Promise<void> {
    const issues = validateImportOptions(options)
    if (issues.length > 0) {
      importError = issues.join(' ')
      return
    }

    const lowerName = file.name.toLowerCase()
    const collection = lowerName.endsWith('.xlsx')
      ? parseXlsxCollection(await file.arrayBuffer(), options)
      : parseDelimitedCollection(await file.text(), options)

    if (collection.series.length === 0) {
      importError = 'No numeric X/Y rows could be parsed with the current import settings.'
      return
    }

    const sourcePath = file.webkitRelativePath?.trim().length ? file.webkitRelativePath : file.name
    const baseLabel = file.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ').trim() || file.name

    projectStore.importDatasets(
      collection.series.map((series, index) => ({
        name: file.name,
        sourcePath,
        label: options.hasHeader
          ? series.label
          : (collection.series.length > 1 ? `${baseLabel} ${index + 1}` : baseLabel),
        parsed: {
          abscissa: series.abscissa,
          ordinate: series.ordinate,
        },
      })),
    )
  }

  async function handleImport(event: CustomEvent<{ files: File[]; options: ImportOptions }>): Promise<void> {
    importError = ''
    const { files, options } = event.detail

    try {
      for (const file of files) {
        await importFileWithOptions(file, options)
      }
      importOpen = false
      wizardFiles = []
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Import failed.'
    }
  }

  function openWizardWithFiles(files: File[]): void {
    if (files.length === 0) {
      return
    }
    wizardFiles = files
    importOpen = true
  }

  function openExplorerFilePicker(): void {
    explorerFileInputEl?.click()
  }

  function handleExplorerFileInput(event: Event): void {
    const target = event.target as HTMLInputElement
    const files = target.files ? Array.from(target.files) : []
    openWizardWithFiles(files)
    target.value = ''
  }

  function handleDropImport(event: DragEvent): void {
    event.preventDefault()
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : []
    openWizardWithFiles(files)
  }

  function downloadReport(): void {
    const state = projectStore.snapshot()
    const html = generateSelfContainedHtmlReport(state)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${state.projectName.replace(/\s+/g, '_')}.html`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function queueGuiAction(action: () => void): void {
    if ($projectStore.syncMode === 'desync_active') {
      pendingGuiAction = action
      overwriteModalOpen = true
      return
    }

    action()
  }

  function updateColor(event: Event): void {
    const dataset = $activeDataset
    if (!dataset) {
      return
    }

    const target = event.target as HTMLInputElement
    queueGuiAction(() => projectStore.updateStyle(dataset.id, { lineColor: target.value }))
  }

  function updateWidth(event: Event): void {
    const dataset = $activeDataset
    if (!dataset) {
      return
    }

    const target = event.target as HTMLInputElement
    queueGuiAction(() => projectStore.updateStyle(dataset.id, { lineWidth: Number(target.value) }))
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
    queueGuiAction(() => projectStore.updateTransform(datasetId, transformId, { enabled }))
  }

  function updateTransformScope(
    datasetId: string,
    transformId: string,
    scope: 'no' | 'individual' | 'global',
  ): void {
    if (scope === 'global') {
      pendingGlobalAction = () => {
        queueGuiAction(() => {
          projectStore.updateTransformGlobal(transformId, { scope: 'global' })
        })
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
    const apply = () => {
      if (currentScope === 'global') {
        projectStore.updateTransformGlobal(transformId, { params })
      } else {
        projectStore.updateTransform(datasetId, transformId, { params })
      }
    }

    queueGuiAction(apply)
  }

  function confirmGlobalScopeApply(): void {
    const action = pendingGlobalAction
    pendingGlobalAction = null
    globalScopeModalOpen = false
    action?.()
  }

  function cancelGlobalScopeApply(): void {
    pendingGlobalAction = null
    globalScopeModalOpen = false
  }

  function removeDatasetFromExplorer(datasetId: string): void {
    const dataset = $projectStore.datasets.find((item) => item.id === datasetId)
    if (!dataset) {
      return
    }

    if (confirm(`Remove ${dataset.style.label}?`)) {
      projectStore.removeDataset(dataset.id)
    }
  }

  function makeSampleTabId(datasetId: string, subView: SampleSubView): string {
    return `${datasetId}::${subView}`
  }

  function parseSampleTabId(tabId: string): { datasetId: string; subView: SampleSubView } | null {
    if (tabId === 'script_view') {
      return null
    }

    const [datasetId, subViewRaw] = tabId.split('::')
    if (!datasetId) {
      return null
    }

    const subView: SampleSubView = subViewRaw === 'peaks' ? 'peaks' : 'data'
    return { datasetId, subView }
  }

  function toggleSampleExpanded(datasetId: string): void {
    expandedSampleId = expandedSampleId === datasetId ? null : datasetId
  }

  function focusSampleInExplorer(datasetId: string): void {
    toggleSampleExpanded(datasetId)
    explorerFocusDatasetId = datasetId
    hoverSelection = null
  }

  function isExplorerRowSelected(datasetId: string): boolean {
    if (explorerFocusDatasetId) {
      return explorerFocusDatasetId === datasetId
    }

    return $projectStore.viewState.selectedSpectrumId === datasetId
  }

  function toggleSampleVisibility(datasetId: string): void {
    const dataset = $projectStore.datasets.find((item) => item.id === datasetId)
    if (!dataset) {
      return
    }

    const currentlyVisible = dataset.style.visible !== false
    queueGuiAction(() => projectStore.updateStyle(datasetId, { visible: !currentlyVisible }))
  }

  function updateSpectrumType(event: Event): void {
    if (!activeSampleTabDataset) {
      return
    }
    const target = event.target as HTMLSelectElement
    const nextType = target.value === 'ir' || target.value === 'raman' ? target.value : 'uv-vis'
    queueGuiAction(() => projectStore.updateDatasetMetadata(activeSampleTabDataset.id, { spectrumType: nextType }))
  }

  function updateSourcePath(event: Event): void {
    if (!activeSampleTabDataset) {
      return
    }
    const target = event.target as HTMLInputElement
    queueGuiAction(() => projectStore.updateDatasetMetadata(activeSampleTabDataset.id, { sourcePath: target.value }))
  }

  function updateUnitsX(event: Event): void {
    if (!activeSampleTabDataset) {
      return
    }
    const target = event.target as HTMLInputElement
    queueGuiAction(() => projectStore.updateDatasetMetadata(activeSampleTabDataset.id, { units: { x: target.value } }))
  }

  function updateUnitsY(event: Event): void {
    if (!activeSampleTabDataset) {
      return
    }
    const target = event.target as HTMLInputElement
    queueGuiAction(() => projectStore.updateDatasetMetadata(activeSampleTabDataset.id, { units: { y: target.value } }))
  }

  function handleSampleTabsWheel(event: WheelEvent): void {
    const target = event.currentTarget as HTMLDivElement | null
    if (!target) {
      return
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    target.scrollLeft += event.deltaY
    event.preventDefault()
  }

  function activateScriptTab(): void {
    explorerFocusDatasetId = null
    projectStore.setActiveTab('script_view')
  }

  function openSampleSubTab(datasetId: string, subView: SampleSubView): void {
    const tabId = makeSampleTabId(datasetId, subView)
    if (!openSampleTabIds.includes(tabId)) {
      openSampleTabIds = [...openSampleTabIds, tabId]
    }
    activeWorkspaceTab = tabId
    explorerFocusDatasetId = null
    projectStore.selectDataset(datasetId)
    projectStore.setActiveTab(subView === 'peaks' ? 'peak_table' : 'sample_view')
  }

  function setHoverSelection(datasetId: string, pointIndex: number | null): void {
    if (pointIndex === null) {
      if (hoverSelection === null) {
        return
      }
      hoverSelection = null
      return
    }

    if (
      activeSampleTabDataset?.id === datasetId
      && hoverSelection?.datasetId === datasetId
      && hoverSelection.pointIndex === pointIndex
    ) {
      return
    }

    if (activeSampleTabDataset?.id === datasetId) {
      hoverSelection = { datasetId, pointIndex }
    }
  }

  function handlePlotHoverEvent(event: CustomEvent<{ datasetId: string; pointIndex: number } | null>): void {
    if (!event.detail) {
      setHoverSelection('', null)
      return
    }

    setHoverSelection(event.detail.datasetId, event.detail.pointIndex)
  }

  function startResize(kind: ResizeKind, event: MouseEvent): void {
    event.preventDefault()
    activeResize = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: leftPanelWidth,
      startRight: rightPanelWidth,
      startBottom: bottomPanelHeight,
    }

    document.body.style.userSelect = 'none'
    document.body.style.cursor = kind === 'bottom' ? 'row-resize' : 'col-resize'
    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', stopResize)
  }

  function handleResizeMove(event: MouseEvent): void {
    if (!activeResize || !layoutEl || !mainEl) {
      return
    }

    if (activeResize.kind === 'left') {
      const dx = event.clientX - activeResize.startX
      const maxLeft = Math.max(220, layoutEl.clientWidth - rightPanelWidth - 460)
      leftPanelWidth = Math.min(maxLeft, Math.max(180, activeResize.startLeft + dx))
      codeMirrorView?.requestMeasure()
      return
    }

    if (activeResize.kind === 'right') {
      const dx = event.clientX - activeResize.startX
      const maxRight = Math.max(180, layoutEl.clientWidth - leftPanelWidth - 500)
      rightPanelWidth = Math.min(maxRight, Math.max(170, activeResize.startRight - dx))
      codeMirrorView?.requestMeasure()
      return
    }

    const dy = event.clientY - activeResize.startY
    const maxBottom = Math.max(220, mainEl.clientHeight - 220)
    bottomPanelHeight = Math.min(maxBottom, Math.max(180, activeResize.startBottom - dy))
    codeMirrorView?.requestMeasure()
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

    if (!wasActive) {
      return
    }

    const fallbackId = nextTabs[nextTabs.length - 1]
    if (!fallbackId) {
      activeWorkspaceTab = 'script_view'
      projectStore.setActiveTab('script_view')
      return
    }

    activeWorkspaceTab = fallbackId
    const parsed = parseSampleTabId(fallbackId)
    if (parsed) {
      projectStore.selectDataset(parsed.datasetId)
      projectStore.setActiveTab(parsed.subView === 'peaks' ? 'peak_table' : 'sample_view')
    }
  }

  async function startTitleEdit(): Promise<void> {
    if (!$activeDataset) {
      return
    }

    editingTitle = true
    titleDraft = $activeDataset.style.label
    await tick()
    titleInputEl?.focus()
    titleInputEl?.select()
  }

  function commitTitleEdit(): void {
    const dataset = $activeDataset
    if (!dataset) {
      editingTitle = false
      return
    }

    const trimmed = titleDraft.trim()
    if (trimmed.length > 0 && trimmed !== dataset.style.label) {
      queueGuiAction(() => projectStore.updateStyle(dataset.id, { label: trimmed }))
    }
    editingTitle = false
  }

  function cancelTitleEdit(): void {
    editingTitle = false
    if ($activeDataset) {
      titleDraft = $activeDataset.style.label
    }
  }

  function handleTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitTitleEdit()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      cancelTitleEdit()
    }
  }
</script>

<div class="workbench">
  <header class="topbar">
    <div class="brand">Spectraliser</div>
    <nav class="menu toolbar-nav" aria-label="Main toolbar">
      <button type="button" class="toolbar-button" on:click={openExplorerFilePicker}>Data</button>
      <button
        type="button"
        class="toolbar-button"
        on:click={() => {
          activeWorkspaceTab = 'script_view'
          activateScriptTab()
          codeMirrorView?.requestMeasure()
        }}
      >
        Script
      </button>
      <button
        type="button"
        class="toolbar-button"
        on:click={() => {
          const selectedId = $projectStore.viewState.selectedSpectrumId ?? $projectStore.datasets[0]?.id
          if (selectedId) {
            openSampleSubTab(selectedId, 'data')
          }
        }}
      >
        Analyse
      </button>
      <button
        type="button"
        class="toolbar-button"
        on:click={() => {
          rightPanelSection = 'general'
        }}
      >
        Settings
      </button>
      <button type="button" class="toolbar-button" title="Use the Import Wizard, Script View, and Sample Settings to configure analysis.">
        About/Help
      </button>
    </nav>
    <div class="actions">
      <button type="button" class="ghost" on:click={downloadReport}>Export</button>
    </div>
  </header>

  <div
    class="layout"
    bind:this={layoutEl}
    style={`grid-template-columns:${leftPanelWidth}px 6px minmax(0, 1fr) 6px ${rightPanelWidth}px;`}
  >
    <aside class="sidebar">
      <section>
        <h2>Samples</h2>

        <div
          class="drop-field"
          role="button"
          tabindex="0"
          aria-label="Import spectra files"
          on:click={openExplorerFilePicker}
          on:keydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openExplorerFilePicker()
            }
          }}
          on:dragover|preventDefault
          on:drop={handleDropImport}
        >
          <div class="drop-title">Drop or Click To Import Files</div>
          <div class="drop-subtitle">CSV, TSV, TXT, XLSX</div>
        </div>

        <input
          bind:this={explorerFileInputEl}
          class="hidden-file-input"
          type="file"
          accept=".csv,.tsv,.txt,.xlsx"
          multiple
          on:change={handleExplorerFileInput}
        />

        {#each $projectStore.datasets as dataset (dataset.id)}
          <div class:selected={isExplorerRowSelected(dataset.id)} class="sample-row" class:expanded={expandedSampleId === dataset.id}>
            <div class="sample-row-main">
              <button type="button" class="file" on:click={() => focusSampleInExplorer(dataset.id)}>
                <span class="sample-chevron" class:expanded={expandedSampleId === dataset.id} aria-hidden="true">▸</span>
                <span class="sample-color-bar" style={`--sample-color:${dataset.style.lineColor};`}></span>
                {dataset.style.label}
              </button>
              <button
                type="button"
                class="visibility-toggle"
                class:hidden-state={dataset.style.visible === false}
                aria-label={`${dataset.style.visible === false ? 'Show' : 'Hide'} ${dataset.style.label}`}
                title={dataset.style.visible === false ? 'Show sample' : 'Hide sample'}
                on:click={() => toggleSampleVisibility(dataset.id)}
              >
                <span class="eye-icon" aria-hidden="true">
                  <span class="eye-pupil"></span>
                </span>
              </button>
              <button
                type="button"
                class="remove-x"
                aria-label={`Remove ${dataset.style.label}`}
                on:click={() => removeDatasetFromExplorer(dataset.id)}
              >
                x
              </button>
            </div>

            {#if expandedSampleId === dataset.id}
              <div class="sample-subitems">
                <button type="button" class="sample-subitem" on:click={() => openSampleSubTab(dataset.id, 'data')}>
                  Data Table
                </button>
                <button type="button" class="sample-subitem" on:click={() => openSampleSubTab(dataset.id, 'peaks')}>
                  Peak Assignments
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </section>
    </aside>

    <button
      type="button"
      class="resizer-col"
      aria-label="Resize left panel"
      on:mousedown={(event) => startResize('left', event)}
    ></button>

    <main class="main" bind:this={mainEl} style={`grid-template-rows:minmax(220px, 1fr) 8px ${bottomPanelHeight}px;`}>
      <section class="plot-shell">
        <PlotPanel
          datasets={visibleDatasets}
          selectedSpectrumId={plotSelectedSpectrumId}
          {hoverSelection}
          on:hoverpoint={handlePlotHoverEvent}
        />
      </section>

      <button
        type="button"
        class="resizer-row"
        aria-label="Resize bottom panel"
        on:mousedown={(event) => startResize('bottom', event)}
      ></button>

      <section class="bottom-panel">
        <div class="tabs">
          <div class="sample-tabs-scroll" on:wheel={handleSampleTabsWheel}>
            {#each openedSampleTabs as tabEntry (tabEntry.tabId)}
              <div
                class="sample-tab-shell"
                class:active={activeWorkspaceTab === tabEntry.tabId}
                style={`--tab-color:${tabEntry.dataset.style.lineColor};`}
              >
                <button
                  type="button"
                  class="tab tab-button sample-tab-button"
                  on:click={() => openSampleSubTab(tabEntry.dataset.id, tabEntry.subView)}
                >
                  <span class="sample-color-bar tab-color-bar" style={`--sample-color:${tabEntry.dataset.style.lineColor};`}></span>
                  {tabEntry.dataset.style.label} • {tabEntry.subView === 'data' ? 'Data' : 'Peaks'}
                </button>
                <button
                  type="button"
                  class="tab-close"
                  aria-label={`Close ${tabEntry.dataset.style.label} ${tabEntry.subView === 'data' ? 'Data' : 'Peaks'} tab`}
                  on:click={() => closeSampleTab(tabEntry.tabId)}
                >
                  x
                </button>
              </div>
            {/each}
          </div>
          <div
            class="sample-tab-shell script-tab-shell"
            class:active={activeWorkspaceTab === 'script_view'}
            style="--tab-color:#8ea0b4;"
          >
            <button
              type="button"
              class="tab tab-button sample-tab-button script-tab-button"
              on:click={() => {
                activeWorkspaceTab = 'script_view'
                activateScriptTab()
                codeMirrorView?.requestMeasure()
              }}
            >
              <span class="sample-color-bar tab-color-bar" style="--sample-color:#8ea0b4;"></span>
              Script
            </button>
          </div>
        </div>

        {#if activeWorkspaceTab !== 'script_view' && activeSampleTabDataset}
          <div class="sample-shell">
            {#if activeSampleSubView === 'data'}
              <div class="sample-table-wrap">
                <h3>Data Table</h3>
                <div class="sample-table-scroll" bind:this={tableScrollEl}>
                  <table class="sample-table" style={`--row-accent:${activeSampleTabDataset.style.lineColor};`}>
                    <thead>
                      <tr>
                        <th>X</th>
                        <th>Original</th>
                        <th>Modified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each activeSampleTabDataset.data.abscissa as point, index (index)}
                        <tr
                          data-row-index={index}
                          class:hovered={hoverSelection?.datasetId === activeSampleTabDataset.id && hoverSelection.pointIndex === index}
                          on:mouseenter={() => setHoverSelection(activeSampleTabDataset.id, index)}
                          on:mouseleave={() => setHoverSelection(activeSampleTabDataset.id, null)}
                        >
                          <td>{point}</td>
                          <td>{activeSampleTabDataset.data.ordinateOriginal[index]}</td>
                          <td>{activeSampleTabDataset.data.ordinateModified[index]}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {:else}
              <div class="sample-table-wrap peak-table-wrap">
                <h3>Peak Assignments</h3>
                <div class="sample-empty">
                  Peak assignment tools can be added here. This tab is ready for annotations and peak labels.
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <div class="script-panel" class:hidden={activeWorkspaceTab !== 'script_view'}>
          <div class="sync-banner" data-state={$projectStore.syncMode}>
            {#if $projectStore.syncMode === 'desync_active'}
              GUI Sync Disabled. Manual edits active.
            {:else}
              GUI synchronized. Style and pipeline edits regenerate script automatically.
            {/if}
          </div>

          {#if $projectStore.workerLastError}
            <div class="script-error-banner">{$projectStore.workerLastError}</div>
          {/if}

          <div bind:this={scriptEditorHostEl} class="script-editor" aria-label="Python script editor"></div>

          <div class="script-actions">
            <label class="autoexecute-toggle">
              <input type="checkbox" checked={scriptAutoExecute} on:change={handleAutoExecuteToggle} />
              Autoexecute
            </label>
            <button type="button" class="run" disabled={scriptAutoExecute || scriptExecuting} on:click={() => void executeScript()}>
              {scriptExecuting ? 'Executing...' : 'Execute'}
            </button>
            <button type="button" class="ghost" on:click={() => projectStore.revertScriptToGuiState()}>
              Revert To GUI State
            </button>
          </div>
        </div>
      </section>
    </main>

    <button
      type="button"
      class="resizer-col"
      aria-label="Resize right panel"
      on:mousedown={(event) => startResize('right', event)}
    ></button>

    <aside class="right-sidebar">
      {#if activeWorkspaceTab !== 'script_view' && activeSampleTabDataset}
        <section class="sample-settings">
          <header class="sample-settings-header">
            {#if editingTitle}
              <input
                bind:this={titleInputEl}
                class="sample-title-input"
                type="text"
                bind:value={titleDraft}
                on:blur={commitTitleEdit}
                on:keydown={handleTitleKeydown}
              />
            {:else}
              <h2 on:dblclick={startTitleEdit}>{activeSampleTabDataset.style.label}</h2>
            {/if}
          </header>

          <section class="expandable-section" class:open={rightPanelSection === 'general'}>
            <button type="button" class="expandable-toggle" on:click={() => { rightPanelSection = rightPanelSection === 'general' ? null : 'general' }}>
              General
            </button>
            {#if rightPanelSection === 'general'}
              <div class="expandable-body">
                <label>
                  File path
                  <input type="text" value={activeSampleTabDataset.sourcePath} on:input={updateSourcePath} />
                </label>
                <label>
                  Spectrum type
                  <select value={activeSampleTabDataset.spectrumType} on:change={updateSpectrumType}>
                    <option value="uv-vis">UV-Vis</option>
                    <option value="ir">IR</option>
                    <option value="raman">Raman</option>
                  </select>
                </label>
                <label>
                  X units
                  <input type="text" value={activeSampleTabDataset.units.x} on:input={updateUnitsX} />
                </label>
                <label>
                  Y units
                  <input type="text" value={activeSampleTabDataset.units.y} on:input={updateUnitsY} />
                </label>
              </div>
            {/if}
          </section>

          <section class="expandable-section" class:open={rightPanelSection === 'style'}>
            <button type="button" class="expandable-toggle" on:click={() => { rightPanelSection = rightPanelSection === 'style' ? null : 'style' }}>
              Style Settings
            </button>
            {#if rightPanelSection === 'style'}
              <div class="expandable-body">
            <label>
              Line Color
              <input type="color" value={activeSampleTabDataset.style.lineColor} on:input={updateColor} />
            </label>
            <label>
              Line Width
              <input
                type="range"
                min="1"
                max="6"
                step="0.5"
                value={activeSampleTabDataset.style.lineWidth}
                on:input={updateWidth}
              />
            </label>
            <button type="button" class="run" on:click={() => projectStore.rerunPipeline(activeSampleTabDataset.id)}>
              Run Pipeline in Pyodide
            </button>
              </div>
            {/if}
          </section>

          <section class="expandable-section" class:open={rightPanelSection === 'pipeline'}>
            <button type="button" class="expandable-toggle" on:click={() => { rightPanelSection = rightPanelSection === 'pipeline' ? null : 'pipeline' }}>
              Pipeline Settings
            </button>
            {#if rightPanelSection === 'pipeline'}
              <div class="expandable-body">
            {#each activeSampleTabDataset.pipeline as transform (transform.id)}
              <div class="transform-card">
                <div class="transform-top">
                  <label class="toggle-label">
                    <input
                      type="checkbox"
                      checked={transform.enabled}
                      on:change={(event) =>
                        updateTransformEnabled(
                          activeSampleTabDataset.id,
                          transform.id,
                          (event.target as HTMLInputElement).checked,
                        )}
                    />
                    <span>{transform.type}</span>
                  </label>

                  <select
                    value={transform.scope}
                    on:change={(event) =>
                      updateTransformScope(
                        activeSampleTabDataset.id,
                        transform.id,
                        (event.target as HTMLSelectElement).value as 'no' | 'individual' | 'global',
                      )}
                  >
                    <option value="no">No</option>
                    <option value="individual">Individual</option>
                    <option value="global">Global</option>
                  </select>
                </div>

                {#if transform.type === 'smoothing'}
                  <div class="transform-grid">
                    <label>
                      window
                      <input
                        type="number"
                        min="3"
                        step="2"
                        value={Number(transform.params.window_length ?? 15)}
                        on:change={(event) =>
                          updateTransformParam(
                            activeSampleTabDataset.id,
                            transform.id,
                            { window_length: Number((event.target as HTMLInputElement).value) },
                            transform.scope,
                          )}
                      />
                    </label>
                    <label>
                      polyorder
                      <input
                        type="number"
                        min="1"
                        value={Number(transform.params.polyorder ?? 2)}
                        on:change={(event) =>
                          updateTransformParam(
                            activeSampleTabDataset.id,
                            transform.id,
                            { polyorder: Number((event.target as HTMLInputElement).value) },
                            transform.scope,
                          )}
                      />
                    </label>
                  </div>
                {/if}

                {#if transform.type === 'normalization'}
                  <label>
                    mode
                    <select
                      value={String(transform.params.mode ?? 'minmax')}
                      on:change={(event) =>
                        updateTransformParam(
                          activeSampleTabDataset.id,
                          transform.id,
                          { mode: (event.target as HTMLSelectElement).value },
                          transform.scope,
                        )}
                    >
                      <option value="minmax">MinMax</option>
                      <option value="vector">Vector</option>
                      <option value="area">Area</option>
                      <option value="peak">Peak</option>
                    </select>
                  </label>
                {/if}

                {#if transform.type === 'derivative'}
                  <label>
                    order
                    <input
                      type="number"
                      min="1"
                      max="2"
                      value={Number(transform.params.order ?? 1)}
                      on:change={(event) =>
                        updateTransformParam(
                          activeSampleTabDataset.id,
                          transform.id,
                          { order: Number((event.target as HTMLInputElement).value) },
                          transform.scope,
                        )}
                    />
                  </label>
                {/if}

                {#if transform.type === 'baseline'}
                  <label>
                    poly order
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={Number(transform.params.order ?? 3)}
                      on:change={(event) =>
                        updateTransformParam(
                          activeSampleTabDataset.id,
                          transform.id,
                          { order: Number((event.target as HTMLInputElement).value) },
                          transform.scope,
                        )}
                    />
                  </label>
                {/if}

                {#if transform.type === 'crop'}
                  <div class="transform-grid">
                    <label>
                      x min
                      <input
                        type="number"
                        value={Number(transform.params.x_min ?? 200)}
                        on:change={(event) =>
                          updateTransformParam(
                            activeSampleTabDataset.id,
                            transform.id,
                            { x_min: Number((event.target as HTMLInputElement).value) },
                            transform.scope,
                          )}
                      />
                    </label>
                    <label>
                      x max
                      <input
                        type="number"
                        value={Number(transform.params.x_max ?? 800)}
                        on:change={(event) =>
                          updateTransformParam(
                            activeSampleTabDataset.id,
                            transform.id,
                            { x_max: Number((event.target as HTMLInputElement).value) },
                            transform.scope,
                          )}
                      />
                    </label>
                  </div>
                {/if}
              </div>
            {/each}
              </div>
            {/if}
          </section>
        </section>
      {/if}
    </aside>
  </div>

  {#if importError}
    <div class="toast toast-error">{importError}</div>
  {/if}
</div>

<ImportWizard
  open={importOpen}
  files={wizardFiles}
  on:close={() => {
    importOpen = false
    wizardFiles = []
  }}
  on:import={handleImport}
/>

{#if overwriteModalOpen}
  <div class="confirm-backdrop" role="presentation">
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="Reset manual edits">
      <h3>Reset Manual Edits?</h3>
      <p>
        Modifying GUI controls will overwrite your custom Python script and return to synchronized mode.
      </p>
      <div class="confirm-actions">
        <button type="button" class="ghost" on:click={cancelOverwrite}>Cancel</button>
        <button type="button" class="run" on:click={confirmOverwriteAndApply}>Overwrite and Continue</button>
      </div>
    </div>
  </div>
{/if}

{#if globalScopeModalOpen}
  <div class="confirm-backdrop" role="presentation">
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="Global transform warning">
      <h3>Apply To All Spectra?</h3>
      <p>
        Warning: You are about to override transformation settings for {$projectStore.datasets.length} loaded spectra. Continue?
      </p>
      <div class="confirm-actions">
        <button type="button" class="ghost" on:click={cancelGlobalScopeApply}>Cancel</button>
        <button type="button" class="run" on:click={confirmGlobalScopeApply}>Continue</button>
      </div>
    </div>
  </div>
{/if}
