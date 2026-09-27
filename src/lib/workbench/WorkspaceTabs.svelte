<script lang="ts">
  import type { SampleSubView } from './workbenchUtils'

  export let openedSampleTabs: Array<{ tabId: string; dataset: any; subView: SampleSubView }>
  export let activeWorkspaceTab: string
  export let onOpenSubTab: (datasetId: string, subView: SampleSubView) => void
  export let onActivateScript: () => void
  export let onCloseTab: (tabId: string) => void
  export let onClosePanel: () => void

  function handleWheel(event: WheelEvent): void {
    const target = event.currentTarget as HTMLDivElement | null
    if (!target || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    target.scrollLeft += event.deltaY
    event.preventDefault()
  }
</script>

<div class="tabs">
  <div class="sample-tabs-scroll" on:wheel={handleWheel}>
    {#each openedSampleTabs as tabEntry (tabEntry.tabId)}
      <div
        class="sample-tab-shell"
        class:active={activeWorkspaceTab === tabEntry.tabId}
        style={`--tab-color:${tabEntry.dataset.style.lineColor};`}
      >
        <button
          type="button"
          class="tab tab-button sample-tab-button"
          on:click={() => onOpenSubTab(tabEntry.dataset.id, tabEntry.subView)}
        >
          <span class="sample-color-bar tab-color-bar" style={`--sample-color:${tabEntry.dataset.style.lineColor};`}></span>
          {tabEntry.dataset.style.label} • {tabEntry.subView === 'data' ? 'Data' : 'Peaks'}
        </button>
        <button
          type="button"
          class="tab-close"
          aria-label={`Close ${tabEntry.dataset.style.label} ${tabEntry.subView === 'data' ? 'Data' : 'Peaks'} tab`}
          on:click={() => onCloseTab(tabEntry.tabId)}
        >
          x
        </button>
      </div>
    {/each}
  </div>

  <div
    class="sample-tab-shell script-tab-shell"
    class:active={activeWorkspaceTab === 'script_view'}
    style="--tab-color:#8ea0b4;"
  >
    <button
      type="button"
      class="tab tab-button sample-tab-button script-tab-button"
      on:click={onActivateScript}
    >
      <span class="sample-color-bar tab-color-bar" style="--sample-color:#8ea0b4;"></span>
      Script
    </button>
  </div>

  <button
    type="button"
    class="panel-close bottom-panel-close"
    aria-label="Close bottom panel"
    on:click={onClosePanel}
  >
    x
  </button>
</div>
