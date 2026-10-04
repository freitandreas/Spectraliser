<script lang="ts">
  import * as XLSX from 'xlsx'
  import { createEventDispatcher } from 'svelte'
  import { defaultImportOptions } from '../services/import/importWizard'
  import {
    parseDelimitedCollection,
    parseXlsxCollection,
    type ImportOptions,
    type ParsedSpectrumSeries,
  } from '../services/import/parsers'
  import type { SpectrumType } from '../types/project'
  import {
    DEFAULT_STARTUP_PREFERENCES,
    axisDefaultsForPreference,
    type StartupPreferences,
  } from '../services/startupPreferences'
  import ImportMetadataSettings from './ImportMetadataSettings.svelte'
  import ImportDataPreview from './ImportDataPreview.svelte'

  export let open = false
  export let files: File[] = []
  export let defaultSpectrumType: SpectrumType = 'uv-vis'
  export let startupPreferences: StartupPreferences = DEFAULT_STARTUP_PREFERENCES

  const dispatch = createEventDispatcher<{
    close: undefined
    import: { files: File[]; options: ImportOptions }
  }>()

  let options: ImportOptions = { ...defaultImportOptions }
  let activeIndex = 0
  let tableRows: string[][] = []
  let seriesPreview: ParsedSpectrumSeries[] = []
  let seriesLabels: string[] = []
  let seriesLabelsByFile: Record<number, string[]> = {}
  let loadingPreview = false
  let previewError = ''
  let wasOpen = false
  let metadataTouched = false
  let previewGeneration = 0
  $: if (open && !wasOpen) {
    options = {
      ...defaultImportOptions,
      spectrumType: defaultSpectrumType,
      axisMetadata: axesForType(defaultSpectrumType),
    }
    seriesLabelsByFile = {}
    metadataTouched = false
    wasOpen = true
  }
  $: if (!open) wasOpen = false
  let metadataValid = true
  $: canSubmit = files.length > 0 && metadataValid && !loadingPreview

  $: if (activeIndex >= files.length) {
    activeIndex = files.length > 0 ? files.length - 1 : 0
  }

  $: if (open && files.length > 0 && seriesLabelsByFile[activeIndex]) {
    seriesLabels = seriesLabelsByFile[activeIndex]
  }

  $: previewDependency = `${open}|${files.length}|${activeIndex}|${options.delimiter}|${options.customDelimiter ?? ''}|${options.decimalSeparator}|${options.startRow}|${options.hasHeader}|${options.xColumn}`

  $: if (open && files.length > 0 && previewDependency.length > 0) {
    void refreshPreview()
  }

  function axesForType(type: SpectrumType): NonNullable<ImportOptions['axisMetadata']> {
    return type === startupPreferences.spectrumType ? { ...startupPreferences.axes } : axisDefaultsForPreference(type)
  }

  function handleBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      dispatch('close')
    }
  }

  function setActive(index: number): void {
    activeIndex = index
  }

  function getDelimiter(options: ImportOptions): string {
    return options.delimiter === 'custom' ? options.customDelimiter ?? ',' : options.delimiter
  }

  async function readRows(file: File): Promise<string[][]> {
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const firstSheet = workbook.SheetNames[0]
      if (!firstSheet) {
        return []
      }
      const worksheet = workbook.Sheets[firstSheet]
      const rows = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
        header: 1,
        raw: false,
      })
      return rows.map((row) => row.map((value) => String(value ?? '')))
    }

    const text = await file.text()
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    const delimiter = getDelimiter(options)
    return lines.filter((line) => line.trim().length > 0).map((line) => line.split(delimiter))
  }

  async function refreshPreview(): Promise<void> {
    const generation = ++previewGeneration
    const file = files[activeIndex]
    if (!file) {
      tableRows = []
      seriesPreview = []
      seriesLabels = []
      previewError = ''
      loadingPreview = false
      return
    }

    loadingPreview = true
    previewError = ''

    try {
      const rows = await readRows(file)
      if (generation !== previewGeneration) return
      tableRows = rows

      const collection = file.name.toLowerCase().endsWith('.xlsx')
        ? parseXlsxCollection(await file.arrayBuffer(), options)
        : parseDelimitedCollection(await file.text(), options)
      if (generation !== previewGeneration) return
      seriesPreview = collection.series
      const fileLabel = file.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ').trim() || file.name
      const fallbackLabel = (index: number) => collection.series.length > 1 ? `${fileLabel} — ${index + 1}` : fileLabel
      seriesLabels = collection.series.map((series, index) => seriesLabelsByFile[activeIndex]?.[index] ?? (
        options.hasHeader && series.label.trim() ? series.label : fallbackLabel(index)
      ))
      seriesLabelsByFile = { ...seriesLabelsByFile, [activeIndex]: seriesLabels }
    } catch (error) {
      if (generation !== previewGeneration) return
      previewError = error instanceof Error ? error.message : 'Preview failed'
      seriesPreview = []
      tableRows = []
    } finally {
      if (generation === previewGeneration) loadingPreview = false
    }
  }

  function submitImport(): void {
    if (!canSubmit) {
      return
    }

    dispatch('import', {
      files,
      options: { ...options, seriesLabelOverridesByFile: seriesLabelsByFile },
    })
  }

</script>

