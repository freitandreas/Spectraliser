<script lang="ts">
  import HelpTip from '../HelpTip.svelte'
  import { onMount } from 'svelte'
  import { Compartment, EditorState, Transaction } from '@codemirror/state'
  import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { python } from '@codemirror/lang-python'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { projectStore } from '../../state/projectStore'
  import { computePrecision } from '../../state/computeSettings'
  import { runtimeState } from '../../state/runtimeState'
  import { arrayId } from '../../services/arrayIdentity'
  import {
    effectivePythonFiles,
    PROJECT_FILE_NAMES,
    SAMPLES_FILE_NAME,
    type ProjectFileName,
  } from '../../services/script/scriptGenerator'

  export let active: boolean
  export let executionTrigger = 0

  let editorHostEl: HTMLDivElement | null = null
  let codeMirrorView: EditorView | null = null
  let autoExecute = true
  let executing = false
  let suppressEditorSync = false
  let autoExecuteTimer: number | null = null
  let pendingAutoRun = false
  let selectedFile: ProjectFileName = 'main.py'
  const readOnlyCompartment = new Compartment()
  let outputViewActive = false
  let lastExecutionTrigger = executionTrigger
  let lastScriptInputSignature = ''

  $: files = effectivePythonFiles(
    $projectStore.datasets,
    $projectStore.generatedScript,
    $projectStore.pythonFileOverrides ?? {},
  )
  $: currentScript = selectedFile === 'main.py'
    ? ($projectStore.userScriptOverride ?? files['main.py'])
    : files[selectedFile]

  $: readOnlyFile = selectedFile === SAMPLES_FILE_NAME

  // Only script inputs belong here: display metadata (labels, colours, widths, peak
  // labels) is written to samples.json and must not trigger execution. Array
  // identity is enough because imports and conversions always create new arrays.
  $: scriptInputSignature = signatureOf($projectStore.datasets, $computePrecision)

  function signatureOf(datasets: typeof $projectStore.datasets, precision: string): string {
    return JSON.stringify([precision, datasets.map((dataset) => [
      dataset.id,
      dataset.style.visible !== false,
      dataset.spectrumType,
      dataset.units.x, dataset.units.y, dataset.units.xQuantity ?? '', dataset.units.yQuantity ?? '',
      dataset.pipeline,
      dataset.peakDetection ?? null,
      arrayId(dataset.data.abscissa),
      arrayId(dataset.data.ordinateOriginal),
    ])])
  }

  $: if (lastScriptInputSignature === '') {
    lastScriptInputSignature = scriptInputSignature
  } else if (scriptInputSignature !== lastScriptInputSignature) {
    lastScriptInputSignature = scriptInputSignature
    if (autoExecute) scheduleAutoExecute()
  }

  $: if (executionTrigger !== lastExecutionTrigger) {
    lastExecutionTrigger = executionTrigger
    if (autoExecute) scheduleAutoExecute()
  }

  function ensureCodeMirror(): void {
    if (!editorHostEl || codeMirrorView) return

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
          readOnlyCompartment.of(EditorState.readOnly.of(readOnlyFile)),
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || suppressEditorSync || selectedFile === SAMPLES_FILE_NAME) return

            projectStore.setPythonFileOverride(selectedFile, update.state.doc.toString())
            const userEdited = update.transactions.some((tx) => {
              const event = tx.annotation(Transaction.userEvent)
              return Boolean(event && (event.startsWith('input') || event.startsWith('delete') || event.startsWith('paste')))
            })

            if (autoExecute && userEdited) scheduleAutoExecute()
          }),
        ],
      }),
      parent: editorHostEl,
    })
  }

  onMount(() => {
    ensureCodeMirror()
    codeMirrorView?.dom.addEventListener('focusout', handleEditorBlur)

    return () => {
      if (autoExecuteTimer !== null) window.clearTimeout(autoExecuteTimer)
      codeMirrorView?.dom.removeEventListener('focusout', handleEditorBlur)
      codeMirrorView?.destroy()
      codeMirrorView = null
    }
  })

  $: if (editorHostEl && active && !outputViewActive) ensureCodeMirror()

  $: codeMirrorView?.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnlyFile)) })

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
    if (!autoExecute) return
    if (executing) {
      pendingAutoRun = true
      return
    }
    if (autoExecuteTimer !== null) window.clearTimeout(autoExecuteTimer)

    autoExecuteTimer = window.setTimeout(() => {
      void executeAutoMode()
    }, 420)
  }

  function handleEditorBlur(): void {
    if (!autoExecute) return
    if (executing) {
      pendingAutoRun = true
      return
    }
    void executeAutoMode()
  }

  async function executeScript(): Promise<void> {
    if (executing || autoExecute || $projectStore.datasets.length === 0) return

    executing = true
    try {
      await projectStore.executeScriptForDatasets(undefined, { announceSkip: true })
    } finally {
      executing = false
    }
  }

  function handleAutoExecuteToggle(event: Event): void {
    autoExecute = (event.target as HTMLInputElement).checked
    if (autoExecute) {
      void executeAutoMode()
    } else if (autoExecuteTimer !== null) {
      window.clearTimeout(autoExecuteTimer)
      autoExecuteTimer = null
    }
  }

  async function executeAutoMode(): Promise<void> {
    if (executing || $projectStore.datasets.length === 0) return

    executing = true
    pendingAutoRun = false
    try {
      await projectStore.executeScriptForDatasets()
    } finally {
      executing = false
      if (autoExecute && pendingAutoRun) {
        pendingAutoRun = false
        void executeAutoMode()
      }
    }
  }

  export function requestMeasure(): void {
    codeMirrorView?.requestMeasure()
  }

  export function requestAutoExecute(): void {
    if (autoExecute) scheduleAutoExecute()
  }
