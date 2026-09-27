<script lang="ts">
  import type { NormalizationMode } from '../../types/project'
  import SampleSettingsPanel from './SampleSettingsPanel.svelte'
  import GeneralSettingsPanel from './GeneralSettingsPanel.svelte'

  export let open: boolean
  export let dataset: any | null
  export let datasetCount: number
  export let onClose: () => void
  export let onBackToGeneral: () => void = () => {}
  export let onRename: (datasetId: string, label: string) => void
  export let onUpdateStyle: (datasetId: string, patch: Record<string, unknown>) => void
  export let onUpdateMetadata: (datasetId: string, patch: Record<string, unknown>) => void
  export let onConvertAbscissa: (datasetId: string, targetUnit: string) => void
  export let onRerunPipeline: (datasetId: string) => void
  export let onTransformEnabled: (
    datasetId: string,
    transformId: string,
    enabled: boolean,
    scope: 'no' | 'individual' | 'global',
  ) => void
  export let onTransformScope: (
    datasetId: string,
    transformId: string,
    scope: 'no' | 'individual' | 'global',
    snapshot: { enabled: boolean; params: Record<string, number | string | boolean> },
  ) => void
  export let onTransformParam: (
    datasetId: string,
    transformId: string,
    params: Record<string, number | string | boolean>,
    currentScope: 'no' | 'individual' | 'global',
  ) => void
  export let onApplyPalette: (paletteId: string) => void
  export let onApplyLineWidth: (width: number) => void
  export let onApplyNormalization: (mode: NormalizationMode) => void
  export let onApplySmoothing: (windowLength: number, polyorder: number) => void
  export let onApplyAxisMetadata: (metadata: { xQuantity: string; xUnit: string; yQuantity: string; yUnit: string }) => void

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
</script>

<aside class="right-sidebar" class:hidden={!open}>
  <div class="panel-header">
    {#if dataset}
      <button type="button" class="panel-back" aria-label="Back to general settings" on:click={onBackToGeneral}>
        ‹
      </button>
    {/if}
    <h2>{dataset ? 'Sample Settings' : 'General Settings'}</h2>
    <button type="button" class="panel-close" aria-label="Close settings panel" on:click={onClose}>
      x
    </button>
  </div>

  <nav class="settings-tabs" aria-label="Settings sections">
    {#if dataset}
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
    {#if dataset}
      <SampleSettingsPanel
        {dataset}
        activeTab={sampleTab}
        {onRename}
        {onUpdateStyle}
        {onUpdateMetadata}
        {onConvertAbscissa}
        {onRerunPipeline}
        {onTransformEnabled}
        {onTransformScope}
        {onTransformParam}
      />
    {:else}
      <GeneralSettingsPanel
        activeTab={generalTab}
        {datasetCount}
        {onApplyPalette}
        {onApplyLineWidth}
        {onApplyNormalization}
        {onApplySmoothing}
        {onApplyAxisMetadata}
      />
    {/if}
  </div>
</aside>
