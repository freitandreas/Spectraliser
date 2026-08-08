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

  export let open = false
  export let files: File[] = []

  const dispatch = createEventDispatcher<{
    close: undefined
    import: { files: File[]; options: ImportOptions }
  }>()

  let options: ImportOptions = { ...defaultImportOptions }
  let activeIndex = 0
  let tableRows: string[][] = []
  let seriesPreview: ParsedSpectrumSeries[] = []
  let loadingPreview = false
  let previewError = ''

  const previewPalette = ['#4fc1ff', '#78d08f', '#f5b83d', '#f08bd9', '#ff8f70', '#a9a2ff']

  $: if (activeIndex >= files.length) {
    activeIndex = files.length > 0 ? files.length - 1 : 0
  }

  $: previewDependency = `${open}|${files.length}|${activeIndex}|${options.delimiter}|${options.customDelimiter ?? ''}|${options.decimalSeparator}|${options.startRow}|${options.hasHeader}|${options.xColumn}`

  $: if (open && files.length > 0 && previewDependency.length > 0) {
    void refreshPreview()
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
    const file = files[activeIndex]
    if (!file) {
      tableRows = []
      seriesPreview = []
      previewError = ''
      return
    }

    loadingPreview = true
    previewError = ''

    try {
      const rows = await readRows(file)
      tableRows = rows.slice(0, 40)

      const collection = file.name.toLowerCase().endsWith('.xlsx')
        ? parseXlsxCollection(await file.arrayBuffer(), options)
        : parseDelimitedCollection(await file.text(), options)
      seriesPreview = collection.series
    } catch (error) {
      previewError = error instanceof Error ? error.message : 'Preview failed'
      seriesPreview = []
      tableRows = []
    } finally {
      loadingPreview = false
    }
  }

  function submitImport(): void {
    if (files.length === 0) {
      return
    }

    dispatch('import', {
      files,
      options,
    })
  }

  function buildPolyline(series: ParsedSpectrumSeries): string {
    const x = series.abscissa
    const y = series.ordinate
    if (x.length === 0 || y.length === 0) {
      return ''
    }

    const minX = Math.min(...x)
    const maxX = Math.max(...x)
    const minY = Math.min(...y)
    const maxY = Math.max(...y)
    const spanX = maxX - minX || 1
    const spanY = maxY - minY || 1

    return x
      .map((value, index) => {
        const px = 20 + ((value - minX) / spanX) * 760
        const py = 210 - ((y[index] - minY) / spanY) * 180
        return `${px},${py}`
      })
      .join(' ')
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
          X Column
          <input type="number" min="0" bind:value={options.xColumn} />
        </label>
      </div>

      <div class="preview-shell">
        <div class="preview-table-wrap" style={`--row-accent:${previewPalette[0]};`}>
          <h3>Table Preview</h3>
          <div class="wizard-table-scroll">
            <table class="preview-table">
              <tbody>
                {#each tableRows as row, rowIndex (rowIndex)}
                  <tr>
                    {#each row as cell, cellIndex (cellIndex)}
                      <td>{cell}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <div class="preview-plot-wrap">
          <h3>Plot Preview</h3>
          <svg class="preview-plot" viewBox="0 0 800 230" role="img" aria-label="Import preview plot">
            <rect x="0" y="0" width="800" height="230" fill="#15171b"></rect>
            {#each seriesPreview as series, index (series.label + index)}
              <polyline
                fill="none"
                stroke={previewPalette[index % previewPalette.length]}
                stroke-width="2"
                points={buildPolyline(series)}
              />
            {/each}
          </svg>
          <div class="series-legend">
            {#each seriesPreview as series, index (series.label + index)}
              <span class="legend-item">
                <span
                  class="legend-dot"
                  style={`background:${previewPalette[index % previewPalette.length]};`}
                ></span>
                {series.label}
              </span>
            {/each}
          </div>
        </div>
      </div>

      {#if loadingPreview}
        <div class="status">Refreshing preview...</div>
      {/if}
      {#if previewError}
        <div class="status error">{previewError}</div>
      {/if}

      <footer>
        <div class="file-label">{files.length} file(s) queued</div>
        <button type="button" class="run" disabled={files.length === 0} on:click={submitImport}>
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

  h2,
  h3 {
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

  .preview-shell {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 12px;
  }

  .preview-table-wrap,
  .preview-plot-wrap {
    border: 1px solid #3f3f46;
    border-radius: 8px;
    padding: 10px;
    background: #1a1b1f;
    min-height: 0;
  }

  .wizard-table-scroll {
    max-height: 260px;
    overflow: auto;
    margin-top: 8px;
  }

  .preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .preview-table td {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 6px;
    color: #d4d4d4;
  }

  .preview-table tr:nth-child(odd) {
    background: color-mix(in srgb, var(--row-accent) 12%, transparent);
  }

  .preview-table tr:nth-child(even) {
    background: color-mix(in srgb, var(--row-accent) 5%, transparent);
  }

  .preview-plot {
    width: 100%;
    height: 230px;
    border-radius: 6px;
    margin-top: 8px;
  }

  .series-legend {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: #9da0a5;
    font-size: 0.78rem;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
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

  .wizard-table-scroll,
  .modal {
    scrollbar-width: thin;
    scrollbar-color: #4a5f72 #1a1b1f;
  }

  .wizard-table-scroll::-webkit-scrollbar,
  .modal::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .wizard-table-scroll::-webkit-scrollbar-track,
  .modal::-webkit-scrollbar-track {
    background: #1a1b1f;
  }

  .wizard-table-scroll::-webkit-scrollbar-thumb,
  .modal::-webkit-scrollbar-thumb {
    background: #4a5f72;
    border-radius: 8px;
    border: 2px solid #1a1b1f;
  }

  @media (max-width: 900px) {
    .modal-grid {
      grid-template-columns: 1fr 1fr;
    }

    .preview-shell {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .modal-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
