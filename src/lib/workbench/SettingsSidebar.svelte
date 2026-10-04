<script lang="ts">
  import type { MetadataPatch, StylePatch } from '../../state/datasetActions'
  import type { ComputePrecision, PlotStylePreferences } from '../../services/startupPreferences'
  import type { SpectrumDataset } from '../../types/project'
  import {
    deriveGeneralSettings,
    generalSettingText,
    sampleDifferences,
    settingLabel,
    type ProjectGeneralSettings,
    type SettingKey,
  } from '../../services/generalSettings'
  import {
    generalSettingsError,
    pendingGeneralChange,
    generalSnapshot,
    requestGeneralChange,
    resetSampleSetting,
    type GeneralChange,
    type GeneralSettingsContext,
  } from '../../state/generalSettingsActions'
  import type { BadgeInfo } from './settingBadge'
  import SampleSettingsPanel from './SampleSettingsPanel.svelte'
  import GeneralSettingsPanel from './GeneralSettingsPanel.svelte'
  import DifferencesModal from './DifferencesModal.svelte'

  export let open: boolean
  export let dataset: SpectrumDataset | null
  export let datasets: SpectrumDataset[]
  export let generalSettings: ProjectGeneralSettings | undefined
  export let generalContext: GeneralSettingsContext
  export let onClose: () => void
  export let onRename: (datasetId: string, label: string) => void
  export let onUpdateStyle: (datasetId: string, patch: StylePatch) => void
  export let onUpdateMetadata: (datasetId: string, patch: MetadataPatch) => void
  export let onRerunPipeline: (datasetId: string) => void
  export let onTransformEnabled: (datasetId: string, transformId: string, enabled: boolean) => void
  export let onTransformParam: (datasetId: string, transformId: string, params: Record<string, number | string | boolean>) => void
  export let plotStyle: PlotStylePreferences
  export let onUpdatePlotStyle: (next: PlotStylePreferences) => void
  export let computePrecision: ComputePrecision
  export let onUpdateComputePrecision: (next: ComputePrecision) => void

  const SAMPLE_TABS = [
    { id: 'general', label: 'General' },
    { id: 'style', label: 'Style' },
    { id: 'pipeline', label: 'Pipeline' },
  ] as const

  const GENERAL_TABS = [
    { id: 'axes', label: 'Axes' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'processing', label: 'Processing' },
  ] as const

  let sampleTab: (typeof SAMPLE_TABS)[number]['id'] = 'general'
  let generalTab: (typeof GENERAL_TABS)[number]['id'] = 'axes'
  let view: 'sample' | 'general' = 'sample'
  let shownDatasetId: string | null = null
  let differencesOpen = false
  let differencesFocus: SettingKey[] = []

  // A newly selected sample always opens on its own settings.
  $: syncSelectedSample(dataset?.id ?? null)
  function syncSelectedSample(id: string | null): void {
    if (id === shownDatasetId) return
    shownDatasetId = id
    view = 'sample'
  }

  $: showSample = dataset !== null && view === 'sample'
  $: snapshot = generalSnapshot(generalSettings ?? deriveGeneralSettings(datasets, null), generalContext.axes)
  $: differences = datasets.map((item, index) => sampleDifferences(item, { index, count: datasets.length }, snapshot))
  $: deviatingCount = differences.filter((keys) => keys.length > 0).length
  $: datasetIndex = dataset ? datasets.findIndex((item) => item.id === dataset.id) : -1
  $: sampleKeys = datasetIndex >= 0 ? differences[datasetIndex] ?? [] : []

  $: sampleBadgeFor = (key: SettingKey): BadgeInfo | null => {
    if (!dataset || !sampleKeys.includes(key)) return null
    const id = dataset.id
    return {
      label: 'Differs',
      title: `Differs from the general setting (${generalSettingText(snapshot, { index: datasetIndex, count: datasets.length }, key)}). Reset to follow it.`,
      action: () => resetSampleSetting(id, key, generalContext),
      actionLabel: undefined,
    }
  }

  $: generalBadgeFor = (key: SettingKey): BadgeInfo | null => {
    const count = differences.filter((keys) => keys.includes(key)).length
    if (count === 0) return null
    return {
      label: `${count} differ${count === 1 ? 's' : ''}`,
      title: `${count} sample${count === 1 ? ' does' : 's do'} not follow “${settingLabel(key)}”.`,
      action: () => showDifferences([key]),
      actionLabel: 'Show',
    }
  }

  function showDifferences(focus: SettingKey[]): void {
    differencesFocus = focus
    differencesOpen = true
  }

  // Re-render the general controls after a confirmation closes so cancelled edits revert.
  let controlsRevision = 0
  $: if ($pendingGeneralChange === null) controlsRevision += 1

  function changeGeneral(change: GeneralChange): void {
    requestGeneralChange(change, generalContext)
  }
