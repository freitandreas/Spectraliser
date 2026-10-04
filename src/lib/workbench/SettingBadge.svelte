<script lang="ts">
  import type { BadgeInfo } from './settingBadge'

  export let info: BadgeInfo | null
</script>

{#if info}
  <span class="setting-badge" title={info.title}>
    <span class="setting-badge-label">{info.label}</span>
    {#if info.action}
      <button
        type="button"
        class="setting-badge-action"
        aria-label={info.actionLabel ?? info.title}
        title={info.actionLabel ?? info.title}
        on:click|preventDefault|stopPropagation={info.action}
      >
        {info.actionLabel ? info.actionLabel : '↺'}
      </button>
    {/if}
  </span>
{/if}
