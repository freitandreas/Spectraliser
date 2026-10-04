<script lang="ts">
  import type { ExperimentMetadata, SpectrumDataset } from '../../types/project'
  import { projectStore } from '../../state/projectStore'
  import { METADATA_KIND_OPTIONS, unitsForKind, type MetadataKind } from '../../services/metadataFields'
  import { metadataRows, newMetadataRow, rowsToMetadata, withKind, type MetadataRow } from '../../services/metadataRows'
  import { parseSeriesCoordinate } from '../../services/seriesCoordinates'
  import HelpTip from '../HelpTip.svelte'

  export let dataset: SpectrumDataset
  export let onLinkMetadata: (() => void) | null = null

  const HELP = 'Measurement conditions of this sample. Time and concentration have convertible units and can order series on the third axis of heatmap and 3D plots (General settings → Appearance); numeric custom fields can be chosen there as well. Time accepts numbers or HH:MM:SS. Editing metadata never reruns the processing script.'

  let rows: MetadataRow[] = []
  let errors: Record<number, string> = {}
  let syncedId = ''
  let syncedJson = ''

  $: storedJson = JSON.stringify(dataset.experimentMetadata ?? {})
  $: if (dataset.id !== syncedId || storedJson !== syncedJson) {
    syncedId = dataset.id
    syncedJson = storedJson
    rows = metadataRows(dataset.experimentMetadata)
    errors = {}
  }
  $: hasTime = rows.some((row) => row.kind === 'time')
  $: labelTime = hasTime ? null : parseSeriesCoordinate(dataset.style.label)

  function commit(next: MetadataRow[]): void {
    rows = next
    const result = rowsToMetadata(next)
    errors = result.errors
    if (Object.keys(result.errors).length) return
    const json = JSON.stringify(result.metadata)
    if (json === syncedJson) return
    syncedJson = json
    projectStore.updateDatasetMetadata(dataset.id, { experimentMetadata: result.metadata as ExperimentMetadata })
  }

  function patchRow(index: number, patch: Partial<MetadataRow>): void {
    commit(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))
  }

  function setKind(index: number, kind: MetadataKind): void {
    commit(rows.map((row, position) => (position === index ? withKind(row, kind) : row)))
  }

  function kindTaken(kind: MetadataKind, index: number): boolean {
    return kind !== 'custom' && rows.some((row, position) => position !== index && row.kind === kind)
  }

  function inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value
  }
</script>

<aside class="peak-settings-col metadata-panel" aria-label="Experiment metadata">
  <div class="peak-settings-header">
    <h4>Experiment metadata <HelpTip label="Experiment metadata" text={HELP} /></h4>
    {#if onLinkMetadata}
      <button type="button" class="metadata-link" on:click={onLinkMetadata}>Link CSV…</button>
    {/if}
  </div>

  {#if rows.length}
    <div class="metadata-rows">
      {#each rows as row, index (index)}
        <div class="metadata-row" class:invalid={errors[index]}>
          <select aria-label="Field type" value={row.kind} on:change={(event) => setKind(index, inputValue(event) as MetadataKind)}>
            {#each METADATA_KIND_OPTIONS as option (option.id)}
              <option value={option.id} disabled={kindTaken(option.id, index)}>{option.label}</option>
            {/each}
          </select>
          <button type="button" class="metadata-remove" aria-label={`Remove ${row.name || 'field'}`} on:click={() => commit(rows.filter((_, position) => position !== index))}>×</button>
          {#if row.kind === 'custom'}
            <input class="metadata-name" type="text" placeholder="Field name" value={row.name} on:change={(event) => patchRow(index, { name: inputValue(event) })} />
          {/if}
          <input
            class="metadata-value"
            type="text"
            inputmode={row.kind === 'custom' ? 'text' : 'decimal'}
            placeholder={row.kind === 'time' ? '30 or 00:00:30' : 'Value'}
            value={row.value}
            on:change={(event) => patchRow(index, { value: inputValue(event) })}
          />
          {#if row.kind === 'custom'}
            <input class="metadata-unit" type="text" placeholder="Unit" value={row.unit} on:change={(event) => patchRow(index, { unit: inputValue(event) })} />
          {:else}
            <select class="metadata-unit" aria-label="Unit" value={row.unit} on:change={(event) => patchRow(index, { unit: inputValue(event) })}>
              {#each unitsForKind(row.kind) as unit}<option value={unit}>{unit}</option>{/each}
            </select>
          {/if}
          {#if errors[index]}<p class="metadata-error">{errors[index]}</p>{/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="metadata-empty">No metadata yet.</p>
  {/if}

  {#if labelTime}
    <p class="metadata-derived">Time from label: {labelTime.value} {labelTime.unit}</p>
  {/if}

  <button type="button" class="metadata-add" on:click={() => { rows = [...rows, newMetadataRow(rows)] }}>+ Add field</button>

  <p class="metadata-id">Dataset ID <code>{dataset.id}</code></p>
</aside>

<style>
  h4{display:inline-flex;align-items:center;gap:6px}
  .metadata-rows{display:grid;gap:8px}
  .metadata-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;padding:6px;border:1px solid var(--border);border-radius:6px}
  .metadata-row.invalid{border-color:#b56a6a}
  .metadata-row>input,.metadata-row>select{min-width:0;background:#1c1c20;color:#d4d4d4;border:1px solid #3f3f46;border-radius:5px;padding:5px 6px;font-size:.78rem}
  .metadata-name,.metadata-error{grid-column:1/-1}
  .metadata-value{grid-column:1}
  .metadata-unit{grid-column:2;width:90px}
  .metadata-remove{grid-column:2;grid-row:1;width:26px;border:1px solid var(--border);border-radius:5px;background:transparent;color:var(--text-dim);cursor:pointer}
  .metadata-remove:hover{color:#e7a3a3;border-color:#b56a6a}
  .metadata-error{margin:0;color:#e7a3a3;font-size:.72rem}
  .metadata-empty,.metadata-derived,.metadata-id{margin:0;color:var(--text-dim);font-size:.75rem;overflow-wrap:anywhere}
  .metadata-id code{user-select:all}
  .metadata-add,.metadata-link{padding:5px 10px;border:1px dashed var(--border);border-radius:6px;background:transparent;color:var(--text);font-size:.76rem;cursor:pointer}
  .metadata-link{border-style:solid}
  .metadata-add:hover,.metadata-link:hover{border-color:var(--accent)}
  .metadata-id{margin-top:auto}
</style>
