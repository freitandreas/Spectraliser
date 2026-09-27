<script lang="ts">
  export let leftPanelOpen: boolean
  export let bottomPanelOpen: boolean
  export let rightPanelOpen: boolean
  export let onToggleData: () => void
  export let onToggleScript: () => void
  export let onAnalyse: () => void
  export let onToggleSettings: () => void
  export let onExport: () => void
  export let scriptProgress: { active: boolean; completed: number; total: number; message: string }
  export let datasetCount = 0
  export let onRemoveAll: () => void = () => {}
  export let onShowAll: () => void = () => {}
  export let onHideAll: () => void = () => {}
</script>

<header class="topbar">
  <div class="brand">Spectraliser</div>
  <nav class="menu toolbar-nav" aria-label="Main toolbar">
    <button
      type="button"
      class="toolbar-button"
      class:active={leftPanelOpen}
      aria-pressed={leftPanelOpen}
      on:click={onToggleData}
    >
      Data
    </button>
    <button
      type="button"
      class="toolbar-button"
      class:active={bottomPanelOpen}
      aria-pressed={bottomPanelOpen}
      on:click={onToggleScript}
    >
      Script
    </button>
    <button type="button" class="toolbar-button" on:click={onAnalyse}>
      Analyse
    </button>
    <button type="button" class="toolbar-button" on:click={onExport}>
      Export
    </button>
    <button
      type="button"
      class="toolbar-button"
      class:active={rightPanelOpen}
      aria-pressed={rightPanelOpen}
      on:click={onToggleSettings}
    >
      Settings
    </button>
    <button
      type="button"
      class="toolbar-button"
      title="Use the Import Wizard, Script View, and Sample Settings to configure analysis."
    >
      About/Help
    </button>

    <span class="toolbar-divider" aria-hidden="true"></span>

    <button type="button" class="toolbar-button" disabled={datasetCount === 0} on:click={onShowAll}>
      Show all
    </button>
    <button type="button" class="toolbar-button" disabled={datasetCount === 0} on:click={onHideAll}>
      Hide all
    </button>
    <button type="button" class="toolbar-button danger-text" disabled={datasetCount === 0} on:click={onRemoveAll}>
      Remove all
    </button>
  </nav>
  <div class="actions">
    {#if scriptProgress.active}
      <div class="script-progress" role="status" aria-live="polite">
        <div class="script-progress-label">{scriptProgress.message}</div>
        <div class="script-progress-track" aria-hidden="true">
          <span style={`width:${scriptProgress.total > 0 ? (scriptProgress.completed / scriptProgress.total) * 100 : 0}%;`}></span>
        </div>
        <div class="script-progress-count">{scriptProgress.completed}/{scriptProgress.total}</div>
      </div>
    {/if}
  </div>
</header>
