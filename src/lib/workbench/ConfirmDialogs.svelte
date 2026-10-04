<script lang="ts">
  import {
    describeAffected,
    pendingGeneralChange,
    resolvePendingGeneralChange,
  } from '../../state/generalSettingsActions'

  export let overwriteOpen: boolean
  export let onCancelOverwrite: () => void
  export let onConfirmOverwrite: () => void

  $: plan = $pendingGeneralChange
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

{#if plan}
  <div class="confirm-backdrop" role="presentation">
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="Update general setting">
      <h3>Update general setting</h3>
      <p>
        <b>{describeAffected(plan)}</b>:
        {plan.deviatorCount} {plan.deviatorCount === 1 ? 'sample uses' : 'samples use'} its own value.
        Overwrite every sample, or only update the {plan.followerCount}
        {plan.followerCount === 1 ? 'sample' : 'samples'} that follow the general setting?
      </p>
      <div class="confirm-actions">
        <button type="button" class="ghost" on:click={() => resolvePendingGeneralChange(null)}>Cancel</button>
        <button type="button" class="ghost" on:click={() => resolvePendingGeneralChange('followers')}>
          Only following samples ({plan.followerCount})
        </button>
        <button type="button" class="run" on:click={() => resolvePendingGeneralChange('all')}>Overwrite all samples</button>
      </div>
    </div>
  </div>
{/if}
