<script lang="ts">
  import type { SpectrumDataset } from '../../types/project'
  import type { SampleSubView } from './workbenchUtils'

  export let open: boolean
  export let datasets: SpectrumDataset[]
  export let expandedSampleId: string | null
  export let selectedDatasetId: string | null
  export let onClose: () => void
  export let onFiles: (files: File[]) => void
  export let onFocus: (datasetId: string) => void
  export let onToggleVisibility: (datasetId: string) => void
  export let onRemove: (datasetId: string) => void
  export let onOpenSubTab: (datasetId: string, subView: SampleSubView) => void
  export let onHoverSample: (datasetId: string | null) => void = () => {}

  let fileInputEl: HTMLInputElement | null = null

  function openFilePicker(): void {
    fileInputEl?.click()
  }

  function handleFileInput(event: Event): void {
    const target = event.target as HTMLInputElement
    const files = target.files ? Array.from(target.files) : []
    if (files.length > 0) {
      onFiles(files)
    }
    target.value = ''
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault()
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : []
    if (files.length > 0) {
      onFiles(files)
    }
  }
</script>

<aside class="sidebar" class:hidden={!open}>
  <section>
    <div class="panel-header">
      <h2>Samples</h2>
      <button type="button" class="panel-close" aria-label="Close samples panel" on:click={onClose}>
        x
      </button>
    </div>

    <div
      class="drop-field"
      role="button"
      tabindex="0"
      aria-label="Import spectra files"
      on:click={openFilePicker}
      on:keydown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openFilePicker()
        }
      }}
      on:dragover|preventDefault
      on:drop={handleDrop}
    >
      <div class="drop-title">Drop or Click To Import Files</div>
      <div class="drop-subtitle">CSV, TSV, TXT, XLSX</div>
    </div>

    <input
      bind:this={fileInputEl}
      class="hidden-file-input"
      type="file"
      accept=".csv,.tsv,.txt,.xlsx"
      multiple
      on:change={handleFileInput}
    />

    {#each datasets as dataset (dataset.id)}
      <div
        class:selected={selectedDatasetId === dataset.id}
        class="sample-row"
        class:expanded={expandedSampleId === dataset.id}
        role="presentation"
        on:mouseenter={() => onHoverSample(dataset.id)}
        on:mouseleave={() => onHoverSample(null)}
      >
        <div class="sample-row-main">
          <button type="button" class="file" on:click={() => onFocus(dataset.id)}>
            <span class="sample-chevron" class:expanded={expandedSampleId === dataset.id} aria-hidden="true">▸</span>
            <span class="sample-color-bar" style={`--sample-color:${dataset.style.lineColor};`}></span>
            {dataset.style.label}
          </button>
          <button
            type="button"
            class="visibility-toggle"
            class:hidden-state={dataset.style.visible === false}
            aria-label={`${dataset.style.visible === false ? 'Show' : 'Hide'} ${dataset.style.label}`}
            title={dataset.style.visible === false ? 'Show sample' : 'Hide sample'}
            on:click={() => onToggleVisibility(dataset.id)}
          >
            <span class="eye-icon" aria-hidden="true">
              <span class="eye-pupil"></span>
            </span>
          </button>
          <button
            type="button"
            class="remove-x"
            aria-label={`Remove ${dataset.style.label}`}
            on:click={() => onRemove(dataset.id)}
          >
            x
          </button>
        </div>

        {#if expandedSampleId === dataset.id}
          <div class="sample-subitems">
            <button type="button" class="sample-subitem" on:click={() => onOpenSubTab(dataset.id, 'data')}>
              Data Table
            </button>
            <button type="button" class="sample-subitem" on:click={() => onOpenSubTab(dataset.id, 'peaks')}>
              Peak Assignments
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </section>
</aside>
