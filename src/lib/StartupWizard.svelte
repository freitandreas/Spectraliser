<script lang="ts">
  import { QUANTITY_NOTATIONS, quantityPlain } from '../services/quantityNotation'
  import { createEventDispatcher } from 'svelte'
  import type { SpectrumType } from '../types/project'
  import {
    ABSCISSA_QUANTITIES,
    ABSCISSA_UNITS,
    AXIS_LABEL_FORMATS,
    BLANK_UNIT,
    ORDINATE_QUANTITIES,
    ORDINATE_UNITS,
    axisLabel,
    formatUnit,
  } from '../services/spectrumPresets'
  import {
    DEFAULT_STARTUP_PREFERENCES,
    UNITS_BY_QUANTITY,
    axisDefaultsForPreference,
    normalizeStartupPreferences,
    preferencesForTemplate,
    type PlotSeriesMode,
    type PlotStyleTemplate,
    type StartupPreferences,
  } from '../services/startupPreferences'
  import PlotModeSettings from './PlotModeSettings.svelte'
  import StartupPlotPreview from './StartupPlotPreview.svelte'
  import ComputePrecisionSettings from './ComputePrecisionSettings.svelte'
  import HelpTip from './HelpTip.svelte'

  export let open = false
  export let suspended = false
  export let initialPreferences: StartupPreferences = DEFAULT_STARTUP_PREFERENCES

  const dispatch = createEventDispatcher<{ complete: StartupPreferences; tour: void }>()
  let draft: StartupPreferences = structuredClone(DEFAULT_STARTUP_PREFERENCES)
  let step: 'defaults' | 'advanced' = 'defaults'
  let advancedView: 'appearance' | 'computation' = 'appearance'
  const advancedViews = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'computation', label: 'Computation' },
  ] as const
  let initialized = false

  $: if (open && !initialized) {
    draft = normalizeStartupPreferences(initialPreferences)
    step = 'defaults'
    advancedView = 'appearance'
    initialized = true
  }
  $: if (!open) initialized = false

  const spectrumTypes: Array<{ id: SpectrumType; title: string; detail: string }> = [
    { id: 'uv-vis', title: 'UV-Vis', detail: 'Absorption' },
    { id: 'ir', title: 'IR', detail: 'Wavenumber' },
    { id: 'raman', title: 'Raman', detail: 'Raman shift' },
  ]
  const templates: Array<{ id: PlotStyleTemplate; title: string; detail: string }> = [
    { id: 'grid', title: 'Grid', detail: 'For reading values and comparing bands.' },
    { id: 'minimal', title: 'Minimal', detail: 'Clean axes with no grid.' },
    { id: 'framed', title: 'Framed', detail: 'Grid with a defined plot border.' },
  ]
  const seriesModes: Array<{ id: PlotSeriesMode; label: string }> = [
    { id: 'lines', label: 'Lines' },
    { id: 'lines+markers', label: 'Lines and markers' },
    { id: 'markers', label: 'Markers' },
  ]

  $: availableXUnits = UNITS_BY_QUANTITY[draft.axes.xQuantity] ?? [...ABSCISSA_UNITS]

  function chooseSpectrumType(type: SpectrumType): void {
    draft = { ...draft, spectrumType: type, axes: axisDefaultsForPreference(type) }
  }

  function changeXQuantity(quantity: string): void {
    draft.axes = { ...draft.axes, xQuantity: quantity, xUnit: UNITS_BY_QUANTITY[quantity]?.[0] ?? '' }
  }

  function chooseTemplate(template: PlotStyleTemplate): void {
    const base = preferencesForTemplate(template)
    draft.plotStyle = {
      ...draft.plotStyle,
      template,
      showGrid: base.showGrid,
      showBorder: base.showBorder,
      lineWidth: base.lineWidth,
    }
  }

  function complete(): void {
    dispatch('complete', normalizeStartupPreferences(draft))
  }
</script>

