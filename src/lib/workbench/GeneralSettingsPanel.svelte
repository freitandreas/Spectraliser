<script lang="ts">
  import { QUANTITY_NOTATIONS, type QuantityNotation } from '../../services/quantityNotation'
  import {
    ABSCISSA_QUANTITIES,
    ABSCISSA_UNITS,
    AXIS_LABEL_FORMATS,
    BLANK_UNIT,
    ORDINATE_QUANTITIES,
    ORDINATE_UNITS,
    axisDefaultsFor,
    formatUnit,
    type AxisLabelFormat,
  } from '../../services/spectrumPresets'
  import type { ComputePrecision, PlotStylePreferences } from '../../services/startupPreferences'
  import { pipelineKey, type GeneralAxes, type GeneralSettingsSnapshot, type SettingKey } from '../../services/generalSettings'
  import type { GeneralChange } from '../../state/generalSettingsActions'
  import type { SpectrumType } from '../../types/project'
  import PlotModeSettings from '../PlotModeSettings.svelte'
  import ComputePrecisionSettings from '../ComputePrecisionSettings.svelte'
  import PipelineEditor from './PipelineEditor.svelte'
  import { projectStore } from '../../state/projectStore'
  import SettingBadge from './SettingBadge.svelte'
  import HelpTip from '../HelpTip.svelte'
  import { numericCustomFields } from '../../services/metadataFields'
  import type { BadgeInfo } from './settingBadge'
  import { COLOR_PALETTES, PALETTE_KIND_LABELS, paletteGradientCss, type PaletteKind } from '../../services/palettes'

  export let activeTab: 'axes' | 'appearance' | 'processing'
  export let snapshot: GeneralSettingsSnapshot
  export let datasetCount: number
  export let deviatingCount: number
  export let badgeFor: (key: SettingKey) => BadgeInfo | null
  export let onShowDifferences: () => void
  export let onChange: (change: GeneralChange) => void
  export let plotStyle: PlotStylePreferences
  export let onUpdatePlotStyle: (next: PlotStylePreferences) => void
  export let computePrecision: ComputePrecision
  export let onUpdateComputePrecision: (next: ComputePrecision) => void

  const UNITS_BY_QUANTITY: Record<string, string[]> = {
    Wavelength: ['nm', 'µm', 'm'],
    Wavenumber: ['cm⁻¹'],
    'Raman shift': ['cm⁻¹'],
    Frequency: ['Hz'],
    Energy: ['eV'],
    Time: ['s'],
  }

  $: axes = snapshot.axes
  $: availableXUnits = UNITS_BY_QUANTITY[axes.xQuantity] ?? [...ABSCISSA_UNITS]
  const PALETTE_GROUPS = (Object.keys(PALETTE_KIND_LABELS) as PaletteKind[]).map((kind) => ({
    label: PALETTE_KIND_LABELS[kind],
    palettes: COLOR_PALETTES.filter((palette) => palette.kind === kind),
  }))

  function unitLabel(unit: string): string {
    return unit === BLANK_UNIT ? '(none)' : formatUnit(unit)
  }

  function changeAxes(patch: Partial<GeneralAxes>): void {
    onChange({ kind: 'axes', axes: { ...axes, ...patch } })
  }

  function applyPreset(raw: string): void {
    if (raw !== 'uv-vis' && raw !== 'ir' && raw !== 'raman') return
    const defaults = axisDefaultsFor(raw as SpectrumType)
    changeAxes({ xQuantity: defaults.xQuantity, xUnit: defaults.x, yQuantity: defaults.yQuantity, yUnit: defaults.y })
  }

  function selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value
  }
  $: customFields = numericCustomFields($projectStore.datasets.map((dataset) => dataset.experimentMetadata))
</script>

