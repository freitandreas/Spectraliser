<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  /** Physical layout size of the figure in CSS px. */
  export let width: number
  export let height: number
  /** `width` fits the available width (never enlarges); `contain` fits inside the whole box. */
  export let fit: 'width' | 'contain' = 'width'

  let host: HTMLDivElement
  let available = { width: 0, height: 0 }
  let observer: ResizeObserver | null = null

  onMount(() => {
    observer = new ResizeObserver(([entry]) => {
      available = { width: entry.contentRect.width, height: entry.contentRect.height }
    })
    observer.observe(host)
  })
  onDestroy(() => observer?.disconnect())

  $: widthScale = available.width > 0 ? available.width / width : 1
  $: scale = fit === 'contain'
    ? Math.min(widthScale, available.height > 0 ? available.height / height : 1)
    : Math.min(1, widthScale)
</script>

<div class="scaled-host" class:contain={fit === 'contain'} bind:this={host}>
  <div class="scaled-frame" style={`width:${width * scale}px;height:${height * scale}px`}>
    <div class="scaled-content" style={`width:${width}px;height:${height}px;transform:scale(${scale})`}>
      <slot />
    </div>
  </div>
</div>

<style>
  .scaled-host{width:100%;min-width:0;display:flex;justify-content:center}
  .scaled-host.contain{height:100%;min-height:0;align-items:center}
  .scaled-frame{flex:none;overflow:hidden}
  .scaled-content{transform-origin:top left}
</style>
