<script lang="ts">
  import {
    SERIES_TIME_UNITS,
    parseSeriesCoordinate,
    type SeriesCoordinate,
    type SeriesTimeUnit,
  } from '../../services/seriesCoordinates'

  export let label: string
  export let coordinate: SeriesCoordinate | null | undefined = null
  export let onChange: (coordinate: SeriesCoordinate | null) => void

  let draftValue = ''
  let draftUnit: SeriesTimeUnit = 's'
  let error = ''
  let lastKey = ''

  $: parsed = parseSeriesCoordinate(label)
  $: {
    const key = `${coordinate?.value ?? ''}|${coordinate?.unit ?? ''}`
    if (key !== lastKey) {
      lastKey = key
      draftValue = coordinate ? String(coordinate.value) : ''
      draftUnit = coordinate?.unit ?? parsed?.unit ?? 's'
      error = ''
    }
  }

  function commit(): void {
    const text = draftValue.trim()
    if (!text) {
      error = ''
      if (coordinate) onChange(null)
      return
    }
    const clock = /^\d{1,3}:[0-5]\d:[0-5]\d(\.\d+)?$/.test(text) ? parseSeriesCoordinate(text) : null
    const value = clock ? clock.value : Number(text.replace(',', '.'))
    const unit = clock ? clock.unit : draftUnit
    if (!Number.isFinite(value)) {
      error = 'Enter a number or a time as HH:MM:SS.'
      return
    }
    error = ''
    onChange({ value, unit })
  }
</script>

<fieldset class="series-coordinate">
  <legend>Series time coordinate</legend>
  <p>
    {#if coordinate}
      Manual value in use.
    {:else if parsed}
      Read from label: <strong>{parsed.value} {parsed.unit}</strong>.
    {:else}
      No time found in the label; this series is placed by order in heatmap and 3D views.
    {/if}
  </p>
  <div class="coordinate-row">
    <input
      type="text"
      inputmode="decimal"
      placeholder={parsed ? String(parsed.value) : 'e.g. 30 or 00:01:30'}
      bind:value={draftValue}
      on:change={commit}
    />
    <select bind:value={draftUnit} on:change={commit} aria-label="Time unit">
      {#each SERIES_TIME_UNITS as unit}<option value={unit}>{unit}</option>{/each}
    </select>
  </div>
  {#if error}<small class="error">{error}</small>{/if}
  {#if coordinate}
    <button type="button" class="ghost" on:click={() => { draftValue = ''; onChange(null) }}>Use label value</button>
  {/if}
</fieldset>

<style>
  .series-coordinate{display:grid;gap:6px;margin:0;padding:10px;border:1px solid #3f3f46;border-radius:8px}
  legend{padding:0 4px;color:#c2c7cb;font-size:.78rem}
  p{margin:0;color:#9da0a5;font-size:.74rem;line-height:1.4}
  .coordinate-row{display:grid;grid-template-columns:minmax(0,1fr) 80px;gap:6px}
  .error{color:#ffb7c1;font-size:.72rem}
  button{justify-self:start}
</style>
