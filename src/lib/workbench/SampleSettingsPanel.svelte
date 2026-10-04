<script lang="ts">
  import { tick } from 'svelte'
  import {
    ABSCISSA_QUANTITIES,
    ABSCISSA_UNITS,
    BLANK_UNIT,
    ORDINATE_QUANTITIES,
    ORDINATE_UNITS,
    formatUnit,
  } from '../../services/spectrumPresets'
  import PipelineEditor from './PipelineEditor.svelte'
  import SettingBadge from './SettingBadge.svelte'
  import type { BadgeInfo } from './settingBadge'
  import { pipelineKey, type SettingKey } from '../../services/generalSettings'
  import SeriesCoordinateEditor from './SeriesCoordinateEditor.svelte'

  export let dataset: any
  export let activeTab: 'general' | 'style' | 'pipeline'
  export let onRename: (datasetId: string, label: string) => void
  export let onUpdateStyle: (datasetId: string, patch: Record<string, unknown>) => void
  export let onUpdateMetadata: (datasetId: string, patch: Record<string, unknown>) => void
  export let onRerunPipeline: (datasetId: string) => void
  export let onTransformEnabled: (datasetId: string, transformId: string, enabled: boolean) => void
  export let onTransformParam: (datasetId: string, transformId: string, params: Record<string, number | string | boolean>) => void
  /** Marks a setting whose value differs from the general settings. */
  export let badgeFor: (key: SettingKey) => BadgeInfo | null = () => null

  const commonAbscissaUnits = [...ABSCISSA_UNITS, 'Custom']
  const commonOrdinateUnits = [...ORDINATE_UNITS, 'Custom']
  const abscissaQuantities = [...ABSCISSA_QUANTITIES, 'Custom']
  const ordinateQuantities = [...ORDINATE_QUANTITIES, 'Custom']

  let editingTitle = false
  let titleDraft = ''
  let titleInputEl: HTMLInputElement | null = null
  let xUnitPreset = 'Custom'
  let yUnitPreset = 'Custom'
  let xUnitCustomValue = ''
  let yUnitCustomValue = ''
  let xQuantityPreset = 'Custom'
  let yQuantityPreset = 'Custom'
  let xQuantityCustomValue = ''
  let yQuantityCustomValue = ''

  function unitLabel(unit: string): string {
    return unit === BLANK_UNIT ? '(none)' : formatUnit(unit)
  }

  $: if (dataset && !editingTitle) {
    titleDraft = dataset.style.label
  }

  $: if (dataset) {
    xUnitPreset = commonAbscissaUnits.includes(dataset.units.x) ? dataset.units.x : 'Custom'
    yUnitPreset = commonOrdinateUnits.includes(dataset.units.y) ? dataset.units.y : 'Custom'
    xUnitCustomValue = xUnitPreset === 'Custom' ? dataset.units.x : ''
    yUnitCustomValue = yUnitPreset === 'Custom' ? dataset.units.y : ''
    xQuantityPreset = abscissaQuantities.includes(dataset.units.xQuantity) ? dataset.units.xQuantity : 'Custom'
    yQuantityPreset = ordinateQuantities.includes(dataset.units.yQuantity) ? dataset.units.yQuantity : 'Custom'
    xQuantityCustomValue = xQuantityPreset === 'Custom' ? dataset.units.xQuantity : ''
    yQuantityCustomValue = yQuantityPreset === 'Custom' ? dataset.units.yQuantity : ''
  }

  async function startTitleEdit(): Promise<void> {
    editingTitle = true
    titleDraft = dataset.style.label
    await tick()
    titleInputEl?.focus()
    titleInputEl?.select()
  }

  function commitTitleEdit(): void {
    const trimmed = titleDraft.trim()
    if (trimmed.length > 0 && trimmed !== dataset.style.label) {
      onRename(dataset.id, trimmed)
    }
    editingTitle = false
  }

  function cancelTitleEdit(): void {
    editingTitle = false
    titleDraft = dataset.style.label
  }

  function handleTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitTitleEdit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelTitleEdit()
    }
  }
</script>

