<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorState, Transaction } from '@codemirror/state'
  import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { python } from '@codemirror/lang-python'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { projectStore } from '../../state/projectStore'
  import { effectivePythonFiles, PYTHON_FILE_NAMES, type PythonFileName } from '../../services/script/scriptGenerator'

  export let active: boolean
  export let executionTrigger = 0

  let editorHostEl: HTMLDivElement | null = null
  let codeMirrorView: EditorView | null = null
  let autoExecute = true
  let executing = false
  let suppressEditorSync = false
  let autoExecuteTimer: number | null = null
  let pendingAutoRun = false
  let lastDebugSignature = ''
  let selectedFile: PythonFileName = 'main.py'
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

  $: scriptInputSignature = JSON.stringify($projectStore.datasets.map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    sourcePath: dataset.sourcePath,
    spectrumType: dataset.spectrumType,
    units: dataset.units,
    style: dataset.style,
    data: { abscissa: dataset.data.abscissa, ordinateOriginal: dataset.data.ordinateOriginal },
    pipeline: dataset.pipeline,
    peaks: dataset.peaks,
  })))

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

  $: {
    const signature = [
      $projectStore.syncMode,
      $projectStore.scriptSyncEnabled ? 'sync-on' : 'sync-off',
      $projectStore.userScriptOverride === null ? 'generated' : 'override',
      String($projectStore.generatedScript.length),
      String($projectStore.userScriptOverride?.length ?? 0),
    ].join('|')

    if (signature !== lastDebugSignature) {
      lastDebugSignature = signature
      console.debug('[script-debug] editor_script_source', {
        syncMode: $projectStore.syncMode,
        scriptSyncEnabled: $projectStore.scriptSyncEnabled,
        source: $projectStore.userScriptOverride === null ? 'generatedScript' : 'userScriptOverride',
        generatedLength: $projectStore.generatedScript.length,
        overrideLength: $projectStore.userScriptOverride?.length ?? 0,
      })
    }
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
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || suppressEditorSync) return

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
      await projectStore.executeScriptForDatasets($projectStore.userScriptOverride ?? files['main.py'])
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
      await projectStore.executeScriptForDatasets($projectStore.userScriptOverride ?? files['main.py'])
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
      {#each PYTHON_FILE_NAMES as fileName}
        <button
          type="button"
          class:current={selectedFile === fileName && !outputViewActive}
          aria-current={selectedFile === fileName && !outputViewActive ? 'page' : undefined}
          on:click={() => {
            outputViewActive = false
            selectedFile = fileName
          }}
        >
          {fileName}{#if $projectStore.pythonFileOverrides?.[fileName]}<span aria-label="edited"> •</span>{/if}
        </button>
      {/each}
      <button
        type="button"
        class="output-tab"
        class:current={outputViewActive}
        class:has-error={Boolean($projectStore.workerLastError)}
        aria-current={outputViewActive ? 'page' : undefined}
        on:click={() => { outputViewActive = true }}
      >
        Output{#if $projectStore.workerLastError}<span aria-label="error"> !</span>{/if}
      </button>
    </nav>

    {#if outputViewActive}
      <div class="script-output-pane" aria-live="polite">
        {#if $projectStore.workerLastError}
          <div class="script-error-pane" role="alert" aria-live="assertive">
            <div class="script-error-header">Script execution error</div>
            <pre>{$projectStore.workerLastError}</pre>
          </div>
        {/if}
        {#if $projectStore.scriptOutput.length > 0}
          <pre class="script-console">{$projectStore.scriptOutput.join('\n')}</pre>
        {:else if !$projectStore.workerLastError}
          <div class="script-output-empty">No output yet. Run the script to see logs or exceptions here.</div>
        {/if}
      </div>
    {:else}
      <div bind:this={editorHostEl} class="script-editor" aria-label={`${selectedFile} Python editor`}></div>
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
