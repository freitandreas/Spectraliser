<script lang="ts">
  import type { PlotMode, PlotStylePreferences } from '../services/startupPreferences'
  import { defaultUnitForKind, fieldKind, unitsForKind } from '../services/metadataFields'
  import HelpTip from './HelpTip.svelte'

  export let plotStyle: PlotStylePreferences
  export let onChange: (next: PlotStylePreferences) => void
  export let compact = false
  /** Numeric custom metadata fields of the loaded samples, offered as third axis next to time and concentration. */
  export let customFields: string[] = []

  const modes: Array<{ id: PlotMode; title: string }> = [
    { id: 'overlay', title: 'All in one' },
    { id: 'heatmap', title: 'Heatmap' },
    { id: 'surface3d', title: '3D surface' },
  ]
  const HELP = {
    modes: 'All in one overlays every series in one spectrum. Heatmap shows abscissa × third axis with the ordinate as colour. 3D surface plots abscissa, third axis and ordinate in WebGL.',
    axis: 'Coordinate that orders the series in heatmap and 3D views. Values come from the metadata box in each sample’s Data tab; time is also read from series labels such as “t = 30 s”, “2.5 min” or “00:01:30”. Time and concentration are converted into the chosen unit; series without a usable value are placed by their order.',
  }

  $: kind = fieldKind(plotStyle.seriesField)
  $: units = unitsForKind(kind)
  $: fieldOptions = [
    { id: 'time', label: 'Time' },
    { id: 'concentration', label: 'Concentration' },
    ...[...new Set([...customFields, ...(kind === 'custom' ? [plotStyle.seriesField] : [])])].map((name) => ({ id: name, label: name })),
  ]

  function patch(next: Partial<PlotStylePreferences>): void {
    onChange({ ...plotStyle, ...next })
  }

  function setField(field: string): void {
    patch({ seriesField: field, seriesUnit: defaultUnitForKind(fieldKind(field)) })
  }

</script>

<div class="plot-mode-settings" class:compact>
  <div class="mode-row">
    <div class="mode-options" role="group" aria-label="Spectrum plot">
      {#each modes as mode (mode.id)}
        <button
          type="button"
          class:chosen={plotStyle.plotMode === mode.id}
          aria-pressed={plotStyle.plotMode === mode.id}
          on:click={() => patch({ plotMode: mode.id })}
        >{mode.title}</button>
      {/each}
    </div>
    <HelpTip label="Plot modes" text={HELP.modes} />
  </div>

  <div class="series-row">
    <label>
      <span class="label-line">Third axis <HelpTip label="Third axis" text={HELP.axis} /></span>
      <select value={plotStyle.seriesField} on:change={(event) => setField((event.target as HTMLSelectElement).value)}>
        {#each fieldOptions as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
      </select>
    </label>
    {#if units.length}
      <label>
        Unit
        <select value={plotStyle.seriesUnit} on:change={(event) => patch({ seriesUnit: (event.target as HTMLSelectElement).value })}>
          {#each units as unit}<option value={unit}>{unit}</option>{/each}
        </select>
      </label>
    {/if}
  </div>
</div>

<style>
  .plot-mode-settings{display:grid;gap:12px}
  .mode-row{display:flex;align-items:center;gap:8px}
  .mode-options{flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .mode-options button{min-width:0;padding:9px 10px;border:1px solid #3b4148;border-radius:7px;background:#252a30;color:#d9dde0;font-size:.78rem;font-weight:600;cursor:pointer}
  .compact .mode-options button{padding:7px 8px}
  .mode-options button.chosen{border-color:#7ca6b5;background:#2b353a;box-shadow:inset 0 0 0 1px rgba(124,166,181,.16)}
  .series-row{display:flex;flex-wrap:wrap;align-items:end;gap:12px}
  label{display:grid;gap:6px;color:#c2c7cb;font-size:.75rem}
  .label-line{display:inline-flex;align-items:center;gap:6px}
  select{min-width:0;background:#1c1c20;color:#d4d4d4;border:1px solid #3f3f46;border-radius:6px;padding:7px}
</style>
