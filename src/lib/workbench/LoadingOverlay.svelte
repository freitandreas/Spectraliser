<script lang="ts">
  /** Covers a region whose content cannot be interacted with yet. */
  export let message = 'Loading…'
</script>

<div class="loading-overlay" role="status" aria-live="polite" aria-busy="true">
  <div class="loading-pill">
    <span class="loading-spinner" aria-hidden="true"></span>
    <span>{message}</span>
  </div>
</div>

<style>
  .loading-overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    background: rgba(18, 19, 22, 0.45);
    cursor: progress;
    /* Fast renders finish before the overlay fades in; opacity animates on the compositor even while scripts run. */
    animation: overlay-in 140ms ease 90ms both;
  }

  .loading-pill {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(28, 30, 35, 0.94);
    color: #d4dbe3;
    font-size: 0.8rem;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  }

  .loading-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(98, 180, 232, 0.25);
    border-top-color: #62b4e8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes overlay-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