<section class="sample-settings">
  <header class="sample-settings-header">
    {#if editingTitle}
      <input
        bind:this={titleInputEl}
        class="sample-title-input"
        type="text"
        bind:value={titleDraft}
        on:blur={commitTitleEdit}
        on:keydown={handleTitleKeydown}
      />
    {:else}
      <h2 on:dblclick={startTitleEdit}>{dataset.style.label}</h2>
    {/if}
  </header>

  {#if activeTab === 'general'}
    <div class="settings-card">
      <label>
        File path
        <input
          type="text"
          value={dataset.sourcePath}
          on:input={(event) => onUpdateMetadata(dataset.id, { sourcePath: (event.target as HTMLInputElement).value })}
        />
      </label>
      <label>
        Spectrum type
        <select
          value={dataset.spectrumType}
          on:change={(event) => {
            const raw = (event.target as HTMLSelectElement).value
            const spectrumType = raw === 'ir' || raw === 'raman' ? raw : 'uv-vis'
            onUpdateMetadata(dataset.id, { spectrumType })
          }}
        >
          <option value="uv-vis">UV-Vis</option>
          <option value="ir">IR</option>
          <option value="raman">Raman</option>
        </select>
      </label>
      <label>
        <span class="setting-label-row">Abscissa physical quantity <SettingBadge info={badgeFor('xQuantity')} /></span>
        <select
          value={xQuantityPreset}
          on:change={(event) => {
            const next = (event.target as HTMLSelectElement).value
            onUpdateMetadata(dataset.id, {
              units: { xQuantity: next === 'Custom' ? (xQuantityCustomValue || 'Abscissa') : next },
            })
          }}
        >
          {#each abscissaQuantities as quantity}
            <option value={quantity}>{quantity}</option>
          {/each}
        </select>
        {#if xQuantityPreset === 'Custom'}
          <input
            type="text"
            value={xQuantityCustomValue}
            on:change={(event) => {
              const nextValue = (event.target as HTMLInputElement).value
              xQuantityCustomValue = nextValue
              onUpdateMetadata(dataset.id, { units: { xQuantity: nextValue || 'Abscissa' } })
            }}
          />
        {/if}
      </label>
      <label>
        <span class="setting-label-row">Abscissa units <SettingBadge info={badgeFor('xUnit')} /></span>
        <select
          value={xUnitPreset}
          on:change={(event) => {
            const next = (event.target as HTMLSelectElement).value
            if (next === 'Custom') {
              onUpdateMetadata(dataset.id, { units: { x: xUnitCustomValue || 'custom' } })
              return
            }
            onUpdateMetadata(dataset.id, { units: { x: next } })
          }}
        >
          {#each commonAbscissaUnits as unit}
            <option value={unit}>{unitLabel(unit)}</option>
          {/each}
        </select>
        {#if xUnitPreset === 'Custom'}
          <input
            type="text"
            value={xUnitCustomValue}
            on:input={(event) => {
              const nextValue = (event.target as HTMLInputElement).value
              xUnitCustomValue = nextValue
              onUpdateMetadata(dataset.id, { units: { x: nextValue || 'custom' } })
            }}
          />
        {/if}
      </label>
      <label>
        <span class="setting-label-row">Ordinate physical quantity <SettingBadge info={badgeFor('yQuantity')} /></span>
        <select
          value={yQuantityPreset}
          on:change={(event) => {
            const next = (event.target as HTMLSelectElement).value
            onUpdateMetadata(dataset.id, {
              units: { yQuantity: next === 'Custom' ? (yQuantityCustomValue || 'Ordinate') : next },
            })
          }}
        >
          {#each ordinateQuantities as quantity}
            <option value={quantity}>{quantity}</option>
          {/each}
        </select>
        {#if yQuantityPreset === 'Custom'}
          <input
            type="text"
            value={yQuantityCustomValue}
            on:change={(event) => {
              const nextValue = (event.target as HTMLInputElement).value
              yQuantityCustomValue = nextValue
              onUpdateMetadata(dataset.id, { units: { yQuantity: nextValue || 'Ordinate' } })
            }}
          />
        {/if}
      </label>
      <label>
        <span class="setting-label-row">Ordinate units <SettingBadge info={badgeFor('yUnit')} /></span>
        <select
          value={yUnitPreset}
          on:change={(event) => {
            const next = (event.target as HTMLSelectElement).value
            if (next === 'Custom') {
              onUpdateMetadata(dataset.id, { units: { y: yUnitCustomValue || 'custom' } })
              return
            }
            onUpdateMetadata(dataset.id, { units: { y: next } })
          }}
        >
          {#each commonOrdinateUnits as unit}
            <option value={unit}>{unitLabel(unit)}</option>
          {/each}
        </select>
        {#if yUnitPreset === 'Custom'}
          <input
            type="text"
            value={yUnitCustomValue}
            on:input={(event) => {
              const nextValue = (event.target as HTMLInputElement).value
              yUnitCustomValue = nextValue
              onUpdateMetadata(dataset.id, { units: { y: nextValue || 'custom' } })
            }}
          />
        {/if}
      </label>
      <SeriesCoordinateEditor
        label={dataset.style.label}
        coordinate={dataset.seriesCoordinate}
        onChange={(seriesCoordinate) => onUpdateMetadata(dataset.id, { seriesCoordinate })}
      />
    </div>
  {/if}

  {#if activeTab === 'style'}
    <div class="settings-card">
      <label>
        <span class="setting-label-row">Line colour <SettingBadge info={badgeFor('lineColor')} /></span>
        <input
          type="color"
          value={dataset.style.lineColor}
          on:input={(event) => onUpdateStyle(dataset.id, { lineColor: (event.target as HTMLInputElement).value })}
        />
      </label>
      <label>
        <span class="setting-label-row">Line width <SettingBadge info={badgeFor('lineWidth')} /></span>
        <input
          type="range"
          min="1"
          max="6"
          step="0.5"
          value={dataset.style.lineWidth}
          on:input={(event) => onUpdateStyle(dataset.id, { lineWidth: Number((event.target as HTMLInputElement).value) })}
        />
      </label>
      <label class="toggle-field">
        <input
          type="checkbox"
          checked={dataset.style.abscissaInverted ?? false}
          on:change={(event) => onUpdateStyle(dataset.id, { abscissaInverted: (event.target as HTMLInputElement).checked })}
        />
        <span>Invert abscissa axis</span>
        <SettingBadge info={badgeFor('abscissaInverted')} />
      </label>
      <label class="toggle-field">
        <input
          type="checkbox"
          checked={dataset.style.ordinateInverted ?? false}
          on:change={(event) => onUpdateStyle(dataset.id, { ordinateInverted: (event.target as HTMLInputElement).checked })}
        />
        <span>Invert ordinate axis</span>
        <SettingBadge info={badgeFor('ordinateInverted')} />
      </label>
      <button type="button" class="run" on:click={() => onRerunPipeline(dataset.id)}>
        Recalculate this sample
      </button>
    </div>
  {/if}

  {#if activeTab === 'pipeline'}
    <div class="settings-card">
      <PipelineEditor
        pipeline={dataset.pipeline}
        onEnabled={(transformId, enabled) => onTransformEnabled(dataset.id, transformId, enabled)}
        onParams={(transformId, params) => onTransformParam(dataset.id, transformId, params)}
        badgeFor={(type) => badgeFor(pipelineKey(type))}
      />
    </div>
  {/if}
</section>