</script>

<div class="script-panel" class:hidden={!active}>
  <div class="script-content">
    <nav class="script-files" aria-label="Python files">
      <div class="script-files-title">Python files</div>
      {#each PROJECT_FILE_NAMES as fileName}
        <button
          type="button"
          class:current={selectedFile === fileName && !outputViewActive}
          aria-current={selectedFile === fileName && !outputViewActive ? 'page' : undefined}
          on:click={() => {
            outputViewActive = false
            selectedFile = fileName
          }}
        >
          {fileName}{#if $projectStore.pythonFileOverrides?.[fileName]}<span aria-label="edited"> •</span>{/if}{#if fileName === SAMPLES_FILE_NAME}<span class="generated-hint" title="Generated from the sample settings; read-only"> (generated)</span>{/if}
        </button>
      {/each}
      <button
        type="button"
        class="output-tab"
        class:current={outputViewActive}
        class:has-error={Boolean($runtimeState.workerLastError)}
        aria-current={outputViewActive ? 'page' : undefined}
        on:click={() => { outputViewActive = true }}
      >
        Output{#if $runtimeState.workerLastError}<span aria-label="error"> !</span>{/if}
      </button>
    </nav>

    {#if outputViewActive}
      <div class="script-output-pane" aria-live="polite">
        {#if $runtimeState.workerLastError}
          <div class="script-error-pane" role="alert" aria-live="assertive">
            <div class="script-error-header">Script execution error</div>
            <pre>{$runtimeState.workerLastError}</pre>
          </div>
        {/if}
        {#if $runtimeState.scriptOutput.length > 0}
          <pre class="script-console">{$runtimeState.scriptOutput.join('\n')}</pre>
        {:else if !$runtimeState.workerLastError}
          <div class="script-output-empty">No output yet. Run the script to see logs or exceptions here.</div>
        {/if}
      </div>
    {:else}
      <div class="script-editor-pane">
        {#if selectedFile === 'main.py'}
          <p class="file-note">Standalone entry for exported projects <HelpTip label="main.py" text="In the app, each execution generates its own runner that sends only the changed samples through processing.py and ir_assignments.py, so edits here do not trigger a run." /></p>
        {/if}
        <div bind:this={editorHostEl} class="script-editor" aria-label={readOnlyFile ? `${selectedFile} (generated, read-only)` : `${selectedFile} Python editor`}></div>
      </div>
    {/if}

  </div>

  <div class="script-actions">
    {#if !autoExecute}
      <button type="button" class="run script-execute" disabled={executing || $projectStore.datasets.length === 0} on:click={() => void executeScript()}>
        {executing ? 'Executing...' : 'Execute'}
      </button>
    {/if}
    <label class="autoexecute-toggle">
      <input type="checkbox" checked={autoExecute} on:change={handleAutoExecuteToggle} />
      Automatic execution
    </label>

    <div class="sync-banner" data-state={$projectStore.syncMode}>
      <span>
        {#if $projectStore.syncMode === 'desync_active'}
          GUI Sync Disabled. Manual edits active.
        {:else}
          GUI synchronized. Style and pipeline edits regenerate script automatically.
        {/if}
      </span>
      {#if $projectStore.syncMode === 'desync_active'}
        <button type="button" class="ghost sync-revert" on:click={() => projectStore.revertScriptToGuiState()}>
          Revert To GUI State
        </button>
      {/if}
    </div>
  </div>
</div>
