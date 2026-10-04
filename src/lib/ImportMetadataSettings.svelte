<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import {
    ABSCISSA_QUANTITIES,
    ORDINATE_QUANTITIES,
    ORDINATE_UNITS,
    axisDefaultsFor,
    formatUnit,
  } from '../services/spectrumPresets'
  import type { ImportOptions, ParsedSpectrumSeries } from '../services/import/parsers'
  import { canConvertAbscissa } from '../services/import/unitConversion'
  import { UNITS_BY_QUANTITY } from '../services/startupPreferences'

  export let options: ImportOptions
  export let seriesPreview: ParsedSpectrumSeries[] = []
  export let valid = true

  const dispatch = createEventDispatcher<{
    change: ImportOptions
    metadatachange: undefined
  }>()

  $: spectrumType = options.spectrumType ?? 'uv-vis'
  $: axisMetadata = options.axisMetadata ?? (() => {
    const defaults = axisDefaultsFor(spectrumType)
    return {
      xQuantity: defaults.xQuantity,
      xUnit: defaults.x,
      yQuantity: defaults.yQuantity,
      yUnit: defaults.y,
    }
  })()
  $: availableXUnits = UNITS_BY_QUANTITY[axisMetadata.xQuantity] ?? ['nm', 'µm', 'm', 'cm⁻¹', 'Hz', 'eV', 's']
  $: sourceXUnit = seriesPreview[0]?.xUnit ?? axisDefaultsFor(spectrumType).x
  $: sourceConversionValid = canConvertAbscissa(sourceXUnit, axisMetadata.xUnit)
  $: ramanAxesValid = spectrumType !== 'raman'
    || (axisMetadata.xQuantity === 'Raman shift' && ['cm^-1', 'cm⁻¹', '1/cm'].includes(axisMetadata.xUnit))
  $: valid = sourceConversionValid && ramanAxesValid

  function emit(next: ImportOptions, metadataChanged = false): void {
    options = next
    dispatch('change', next)
    if (metadataChanged) dispatch('metadatachange')
  }

  function updateAxes(patch: Partial<NonNullable<ImportOptions['axisMetadata']>>): void {
    const nextQuantity = patch.xQuantity ?? axisMetadata.xQuantity
    const nextUnit = patch.xQuantity
      ? (UNITS_BY_QUANTITY[nextQuantity]?.[0] ?? '')
      : patch.xUnit ?? axisMetadata.xUnit
    emit({
      ...options,
      axisMetadata: { ...axisMetadata, ...patch, xUnit: nextUnit },
    }, true)
  }

</script>

<section class="import-metadata">
  <h3>Review import metadata</h3>
  <p>
    Source abscissa: <strong>{seriesPreview[0]?.xQuantity ?? 'not identified'} / {seriesPreview[0]?.xUnit ? formatUnit(seriesPreview[0].xUnit) : 'technique default assumed'}</strong>
    · source ordinate: <strong>{seriesPreview[0]?.yQuantity ?? 'not identified'} / {seriesPreview[0]?.yUnit ? formatUnit(seriesPreview[0].yUnit) : 'not identified'}</strong>
  </p>
  <div class="axis-grid">
    <label>Import abscissa quantity
      <select value={axisMetadata.xQuantity} on:change={(event) => updateAxes({ xQuantity: (event.target as HTMLSelectElement).value })}>
        {#each ABSCISSA_QUANTITIES as quantity}<option value={quantity}>{quantity}</option>{/each}
      </select>
    </label>
    <label>Target abscissa unit
      <select value={axisMetadata.xUnit} on:change={(event) => updateAxes({ xUnit: (event.target as HTMLSelectElement).value })}>
        {#each availableXUnits as unit}<option value={unit}>{formatUnit(unit)}</option>{/each}
      </select>
    </label>
    <label>Import ordinate quantity
      <select value={axisMetadata.yQuantity} on:change={(event) => updateAxes({ yQuantity: (event.target as HTMLSelectElement).value })}>
        {#each ORDINATE_QUANTITIES as quantity}<option value={quantity}>{quantity}</option>{/each}
      </select>
    </label>
    <label>Target ordinate unit
      <select value={axisMetadata.yUnit} on:change={(event) => updateAxes({ yUnit: (event.target as HTMLSelectElement).value })}>
        {#each ORDINATE_UNITS as unit}<option value={unit}>{unit || '(none)'}</option>{/each}
      </select>
    </label>
  </div>
  {#if !ramanAxesValid}
    <p class="warning">Raman-shift values cannot be converted to wavelength without excitation-laser metadata. Keep the Raman-shift quantity and cm⁻¹ units.</p>
  {:else if !sourceConversionValid}
    <p class="warning">The source abscissa unit cannot be converted to the selected target unit. Choose a physically compatible quantity and unit.</p>
  {/if}
</section>

<style>
  .import-metadata{margin:14px 0;padding:12px;border:1px solid #3f3f46;border-radius:8px;background:#1a1b1f}
  .import-metadata h3{margin:0 0 6px}
  .import-metadata p{color:#9da0a5;font-size:.78rem;line-height:1.5}
  .axis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  label{display:grid;gap:6px;color:#9da0a5;font-size:.84rem}
  select{width:100%;min-width:0;background:#1c1c20;color:#d4d4d4;border:1px solid #3f3f46;border-radius:6px;padding:8px}
  .warning{margin:10px 0 0;color:#ffb7c1;font-size:.78rem;line-height:1.4}
  @media(max-width:640px){.axis-grid{grid-template-columns:1fr}}
</style>
