<script lang="ts">
  /** Hover/focus help bubble; fixed positioning keeps it visible inside scrolling panels. */
  export let text: string
  export let label = 'Help'

  let button: HTMLButtonElement
  let open = false
  let style = ''
  const WIDTH = 260

  function show(): void {
    const rect = button.getBoundingClientRect()
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8)
    const below = rect.bottom + 6
    const placeAbove = below + 140 > window.innerHeight
    style = `left:${left}px;width:${WIDTH}px;${placeAbove ? `bottom:${window.innerHeight - rect.top + 6}px` : `top:${below}px`}`
    open = true
  }
</script>

<button
  bind:this={button}
  type="button"
  class="help-tip"
  aria-label={`${label}: ${text}`}
  on:mouseenter={show}
  on:focus={show}
  on:mouseleave={() => (open = false)}
  on:blur={() => (open = false)}
>?</button>
{#if open}
  <span class="help-tip-bubble" role="tooltip" {style}>{text}</span>
{/if}

<style>
  .help-tip {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--text-dim);
    background: transparent;
    color: var(--text-dim);
    font-size: 0.66rem;
    line-height: 1;
    padding: 0;
    cursor: help;
  }

  .help-tip:hover,
  .help-tip:focus-visible {
    color: var(--text);
    border-color: var(--text);
  }

  .help-tip-bubble {
    position: fixed;
    z-index: 1000;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: #1d1f24;
    color: var(--text);
    font-size: 0.74rem;
    line-height: 1.4;
    font-weight: 400;
    white-space: normal;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    pointer-events: none;
  }
</style>
