<script lang="ts">
  import { DEFAULT_STYLE, type NormalizationMode } from '../../types/project'
  import {
    ABSCISSA_QUANTITIES,
    ABSCISSA_UNITS,
    BLANK_UNIT,
    ORDINATE_QUANTITIES,
    ORDINATE_UNITS,
    axisDefaultsFor,
    formatUnit,
  } from '../../services/spectrumPresets'
  import { COLOR_PALETTES, NORMALIZATION_MODES, describeOption } from './workbenchUtils'

  export let activeTab: 'axes' | 'appearance' | 'processing'
  export let datasetCount: number
  export let onApplyPalette: (paletteId: string) => void
  export let onApplyLineWidth: (width: number) => void
  export let onApplyNormalization: (mode: NormalizationMode) => void
  export let onApplySmoothing: (windowLength: number, polyorder: number) => void
  export let onApplyAxisMetadata: (metadata: { xQuantity: string; xUnit: string; yQuantity: string; yUnit: string }) => void

  let paletteId = COLOR_PALETTES[0].id
  let lineWidth = DEFAULT_STYLE.lineWidth
  let normalizationMode: NormalizationMode = 'minmax'
  let smoothingWindow = 15
  let smoothingPolyorder = 2
  let spectrumType: 'uv-vis' | 'ir' | 'raman' = 'uv-vis'
  let xQuantity = 'Wavelength'
  let xUnit = 'nm'
  let yQuantity = 'Absorbance'
  let yUnit = BLANK_UNIT

  function unitLabel(unit: string): string {
    return unit === BLANK_UNIT ? '(none)' : formatUnit(unit)
  }

  function applySpectrumTypeDefaults(nextType: 'uv-vis' | 'ir' | 'raman'): void {
    const defaults = axisDefaultsFor(nextType)
    spectrumType = nextType
    xQuantity = defaults.xQuantity
    xUnit = defaults.x
    yQuantity = defaults.yQuantity
    yUnit = defaults.y
  }

  $: activePalette = COLOR_PALETTES.find((palette) => palette.id === paletteId) ?? COLOR_PALETTES[0]
</script>

<section class="sample-settings">
  <header class="sample-settings-header">
    <h2>All samples</h2>
  </header>

  <p class="general-settings-hint">
    {datasetCount} sample{datasetCount === 1 ? '' : 's'} loaded. Changes here overwrite every spectrum at once.
  </p>

  {#if activeTab === 'axes'}
    <div class="settings-card">
      <label>
        Spectrum type preset
        <select
          value={spectrumType}
          on:change={(event) => {
            const raw = (event.target as HTMLSelectElement).value
            applySpectrumTypeDefaults(raw === 'ir' || raw === 'raman' ? raw : 'uv-vis')
          }}
        >
          <option value="uv-vis">UV-Vis</option>
          <option value="ir">IR</option>
          <option value="raman">Raman</option>
        </select>
      </label>
      <label>
        Abscissa physical quantity
        <select bind:value={xQuantity}>
          {#each ABSCISSA_QUANTITIES as quantity}
            <option value={quantity}>{quantity}</option>
          {/each}
        </select>
      </label>
      <label>
        Abscissa units
        <select bind:value={xUnit}>
          {#each ABSCISSA_UNITS as unit}
            <option value={unit}>{unitLabel(unit)}</option>
          {/each}
        </select>
      </label>
      <label>
        Ordinate physical quantity
        <select bind:value={yQuantity}>
          {#each ORDINATE_QUANTITIES as quantity}
            <option value={quantity}>{quantity}</option>
          {/each}
        </select>
      </label>
      <label>
        Ordinate units
        <select bind:value={yUnit}>
          {#each ORDINATE_UNITS as unit}
            <option value={unit}>{unitLabel(unit)}</option>
          {/each}
        </select>
      </label>
      <button
        type="button"
        class="run"
        disabled={datasetCount === 0}
        on:click={() => onApplyAxisMetadata({ xQuantity, xUnit, yQuantity, yUnit })}
      >
        Apply to all samples
      </button>
    </div>
  {/if}

  {#if activeTab === 'appearance'}
    <div class="settings-card">
      <label>
        Colour palette
        <select bind:value={paletteId}>
          {#each COLOR_PALETTES as palette (palette.id)}
            <option value={palette.id}>{palette.name}</option>
          {/each}
        </select>
      </label>
      <div class="palette-preview">
        {#each activePalette.colors as color}
          <span class="palette-swatch" style={`background:${color};`}></span>
        {/each}
      </div>
      <button type="button" class="run" disabled={datasetCount === 0} on:click={() => onApplyPalette(paletteId)}>
        Apply palette to all samples
      </button>

      <label>
        Line width
        <input type="range" min="1" max="6" step="0.5" bind:value={lineWidth} />
      </label>
      <span class="general-settings-value">{lineWidth}px</span>
      <button type="button" class="run" disabled={datasetCount === 0} on:click={() => onApplyLineWidth(lineWidth)}>
        Apply width to all samples
      </button>
    </div>
  {/if}

  {#if activeTab === 'processing'}
    <div class="settings-card">
      <label>
        Normalisation mode
        <select bind:value={normalizationMode}>
          {#each NORMALIZATION_MODES as mode (mode.id)}
            <option value={mode.id}>{mode.label} — {mode.description}</option>
          {/each}
        </select>
      </label>
      <p class="option-description">{describeOption(NORMALIZATION_MODES, normalizationMode)}</p>
      <button
        type="button"
        class="run"
        disabled={datasetCount === 0}
        on:click={() => onApplyNormalization(normalizationMode)}
      >
        Apply normalisation to all samples
      </button>

      <div class="pipeline-params">
        <label>
          <span>Smoothing window</span>
          <input type="number" min="3" step="2" bind:value={smoothingWindow} />
        </label>
        <label>
          <span>Smoothing poly order</span>
          <input type="number" min="1" bind:value={smoothingPolyorder} />
        </label>
      </div>
      <button
        type="button"
        class="run"
        disabled={datasetCount === 0}
        on:click={() => onApplySmoothing(smoothingWindow, smoothingPolyorder)}
      >
        Apply smoothing to all samples
      </button>
    </div>
  {/if}
</section>
