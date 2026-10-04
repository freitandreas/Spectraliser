<script lang="ts">
  import HelpTip from './HelpTip.svelte'
  import { createEventDispatcher } from 'svelte'
  import { parseMetadataTable, validateAndLinkMetadata, type MetadataDelimiter, type MetadataMatchField, type MetadataTable } from '../services/metadata/importMetadata'
  import type { SpectrumDataset } from '../types/project'

  export let open = false
  export let datasets: SpectrumDataset[] = []
  export let error = ''

  const dispatch = createEventDispatcher<{
    close: undefined
    import: { table: MetadataTable; delimiter: MetadataDelimiter; matchField: MetadataMatchField; keyColumn: string }
  }>()

  let table: MetadataTable = { headers: [], rows: [] }
  let delimiter: MetadataDelimiter = ','
  let matchField: MetadataMatchField = 'label'
  let keyColumn = ''
  let parseError = ''
  let fileName = ''
  let fileInput: HTMLInputElement | null = null
  let preview: ReturnType<typeof validateAndLinkMetadata> | null = null
  let reading = false
  $: canImport = open && !reading && !!preview && preview.errors.length === 0 && preview.matchedCount > 0
  $: if (open && table.headers.length) {
    preview = validateAndLinkMetadata(datasets, table, { delimiter, matchField, keyColumn })
  }

  async function loadFile(event: Event): Promise<void> {
    await readFile(event.currentTarget as HTMLInputElement)
  }

  async function readFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0]
    parseError = ''
    preview = null
    table = { headers: [], rows: [] }
    if (!file) return
    fileName = file.name
    reading = true
    try {
      table = parseMetadataTable(await file.text(), delimiter)
      keyColumn = table.headers.includes(keyColumn) ? keyColumn : table.headers[0] ?? ''
    } catch (cause) {
      parseError = cause instanceof Error ? cause.message : 'Could not read metadata table.'
    } finally {
      reading = false
    }
  }

  function setDelimiter(value: MetadataDelimiter): void {
    delimiter = value
    // A selected file is read again so changing the separator never previews stale parsing.
    if (fileInput?.files?.[0]) void readFile(fileInput)
  }

  function submit(): void {
    if (!canImport || !preview) return
    dispatch('import', { table, delimiter, matchField, keyColumn })
  }
</script>

{#if open}
  <div class="backdrop" role="presentation" on:click={() => dispatch('close')}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="metadata-title" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation={() => {}}>
      <header>
        <div>
          <h2 id="metadata-title">Link experiment metadata <HelpTip label="Link metadata" text="Import a CSV table and match each row exactly to one dataset. Blank metadata cells are stored as missing values. Other columns are imported as metadata fields; repeated fields are updated and unrelated existing fields are retained." /></h2>
        </div>
        <button type="button" class="quiet" on:click={() => dispatch('close')}>Close</button>
      </header>

      <div class="controls">
        <label>Metadata CSV
          <input id="metadata-file" bind:this={fileInput} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" on:change={loadFile} />
        </label>
        <label>Delimiter
          <select value={delimiter} on:change={(event) => setDelimiter((event.currentTarget as HTMLSelectElement).value as MetadataDelimiter)}>
            <option value=",">Comma</option>
            <option value=";">Semicolon</option>
            <option value="\t">Tab</option>
          </select>
        </label>
        <label><span class="label-line">Match dataset by <HelpTip label="Matching" text="Matching is case-sensitive and exact. Series labels work well for multi-series files; file names and source paths may be shared. Dataset IDs are shown in each dataset's metadata box." /></span>
          <select bind:value={matchField}>
            <option value="label">Series label</option>
            <option value="id">Dataset ID</option>
            <option value="name">File name</option>
            <option value="sourcePath">Source path</option>
          </select>
        </label>
        <label>Dataset key column
          <select bind:value={keyColumn}>
            {#each table.headers as header}
              <option value={header}>{header}</option>
            {/each}
          </select>
        </label>
      </div>


      {#if reading}<p class="message">Reading table…</p>{/if}
      {#if fileName}<p class="message">File: {fileName} · {table.rows.length} data row(s)</p>{/if}
      {#if parseError}<p class="message error">{parseError}</p>{/if}
      {#if error}<p class="message error">{error}</p>{/if}
      {#if preview}
        {#if preview.errors.length}
          <div class="validation error" role="alert">
            <strong>Fix these validation issues before importing:</strong>
            <ul>{#each preview.errors as issue}<li>{issue}</li>{/each}</ul>
          </div>
        {:else}
          <p class="validation">
            Exact matches: {preview.matchedCount} of {table.rows.length} rows.
            {preview.unmatchedDatasetLabels.length} dataset(s) will remain without metadata.
          </p>
        {/if}

        <div class="table-wrap">
          <table>
            <thead><tr>{#each table.headers as header}<th>{header}</th>{/each}</tr></thead>
            <tbody>
              {#each table.rows.slice(0, 6) as row, rowIndex}
                <tr>
                  {#each table.headers as _, index}
                    <td>{row[index]?.trim().length ? row[index] : '—'}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
          {#if table.rows.length > 6}<p class="message">Previewing the first 6 rows.</p>{/if}
        </div>
      {/if}

      <footer>
        <span>{datasets.length} dataset(s) available</span>
        <button type="button" class="run" disabled={!canImport} on:click={submit}>Link metadata</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 35; display: grid; place-items: center; padding: 20px; background: rgba(5, 7, 10, .68); }
  .modal { width: min(900px, 100%); max-height: calc(100vh - 40px); overflow: auto; padding: 18px; border: 1px solid #3f3f46; border-radius: 10px; background: #252526; color: #d4d4d4; }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  h2 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 1.05rem; }
  .label-line { display: inline-flex; align-items: center; gap: 6px; }
  p { margin: 6px 0; color: #a9a9ad; font-size: .84rem; line-height: 1.45; }
  .controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 18px 0 8px; }
  label { display: grid; gap: 6px; color: #a9a9ad; font-size: .84rem; }
  input, select { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #45454c; border-radius: 5px; background: #1c1c20; color: #ddd; }
  .message, .validation { margin: 10px 0; }
  .validation { color: #b7e4c7; }
  .error { color: #ffb7c1; }
  .validation ul { margin: 6px 0; padding-left: 20px; }
  .table-wrap { max-height: 230px; overflow: auto; border: 1px solid #3f3f46; border-radius: 5px; }
  table { width: 100%; border-collapse: collapse; font-size: .82rem; }
  th, td { padding: 7px 9px; border-bottom: 1px solid #3f3f46; text-align: left; white-space: pre-wrap; }
  th { position: sticky; top: 0; background: #303036; }
  footer { margin-top: 14px; color: #a9a9ad; font-size: .84rem; }
  button { padding: 8px 11px; border: 1px solid #3f3f46; border-radius: 5px; background: #2b2c31; color: #ddd; cursor: pointer; }
  .run { border-color: #0a5f9f; background: #0872bd; }
  .run:disabled { opacity: .5; cursor: not-allowed; }
  @media (max-width: 600px) { .controls { grid-template-columns: 1fr; } }
</style>
