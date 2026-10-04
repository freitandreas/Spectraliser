<script lang="ts">
  import { quantityHtml } from '../services/quantityNotation'
  import { formatUnit } from '../services/spectrumPresets'
  import { quantityNotation } from '../state/displaySettings'

  export let quantity: string
  export let unit = ''
  export let subscript: string | undefined = undefined

  $: markup = quantityHtml(quantity, $quantityNotation, subscript)
  $: unitText = formatUnit(unit).trim()
</script>

<!-- quantityHtml escapes every user-provided part. -->
<span class="quantity">{@html markup}</span>{#if unitText} / {unitText}{/if}

<style>
  .quantity :global(i){font-style:italic}
</style>