<section class="sample-settings">
  <header class="sample-settings-header">
    <h2>All samples</h2>
    <HelpTip label="General settings" text="Samples follow these values unless they were given their own. Changes convert or reprocess every following sample." />
  </header>

  <p class="general-settings-hint">{datasetCount} sample{datasetCount === 1 ? '' : 's'} loaded.</p>
  {#if deviatingCount > 0}
    <button type="button" class="general-deviation-link" on:click={onShowDifferences}>
      {deviatingCount} sample{deviatingCount === 1 ? ' doesn’t' : 's don’t'} follow all general settings
    </button>
  {:else if datasetCount > 0}
    <p class="general-settings-hint">All samples follow the general settings.</p>
  {/if}

  {#if activeTab === 'axes'}
    <div class="settings-card">
      <span class="setting-label-row">
        <strong class="card-title">Axes</strong>
        <HelpTip label="Axis conversion" text="Changing quantities or units converts sample data numerically (wavelength ↔ wavenumber, absorbance ↔ transmittance, percent scaling); incompatible quantities are rejected." />
      </span>
      <label>
        Axis preset
        <select value="" on:change={(event) => { applyPreset(selectValue(event)); (event.target as HTMLSelectElement).value = '' }}>
          <option value="" disabled>Load spectrum-type defaults…</option>
          <option value="uv-vis">UV-Vis</option>
          <option value="ir">IR</option>
          <option value="raman">Raman</option>
        </select>
      </label>
      <label>
        <span class="setting-label-row">Abscissa physical quantity <SettingBadge info={badgeFor('xQuantity')} /></span>
        <select
          value={axes.xQuantity}
          on:change={(event) => {
            const xQuantity = selectValue(event)
            changeAxes({ xQuantity, xUnit: UNITS_BY_QUANTITY[xQuantity]?.[0] ?? axes.xUnit })
          }}
        >
          {#each ABSCISSA_QUANTITIES as quantity}
            <option value={quantity}>{quantity}</option>
          {/each}
        </select>
      </label>
      <label>
        <span class="setting-label-row">Abscissa units <SettingBadge info={badgeFor('xUnit')} /></span>
        <select value={axes.xUnit} on:change={(event) => changeAxes({ xUnit: selectValue(event) })}>
          {#each availableXUnits as unit}
            <option value={unit}>{unitLabel(unit)}</option>
          {/each}
        </select>
      </label>
      <label>
        <span class="setting-label-row">Ordinate physical quantity <SettingBadge info={badgeFor('yQuantity')} /></span>
        <select value={axes.yQuantity} on:change={(event) => changeAxes({ yQuantity: selectValue(event) })}>
          {#each ORDINATE_QUANTITIES as quantity}
            <option value={quantity}>{quantity}</option>
          {/each}
        </select>
      </label>
      <label>
        <span class="setting-label-row">Ordinate units <SettingBadge info={badgeFor('yUnit')} /></span>
        <select value={axes.yUnit} on:change={(event) => changeAxes({ yUnit: selectValue(event) })}>
          {#each ORDINATE_UNITS as unit}
            <option value={unit}>{unitLabel(unit)}</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}

  {#if activeTab === 'appearance'}
    <div class="settings-card">
      <strong class="card-title">Spectrum plot</strong>
      <PlotModeSettings {plotStyle} onChange={onUpdatePlotStyle} customFields={customFields} compact />
      <label>
        Axis label format
        <select
          value={plotStyle.axisLabelFormat}
          on:change={(event) => onUpdatePlotStyle({ ...plotStyle, axisLabelFormat: selectValue(event) as AxisLabelFormat })}
        >
          {#each AXIS_LABEL_FORMATS as format (format.id)}
            <option value={format.id}>{format.label}</option>
          {/each}
        </select>
      </label>
      <label>
        Quantity notation
        <select
          value={plotStyle.quantityNotation}
          on:change={(event) => onUpdatePlotStyle({ ...plotStyle, quantityNotation: selectValue(event) as QuantityNotation })}
        >
          {#each QUANTITY_NOTATIONS as notation (notation.id)}
            <option value={notation.id}>{notation.label}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="settings-card">
      <label>
        <span class="setting-label-row">Colour palette <SettingBadge info={badgeFor('lineColor')} /></span>
        <select value={snapshot.paletteId} on:change={(event) => onChange({ kind: 'palette', paletteId: selectValue(event) })}>
          {#each PALETTE_GROUPS as group (group.label)}
            <optgroup label={group.label}>
              {#each group.palettes as palette (palette.id)}
                <option value={palette.id}>{palette.name}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </label>
      <div class="palette-preview" style={`background:${paletteGradientCss(snapshot.paletteId)};`} title="Each sample gets its own colour, spread evenly along this gradient."></div>

      <label>
        <span class="setting-label-row">Line width <b>{snapshot.lineWidth}px</b> <SettingBadge info={badgeFor('lineWidth')} /></span>
        <input
          type="range"
          min="1"
          max="6"
          step="0.5"
          value={snapshot.lineWidth}
          on:change={(event) => onChange({ kind: 'lineWidth', lineWidth: Number((event.target as HTMLInputElement).value) })}
        />
      </label>
      <label class="toggle-field">
        <input
          type="checkbox"
          checked={snapshot.abscissaInverted}
          on:change={(event) => onChange({ kind: 'inversion', axis: 'abscissa', inverted: (event.target as HTMLInputElement).checked })}
        />
        <span>Invert abscissa axis</span>
        <SettingBadge info={badgeFor('abscissaInverted')} />
      </label>
      <label class="toggle-field">
        <input
          type="checkbox"
          checked={snapshot.ordinateInverted}
          on:change={(event) => onChange({ kind: 'inversion', axis: 'ordinate', inverted: (event.target as HTMLInputElement).checked })}
        />
        <span>Invert ordinate axis</span>
        <SettingBadge info={badgeFor('ordinateInverted')} />
      </label>
    </div>
  {/if}

  {#if activeTab === 'processing'}
    <div class="settings-card">
      <PipelineEditor
        pipeline={snapshot.pipeline}
        onEnabled={(transformId, enabled) => {
          const step = snapshot.pipeline.find((item) => item.id === transformId)
          if (step) onChange({ kind: 'step', type: step.type, enabled })
        }}
        onParams={(transformId, params) => {
          const step = snapshot.pipeline.find((item) => item.id === transformId)
          if (step) onChange({ kind: 'step', type: step.type, params })
        }}
        badgeFor={(type) => badgeFor(pipelineKey(type))}
        onAutoSmoothing={async () => {
          const advice = await projectStore.adviseSmoothing('all')
          if (advice.params) onChange({ kind: 'step', type: 'smoothing', params: advice.params })
          else if (advice.disable) onChange({ kind: 'step', type: 'smoothing', enabled: false })
          return advice.message
        }}
      />
    </div>
    <div class="settings-card">
      <ComputePrecisionSettings precision={computePrecision} onChange={onUpdateComputePrecision} />
    </div>
  {/if}
</section>
