<script lang="ts">
  import { runtimeState } from '../../state/runtimeState'
  export let leftPanelOpen: boolean
  export let allDatasetsVisible = false
  export let selectedDatasetId: string | null = null
  export let onToggleAllVisibility: () => void
  export let onImportFiles: () => void
  export let onStartNewSession: () => void
  export let onToggleSampleExplorer: () => void
  export let onShowDataTable: () => void
  export let onShowPeakAssignments: () => void
  export let onShowScript: () => void
  export let onShowSettings: () => void
  export let onExport: () => void
  export let onLinkMetadata: () => void
  export let datasetCount = 0
</script>

<header class="topbar">
  <div class="brand">Spectraliser</div>
  <nav class="menu toolbar-nav" aria-label="Main toolbar">
    <div class="nav-menu">
      <button type="button" class="toolbar-button" aria-haspopup="true">
        Data <span class="menu-caret" aria-hidden="true">▾</span>
      </button>
      <div class="nav-menu-dropdown" role="menu" aria-label="Data">
        <button type="button" role="menuitem" disabled={datasetCount === 0} on:click={onToggleAllVisibility}>
          {allDatasetsVisible ? 'Hide all' : 'Show all'}
        </button>
        <button type="button" role="menuitem" disabled={datasetCount === 0} on:click={onLinkMetadata}>Metadata</button>
        <button type="button" role="menuitem" on:click={onImportFiles}>Import files</button>
        <span class="nav-menu-divider" aria-hidden="true"></span>
        <button type="button" role="menuitem" class="danger-text" on:click={onStartNewSession}>Start new session</button>
      </div>
    </div>
    <div class="nav-menu">
      <button type="button" class="toolbar-button" aria-haspopup="true">
        View <span class="menu-caret" aria-hidden="true">▾</span>
      </button>
      <div class="nav-menu-dropdown" role="menu" aria-label="View">
        <button type="button" role="menuitem" on:click={onToggleSampleExplorer}>
          {leftPanelOpen ? 'Hide' : 'Show'} sample explorer
        </button>
        <button type="button" role="menuitem" disabled={!selectedDatasetId} on:click={onShowDataTable}>
          Show data table (current selected sample)
        </button>
        <button type="button" role="menuitem" disabled={!selectedDatasetId} on:click={onShowPeakAssignments}>
          Show peak assignments (current selected sample)
        </button>
        <button type="button" role="menuitem" on:click={onShowScript}>Show script</button>
        <button type="button" role="menuitem" on:click={onShowSettings}>Show settings</button>
      </div>
    </div>
    <button type="button" class="toolbar-button" on:click={onExport}>
      Export
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
    {#if $runtimeState.scriptProgress.active}
      <div class="script-progress" role="status" aria-live="polite">
        <div class="script-progress-label">{$runtimeState.scriptProgress.message}</div>
        <div class="script-progress-track" aria-hidden="true">
          <span style={`width:${$runtimeState.scriptProgress.total > 0 ? ($runtimeState.scriptProgress.completed / $runtimeState.scriptProgress.total) * 100 : 0}%;`}></span>
        </div>
        <div class="script-progress-count">{$runtimeState.scriptProgress.completed}/{$runtimeState.scriptProgress.total}</div>
      </div>
    {/if}
  </div>
</header>