</script>

<aside class="right-sidebar" class:hidden={!open}>
  <div class="panel-header">
    {#if dataset}
      <div class="settings-scope-toggle" role="tablist" aria-label="Settings scope">
        <button type="button" role="tab" class:current={view === 'sample'} aria-selected={view === 'sample'} on:click={() => { view = 'sample' }}>
          Sample
        </button>
        <button type="button" role="tab" class:current={view === 'general'} aria-selected={view === 'general'} on:click={() => { view = 'general' }}>
          General
        </button>
      </div>
    {:else}
      <h2>General Settings</h2>
    {/if}
    <button type="button" class="panel-close" aria-label="Close settings panel" on:click={onClose}>
      x
    </button>
  </div>

  <nav class="settings-tabs" aria-label="Settings sections">
    {#if showSample}
      {#each SAMPLE_TABS as tab (tab.id)}
        <button
          type="button"
          class="settings-tab"
          class:current={sampleTab === tab.id}
          aria-current={sampleTab === tab.id ? 'page' : undefined}
          on:click={() => { sampleTab = tab.id }}
        >
          {tab.label}
        </button>
      {/each}
    {:else}
      {#each GENERAL_TABS as tab (tab.id)}
        <button
          type="button"
          class="settings-tab"
          class:current={generalTab === tab.id}
          aria-current={generalTab === tab.id ? 'page' : undefined}
          on:click={() => { generalTab = tab.id }}
        >
          {tab.label}
        </button>
      {/each}
    {/if}
  </nav>

  <div class="settings-scroll">
    {#if $generalSettingsError}
      <div class="settings-error" role="alert">
        <span>{$generalSettingsError}</span>
        <button type="button" class="panel-close" aria-label="Dismiss" on:click={() => generalSettingsError.set('')}>x</button>
      </div>
    {/if}
    {#if showSample && dataset}
      <SampleSettingsPanel
        {dataset}
        activeTab={sampleTab}
        badgeFor={sampleBadgeFor}
        {onRename}
        {onUpdateStyle}
        {onUpdateMetadata}
        {onRerunPipeline}
        {onTransformEnabled}
        {onTransformParam}
      />
    {:else}
      {#key controlsRevision}
      <GeneralSettingsPanel
        activeTab={generalTab}
        {snapshot}
        datasetCount={datasets.length}
        {deviatingCount}
        badgeFor={generalBadgeFor}
        onShowDifferences={() => showDifferences([])}
        onChange={changeGeneral}
        {plotStyle}
        {onUpdatePlotStyle}
        {computePrecision}
        {onUpdateComputePrecision}
      />
      {/key}
    {/if}
  </div>
</aside>

<DifferencesModal
  open={differencesOpen}
  {datasets}
  {snapshot}
  {differences}
  focusKeys={differencesFocus}
  onReset={(datasetId, key) => resetSampleSetting(datasetId, key, generalContext)}
  onClose={() => { differencesOpen = false }}
/>