{#if open && !suspended}
  <div class="startup-backdrop" role="presentation">
    <div class="startup-dialog" role="dialog" aria-modal="true" aria-labelledby="startup-title">
      <header class="startup-header">
        <div>
          <p class="startup-eyebrow">SPECTRALISER SETUP</p>
          <h1 id="startup-title">{step === 'defaults' ? 'Set your data defaults' : 'Advanced settings'}</h1>
        </div>
        <span class="startup-step">{step === 'defaults' ? 'Defaults' : 'Optional'}</span>
      </header>

      <div class="startup-body">
        <div class="startup-content">
          {#if step === 'defaults'}
            <section class="startup-section">
              <h2>Spectrum type <HelpTip label="Spectrum type" text="One spectrum type per project. The import wizard starts with this type." /></h2>
              <div class="startup-type-options" role="group" aria-label="Default spectrum type">
                {#each spectrumTypes as type (type.id)}
                  <button type="button" class:chosen={draft.spectrumType === type.id} aria-pressed={draft.spectrumType === type.id} on:click={() => chooseSpectrumType(type.id)}>
                    <strong>{type.title}</strong><span>{type.detail}</span>
                  </button>
                {/each}
              </div>
            </section>

            <section class="startup-section">
              <h2>Spectrum plot <HelpTip label="Spectrum plot" text="How several series, e.g. a time-resolved measurement, are displayed." /></h2>
              <PlotModeSettings plotStyle={draft.plotStyle} onChange={(next) => { draft.plotStyle = next }} />
            </section>

            <section class="startup-section">
              <h2>Plot quantities and units <HelpTip label="Plot quantities and units" text="Imported data in compatible units are converted numerically into these units." /></h2>
              <div class="axis-grid">
                <label>
                  Abscissa quantity
                  <select value={draft.axes.xQuantity} on:change={(event) => changeXQuantity((event.target as HTMLSelectElement).value)}>
                    {#each ABSCISSA_QUANTITIES as quantity}<option value={quantity}>{quantity}</option>{/each}
                  </select>
                </label>
                <label>
                  Abscissa unit
                  <select bind:value={draft.axes.xUnit}>
                    {#each availableXUnits as unit}<option value={unit}>{formatUnit(unit)}</option>{/each}
                  </select>
                </label>
                <label>
                  Ordinate quantity
                  <select bind:value={draft.axes.yQuantity}>
                    {#each ORDINATE_QUANTITIES as quantity}<option value={quantity}>{quantity}</option>{/each}
                  </select>
                </label>
                <label>
                  Ordinate unit
                  <select bind:value={draft.axes.yUnit}>
                    {#each ORDINATE_UNITS as unit}<option value={unit}>{unit === BLANK_UNIT ? '(none)' : formatUnit(unit)}</option>{/each}
                  </select>
                </label>
              </div>
            </section>
          {:else}
            <div class="advanced-tabs" role="tablist" aria-label="Advanced settings">
              {#each advancedViews as view (view.id)}
                <button
                  type="button"
                  role="tab"
                  aria-selected={advancedView === view.id}
                  class:chosen={advancedView === view.id}
                  on:click={() => { advancedView = view.id }}
                >{view.label}</button>
              {/each}
            </div>
          {/if}
          {#if step === 'advanced' && advancedView === 'computation'}
            <section class="startup-section">
              <h2>Computation <HelpTip label="Computation" text="Precision of the numeric arrays the Python processing script works on." /></h2>
              <ComputePrecisionSettings precision={draft.computePrecision} onChange={(next) => { draft.computePrecision = next }} />
            </section>
          {:else if step === 'advanced'}
            <section class="startup-section">
              <h2>Plot appearance <HelpTip label="Plot appearance" text="These match the plot settings used in the workspace." /></h2>
              <div class="startup-template-list" role="group" aria-label="Plot style templates">
                {#each templates as template (template.id)}
                  <button type="button" class:chosen={draft.plotStyle.template === template.id} aria-pressed={draft.plotStyle.template === template.id} title={template.detail} on:click={() => chooseTemplate(template.id)}>
                    <span class={`template-glyph ${template.id}`} aria-hidden="true"><span></span><span></span><span></span></span>
                    <span class="template-copy"><strong>{template.title}</strong></span>
                  </button>
                {/each}
              </div>
              <div class="startup-controls">
                <label class="startup-toggle"><input type="checkbox" bind:checked={draft.plotStyle.showGrid} /><span>Grid lines</span></label>
                <label class="startup-toggle"><input type="checkbox" bind:checked={draft.plotStyle.showBorder} /><span>Plot border</span></label>
                <label class="startup-width"><span>Trace width <b>{draft.plotStyle.lineWidth}px</b></span><input type="range" min="1" max="6" step="0.5" bind:value={draft.plotStyle.lineWidth} /></label>
                <label>Series display
                  <select bind:value={draft.plotStyle.seriesMode}>
                    {#each seriesModes as mode}<option value={mode.id}>{mode.label}</option>{/each}
                  </select>
                </label>
              </div>
            </section>

            <section class="startup-section">
              <h2>Axis labels <HelpTip label="Axis labels" text="How the physical quantity and unit are combined in axis titles. Fractions are typeset with MathJax; 3D scene titles cannot render TeX and use “quantity / unit”." /></h2>
              <div class="label-formats" role="radiogroup" aria-label="Axis label format">
                {#each AXIS_LABEL_FORMATS as format (format.id)}
                  <label class="label-format" class:chosen={draft.plotStyle.axisLabelFormat === format.id}>
                    <input type="radio" name="axis-label-format" value={format.id} bind:group={draft.plotStyle.axisLabelFormat} />
                    <strong>{format.label}</strong>
                    <code>{format.id === 'fraction' ? `\\frac{${quantityPlain(draft.axes.xQuantity, draft.plotStyle.quantityNotation)}}{${formatUnit(draft.axes.xUnit)}}` : axisLabel(draft.axes.xQuantity, draft.axes.xUnit, format.id, draft.plotStyle.quantityNotation)}</code>
                  </label>
                {/each}
              </div>
            </section>

            <section class="startup-section">
              <h2>Quantity notation <HelpTip label="Quantity notation" text="Show physical quantities by full name or by IUPAC symbol in plots, previews and data tables." /></h2>
              <div class="label-formats" role="radiogroup" aria-label="Quantity notation">
                {#each QUANTITY_NOTATIONS as notation (notation.id)}
                  <label class="label-format" class:chosen={draft.plotStyle.quantityNotation === notation.id}>
                    <input type="radio" name="quantity-notation" value={notation.id} bind:group={draft.plotStyle.quantityNotation} />
                    <strong>{notation.label}</strong>
                    <code>{axisLabel(draft.axes.yQuantity, draft.axes.yUnit, 'slash', notation.id)}</code>
                  </label>
                {/each}
              </div>
            </section>
          {/if}
        </div>

        <aside class="startup-preview-column">
          <StartupPlotPreview preferences={draft} />
        </aside>
      </div>

      <footer class="startup-footer">
        {#if step === 'defaults'}
          <span>Everything can be changed later in General Settings.</span>
          <div class="footer-actions">
            <button type="button" class="ghost" on:click={() => dispatch('tour')}>Take a tour</button>
            <button type="button" class="ghost" on:click={() => { step = 'advanced' }}>Advanced settings</button>
            <button type="button" class="run" on:click={complete}>Continue to workspace</button>
          </div>
        {:else}
          <button type="button" class="ghost" on:click={() => { step = 'defaults' }}>Back</button>
          <button type="button" class="run" on:click={complete}>Continue to workspace</button>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .startup-backdrop{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:24px;background:rgba(10,12,15,.82);backdrop-filter:blur(8px)}
  .startup-dialog{display:flex;flex-direction:column;width:min(1120px,100%);max-height:min(920px,calc(100vh - 48px));overflow:hidden;border:1px solid #454a50;border-radius:10px;background:#202328;color:#e3e5e7;box-shadow:0 28px 90px rgba(0,0,0,.5);animation:startup-enter 260ms ease-out both}
  .startup-header,.startup-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px}
  .startup-header{border-bottom:1px solid #373b41}
  .startup-eyebrow{margin:0 0 7px;color:#92b6c8;font-size:.68rem;font-weight:700;letter-spacing:.14em}
  .startup-header h1{margin:0;font-size:1.45rem;font-weight:600}
  .startup-step{align-self:flex-start;color:#919aa3;font: .72rem var(--font-mono)}
  .startup-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.9fr);min-height:0;overflow:auto}
  .startup-content{padding:2px 24px;min-width:0}
  .startup-preview-column{position:sticky;top:0;align-self:start;padding:20px 24px 20px 0}
  .startup-section{padding:18px 0;border-bottom:1px solid #373b41}
  .startup-section:last-child{border-bottom:0}
  .startup-section h2{display:flex;align-items:center;gap:6px;margin:0 0 12px;font-size:.98rem}
  .startup-type-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .startup-type-options button,.startup-template-list button{display:flex;min-width:0;align-items:flex-start;gap:7px;border:1px solid #3b4148;border-radius:7px;background:#252a30;color:#d9dde0;text-align:left;cursor:pointer}
  .startup-type-options button{flex-direction:column;min-height:58px;padding:10px}
  .startup-type-options strong,.template-copy strong{font-size:.78rem}
  .startup-type-options span{color:#9ca4ab;font-size:.68rem;line-height:1.35}
  .startup-type-options button.chosen,.startup-template-list button.chosen,.label-format.chosen{border-color:#7ca6b5;background:#2b353a;box-shadow:inset 0 0 0 1px rgba(124,166,181,.16)}
  .axis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  label{display:grid;gap:6px;color:#c2c7cb;font-size:.75rem}
  input,select{min-width:0;background:#1c1c20;color:#d4d4d4;border:1px solid #3f3f46;border-radius:6px;padding:8px}
  input[type=checkbox],input[type=radio]{accent-color:#86aebc}
  code{color:#c5d9e2;font-size:.7rem}
  .startup-template-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
  .startup-template-list button{align-items:center;padding:8px}
  .template-copy{display:grid;gap:3px}
  .template-glyph{position:relative;display:block;flex:0 0 40px;width:40px;height:30px;overflow:hidden;border:1px solid #41464d;background:#191c20}
  .template-glyph span{position:absolute;left:5px;right:5px;height:1px;background:#454a50}
  .template-glyph span:nth-child(1){top:8px}.template-glyph span:nth-child(2){top:15px}.template-glyph span:nth-child(3){top:22px}
  .template-glyph.minimal span{display:none}.template-glyph.framed{outline:1px solid #78828a;outline-offset:-4px}
  .startup-controls{display:grid;grid-template-columns:auto auto minmax(120px,1fr) minmax(150px,1fr);align-items:end;gap:14px;margin-top:16px}
  .startup-toggle{display:flex;align-items:center;gap:7px;color:#c2c7cb;font-size:.75rem}
  .startup-width{display:grid;gap:5px;color:#c2c7cb;font-size:.72rem}
  .startup-width span{display:flex;justify-content:space-between}.startup-width input{width:100%;padding:0}
  .startup-width b{font-variant-numeric:tabular-nums}
  .label-formats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:8px}
  .label-format{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:4px 8px;padding:9px 10px;border:1px solid #3b4148;border-radius:7px;background:#252a30;cursor:pointer}
  .label-format code{grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .startup-footer{border-top:1px solid #373b41;color:#9ca4ab;font-size:.73rem}
  .startup-footer button{width:auto}
  .footer-actions{display:flex;gap:8px}
  .advanced-tabs{display:flex;gap:6px;padding-top:16px}
  .advanced-tabs button{width:auto;padding:6px 12px;border:1px solid #3b4148;border-radius:6px;background:#252a30;color:#c2c7cb;cursor:pointer;font-size:.75rem}
  .advanced-tabs button.chosen{border-color:#7ca6b5;background:#2b353a;color:#e3e5e7}
  @keyframes startup-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @media(max-width:900px){.startup-body{grid-template-columns:1fr}.startup-preview-column{position:static;padding:0 24px 20px}}
  @media(max-width:640px){.startup-backdrop{padding:10px}.startup-header,.startup-footer{padding:16px}.startup-content{padding:2px 16px}.startup-type-options,.startup-template-list,.label-formats{grid-template-columns:1fr}.startup-controls{grid-template-columns:1fr 1fr}.startup-footer{align-items:flex-start;flex-direction:column}.axis-grid{grid-template-columns:1fr}}
</style>