{#if open}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close import wizard"
    on:click={() => dispatch('close')}
    on:keydown={handleBackdropKeydown}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Import wizard"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown|stopPropagation={() => {}}
    >
      <header>
        <h2>Import Wizard</h2>
        <button type="button" class="ghost" on:click={() => dispatch('close')}>Close</button>
      </header>

      {#if files.length > 0}
        <div class="file-steps">
          {#each files as file, index}
            <button
              type="button"
              class:active={index === activeIndex}
              class="step-button"
              on:click={() => setActive(index)}
            >
              {index + 1}
            </button>
          {/each}
        </div>
        <div class="active-file">{files[activeIndex]?.name}</div>
      {/if}

      <div class="modal-grid">
        <label>
          Delimiter
          <select bind:value={options.delimiter}>
            <option value=",">Comma</option>
            <option value=";">Semicolon</option>
            <option value="\t">Tab</option>
            <option value="|">Pipe</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        {#if options.delimiter === 'custom'}
          <label>
            Custom Delimiter
            <input type="text" bind:value={options.customDelimiter} maxlength="2" />
          </label>
        {/if}

        <label>
          Decimal Separator
          <select bind:value={options.decimalSeparator}>
            <option value=".">Dot</option>
            <option value=",">Comma</option>
          </select>
        </label>

        <label>
          Start Row
          <input type="number" min="0" bind:value={options.startRow} />
        </label>

        <label>
          Header Row Present
          <input type="checkbox" bind:checked={options.hasHeader} />
        </label>

        <label>
          Spectrum Type
          <select
            value={options.spectrumType}
            on:change={(event) => {
              const type = (event.target as HTMLSelectElement).value as SpectrumType
              options = {
                ...options,
                spectrumType: type,
                          axisMetadata: metadataTouched ? options.axisMetadata : axesForType(type),
              }
            }}
          >
            <option value="uv-vis">UV-Vis</option>
            <option value="ir">IR</option>
            <option value="raman">Raman</option>
          </select>
        </label>

        <label>
          Abscissa Column
          <input type="number" min="0" bind:value={options.xColumn} />
        </label>
      </div>

      <ImportMetadataSettings
        {options}
        {seriesPreview}
        bind:valid={metadataValid}
        on:change={(event) => { options = event.detail }}
        on:metadatachange={() => { metadataTouched = true }}
      />

      <ImportDataPreview
        tableRows={tableRows}
        series={seriesPreview}
        labels={seriesLabels}
        on:labelchange={(event) => {
          seriesLabels = event.detail
          seriesLabelsByFile = { ...seriesLabelsByFile, [activeIndex]: seriesLabels }
        }}
      />

      {#if loadingPreview}
        <div class="status">Refreshing preview...</div>
      {/if}
      {#if previewError}
        <div class="status error">{previewError}</div>
      {/if}

      <footer>
        <div class="file-label">{files.length} file(s) queued</div>
        <button type="button" class="run" disabled={!canSubmit} on:click={submitImport}>
          Import Files
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 7, 10, 0.66);
    display: grid;
    place-items: center;
    z-index: 30;
  }

  .modal {
    width: min(1100px, calc(100vw - 32px));
    max-height: calc(100vh - 40px);
    overflow: auto;
    background: #252526;
    border: 1px solid #3f3f46;
    border-radius: 10px;
    padding: 16px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  }

  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .file-steps {
    display: flex;
    gap: 6px;
    margin-top: 12px;
  }

  .step-button {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 1px solid #3f3f46;
    background: #1c1c20;
    color: #d4d4d4;
    cursor: pointer;
  }

  .step-button.active {
    border-color: #007acc;
    background: #0f3650;
  }

  .active-file {
    margin-top: 8px;
    color: #9da0a5;
    font-size: 0.85rem;
  }

  .modal-grid {
    margin: 14px 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  label {
    display: grid;
    gap: 6px;
    color: #9da0a5;
    font-size: 0.84rem;
  }

  input,
  select {
    width: 100%;
    background: #1c1c20;
    color: #d4d4d4;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    padding: 8px;
  }

  input[type='checkbox'] {
    width: auto;
    justify-self: start;
  }

  .status {
    margin-top: 10px;
    color: #9da0a5;
    font-size: 0.83rem;
  }

  .status.error {
    color: #ffb7c1;
  }

  .ghost,
  .run {
    border-radius: 6px;
    border: 1px solid #3f3f46;
    color: #d4d4d4;
    background: #2b2c31;
    padding: 8px 10px;
    cursor: pointer;
  }

  .run {
    background: linear-gradient(180deg, #1077c9 0%, #0662a9 100%);
    border-color: #0a5f9f;
  }

  .run:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .file-label {
    color: #9da0a5;
    font-size: 0.82rem;
  }

  .modal {
    scrollbar-width: thin;
    scrollbar-color: #4a5f72 #1a1b1f;
  }

  .modal::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .modal::-webkit-scrollbar-track {
    background: #1a1b1f;
  }

  .modal::-webkit-scrollbar-thumb {
    background: #4a5f72;
    border-radius: 8px;
    border: 2px solid #1a1b1f;
  }

  @media (max-width: 900px) {
    .modal-grid {
      grid-template-columns: 1fr 1fr;
    }

  }

  @media (max-width: 640px) {
    .modal-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
