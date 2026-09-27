<script lang="ts">
  export let overwriteOpen: boolean
  export let globalScopeOpen: boolean
  export let datasetCount: number
  export let onCancelOverwrite: () => void
  export let onConfirmOverwrite: () => void
  export let onCancelGlobal: () => void
  export let onConfirmGlobal: () => void
</script>

{#if overwriteOpen}
  <div class="confirm-backdrop" role="presentation">
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="Reset manual edits">
      <h3>Reset Manual Edits?</h3>
      <p>
        Modifying GUI controls will overwrite your custom Python script and return to synchronized mode.
      </p>
      <div class="confirm-actions">
        <button type="button" class="ghost" on:click={onCancelOverwrite}>Cancel</button>
        <button type="button" class="run" on:click={onConfirmOverwrite}>Overwrite and Continue</button>
      </div>
    </div>
  </div>
{/if}

{#if globalScopeOpen}
  <div class="confirm-backdrop" role="presentation">
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="Global transform warning">
      <h3>Apply To All Spectra?</h3>
      <p>
        Warning: You are about to override transformation settings for {datasetCount} loaded spectra. Continue?
      </p>
      <div class="confirm-actions">
        <button type="button" class="ghost" on:click={onCancelGlobal}>Cancel</button>
        <button type="button" class="run" on:click={onConfirmGlobal}>Continue</button>
      </div>
    </div>
  </div>
{/if}
