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
  export let onStartNewSession: () => void = () => {}
  export let onShowAll: () => void = () => {}
  export let onHideAll: () => void = () => {}
</script>

<header class="topbar">
  <div class="brand">Spectraliser</div>
  <nav class="menu toolbar-nav" aria-label="Main toolbar">
    <div class="data-menu">
      <button
        type="button"
        class="toolbar-button"
        class:active={leftPanelOpen}
        aria-pressed={leftPanelOpen}
        aria-haspopup="true"
        on:click={onToggleData}
      >
        Data <span class="menu-caret" aria-hidden="true">▾</span>
      </button>
      <div class="data-menu-dropdown" role="menu" aria-label="Data navigation settings">
        <button type="button" role="menuitem" disabled={datasetCount === 0} on:click={onShowAll}>Show all</button>
        <button type="button" role="menuitem" disabled={datasetCount === 0} on:click={onHideAll}>Hide all</button>
        <button type="button" role="menuitem" on:click={onToggleData}>
          {leftPanelOpen ? 'Hide' : 'Show'} series explorer
        </button>
        <span class="data-menu-divider" aria-hidden="true"></span>
        <button type="button" role="menuitem" class="danger-text" on:click={onStartNewSession}>Start new session</button>
      </div>
    </div>
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
