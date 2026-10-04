<script lang="ts">
  import QuantityLabel from '../QuantityLabel.svelte'
  import { afterUpdate, tick } from 'svelte'
  import { isPercentUnit } from '../../services/spectrumPresets'
  import { rowWindow, scrollToRow } from './virtualRows'

  export let dataset: any
  export let hoverSelection: { datasetId: string; pointIndex: number } | null
  export let onHover: (datasetId: string, pointIndex: number | null) => void

  let tableScrollEl: HTMLDivElement | null = null
  let headEl: HTMLTableSectionElement | null = null
  let scrollTop = 0
  let viewport = 400
  // Rows render at a fixed height; it is re-measured once rows exist so fonts and zoom levels match.
  let rowHeight = 28

  $: total = dataset.data.abscissa.length as number
  $: view = rowWindow(scrollTop, viewport, rowHeight, total)
  $: indices = Array.from({ length: view.end - view.start }, (_, offset) => view.start + offset)
  $: hoveredIndex = hoverSelection?.datasetId === dataset.id ? hoverSelection?.pointIndex ?? -1 : -1

  function formatOrdinate(value: number, unit: string): string {
    if (Number.isNaN(value)) return '—'
    if (!Number.isFinite(value)) return String(value)
    return isPercentUnit(unit) ? `${value.toFixed(4)} %` : String(value)
  }

  function handleScroll(): void {
    if (!tableScrollEl) return
    scrollTop = tableScrollEl.scrollTop
    viewport = tableScrollEl.clientHeight
  }

  afterUpdate(() => {
    if (!tableScrollEl) return
    viewport = tableScrollEl.clientHeight || viewport
    const row = tableScrollEl.querySelector<HTMLTableRowElement>('tr[data-row-index]')
    const measured = row?.getBoundingClientRect().height ?? 0
    if (measured > 0 && Math.abs(measured - rowHeight) > 0.5) rowHeight = measured
  })

  $: if (hoveredIndex >= 0) {
    void tick().then(() => {
      if (!tableScrollEl) return
      const target = scrollToRow(hoveredIndex, tableScrollEl.scrollTop, tableScrollEl.clientHeight, rowHeight, headEl?.offsetHeight ?? 0)
      if (target !== null) tableScrollEl.scrollTop = target
    })
  }
</script>

<div class="sample-table-wrap">
  <h3>Data Table</h3>
  <div class="sample-table-scroll" bind:this={tableScrollEl} on:scroll={handleScroll}>
    <table class="sample-table virtual" style={`--row-accent:${dataset.style.lineColor};`}>
      <thead bind:this={headEl}>
        <tr>
          <th><QuantityLabel quantity={dataset.units.xQuantity ?? 'Abscissa'} unit={dataset.units.x} /></th>
          <th><QuantityLabel quantity={dataset.units.yQuantity ?? 'Ordinate'} unit={dataset.units.y} subscript="original" /></th>
          <th><QuantityLabel quantity={dataset.units.yQuantity ?? 'Ordinate'} unit={dataset.units.y} subscript="modified" /></th>
        </tr>
      </thead>
      <tbody>
        {#if view.padTop > 0}<tr class="spacer" aria-hidden="true" style={`height:${view.padTop}px`}><td colspan="3"></td></tr>{/if}
        {#each indices as index (index)}
          <tr
            data-row-index={index}
            class:odd={index % 2 === 0}
            class:hovered={index === hoveredIndex}
            on:mouseenter={() => onHover(dataset.id, index)}
            on:mouseleave={() => onHover(dataset.id, null)}
          >
            <td>{dataset.data.abscissa[index]}</td>
            <td>{formatOrdinate(dataset.data.ordinateOriginal[index], dataset.units.y)}</td>
            <td>{formatOrdinate(dataset.data.ordinateModified[index], dataset.units.y)}</td>
          </tr>
        {/each}
        {#if view.padBottom > 0}<tr class="spacer" aria-hidden="true" style={`height:${view.padBottom}px`}><td colspan="3"></td></tr>{/if}
      </tbody>
    </table>
  </div>
</div>
