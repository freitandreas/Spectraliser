<script lang="ts">
  import {
    MAX_INTERPOLATION_STEPS,
    type PlotMode,
    type PlotStylePreferences,
  } from '../services/startupPreferences'
  import { SERIES_TIME_UNITS, type SeriesTimeUnit } from '../services/seriesCoordinates'

  export let plotStyle: PlotStylePreferences
  export let onChange: (next: PlotStylePreferences) => void
  export let compact = false

  const modes: Array<{ id: PlotMode; title: string; detail: string }> = [
    { id: 'overlay', title: 'All in one', detail: 'Every series overlaid in one spectrum.' },
    { id: 'heatmap', title: 'Heatmap', detail: 'Abscissa × series time, ordinate as colour.' },
    { id: 'surface3d', title: '3D surface', detail: 'Abscissa, series time and ordinate in WebGL.' },
  ]

  function patch(next: Partial<PlotStylePreferences>): void {
    onChange({ ...plotStyle, ...next })
  }

  function patchInterpolation(next: Partial<PlotStylePreferences['seriesInterpolation']>): void {
    patch({ seriesInterpolation: { ...plotStyle.seriesInterpolation, ...next } })
  }

  function setSteps(raw: string): void {
    const value = Math.round(Number(raw))
    if (Number.isFinite(value)) patchInterpolation({ steps: Math.min(MAX_INTERPOLATION_STEPS, Math.max(1, value)) })
  }
</script>

<div class="plot-mode-settings" class:compact>
  <div class="mode-options" role="group" aria-label="Spectrum plot">
    {#each modes as mode (mode.id)}
      <button
        type="button"
        class:chosen={plotStyle.plotMode === mode.id}
        aria-pressed={plotStyle.plotMode === mode.id}
        on:click={() => patch({ plotMode: mode.id })}
      >
        <strong>{mode.title}</strong>
        {#if !compact}<span>{mode.detail}</span>{/if}
      </button>
    {/each}
  </div>

  <div class="series-row">
    <label>
      Series time unit
      <select
        value={plotStyle.seriesUnit}
        on:change={(event) => patch({ seriesUnit: (event.target as HTMLSelectElement).value as SeriesTimeUnit })}
      >
        {#each SERIES_TIME_UNITS as unit}<option value={unit}>{unit}</option>{/each}
      </select>
    </label>
    <label class="toggle">
      <input
        type="checkbox"
        checked={plotStyle.seriesInterpolation.enabled}
        on:change={(event) => patchInterpolation({ enabled: (event.target as HTMLInputElement).checked })}
      />
      <span>Interpolate between measured series</span>
    </label>
    {#if plotStyle.seriesInterpolation.enabled}
      <label>
        Intermediate series per interval
        <input
          type="number"
          min="1"
          max={MAX_INTERPOLATION_STEPS}
          step="1"
          value={plotStyle.seriesInterpolation.steps}
          on:change={(event) => setSteps((event.target as HTMLInputElement).value)}
        />
      </label>
    {/if}
  </div>
  <small>
    Times are read from series labels (e.g. <code>t = 30 s</code>, <code>2.5 min</code>, <code>00:01:30</code>) or set per
    sample in Sample Settings. Interpolation is linear between neighbouring measured times only (no extrapolation),
    generated series are marked as interpolated, and imported data are never changed.
  </small>
</div>

<style>
  .plot-mode-settings{display:grid;gap:12px}
  .mode-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .mode-options button{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;min-height:58px;padding:9px 10px;border:1px solid #3b4148;border-radius:7px;background:#252a30;color:#d9dde0;text-align:left;cursor:pointer}
  .compact .mode-options button{min-height:0;padding:7px 8px}
  .mode-options strong{font-size:.78rem}
  .mode-options span{color:#9ca4ab;font-size:.66rem;line-height:1.35}
  .mode-options button.chosen{border-color:#7ca6b5;background:#2b353a;box-shadow:inset 0 0 0 1px rgba(124,166,181,.16)}
  .series-row{display:flex;flex-wrap:wrap;align-items:end;gap:12px}
  label{display:grid;gap:6px;color:#c2c7cb;font-size:.75rem}
  .toggle{display:flex;align-items:center;gap:7px;min-height:34px}
  input,select{min-width:0;background:#1c1c20;color:#d4d4d4;border:1px solid #3f3f46;border-radius:6px;padding:7px}
  input[type=number]{width:90px}
  input[type=checkbox]{accent-color:#86aebc}
  small{color:#9ca4ab;font-size:.68rem;line-height:1.45}
  code{color:#c5d9e2}
</style>
