<script lang="ts">
  import type { SpectrumDataset } from '../../types/project'
  import QuantityLabel from '../QuantityLabel.svelte'
  import { afterUpdate, tick } from 'svelte'
  import { isNormalised, isPercentUnit } from '../../services/spectrumPresets'
  import { rowWindow, scrollToRow } from './virtualRows'
  import ExperimentMetadataPanel from './ExperimentMetadataPanel.svelte'
  import { startSideColumnResize } from './columnResize'

  export let dataset: SpectrumDataset
  export let hoverSelection: { datasetId: string; pointIndex: number } | null
  export let onHover: (datasetId: string, pointIndex: number | null) => void
  export let onLinkMetadata: (() => void) | null = null

  let viewEl: HTMLDivElement | null = null
  let sideWidthPx = 304

  let tableScrollEl: HTMLDivElement | null = null
  let headEl: HTMLTableSectionElement | null = null
  let scrollTop = 0
  let viewport = 400
  // Rows render at a fixed height; it is re-measured once rows exist so fonts and zoom levels match.
  let rowHeight = 28

  $: total = dataset.data.abscissa.length as number
  $: peakByIndex = new Map(dataset.peaks.map((peak) => [peak.index, peak]))
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

<div class="peak-view" bind:this={viewEl} style={`--peak-settings-width:${sideWidthPx}px;`}>
<div class="sample-table-wrap">
  <h3>Data Table</h3>
  <div class="sample-table-scroll" bind:this={tableScrollEl} on:scroll={handleScroll}>
    <table class="sample-table virtual" style={`--row-accent:${dataset.style.lineColor};`}>
      <thead bind:this={headEl}>
        <tr>
          <th class="flag-col" title="Peak">⚑</th>
          <th><QuantityLabel quantity={dataset.units.xQuantity ?? 'Abscissa'} unit={dataset.units.x} /></th>
          <th><QuantityLabel quantity={dataset.units.yQuantity ?? 'Ordinate'} unit={dataset.units.y} subscript="original" /></th>
          <th><QuantityLabel quantity={dataset.units.yQuantity ?? 'Ordinate'} unit={dataset.units.y} subscript={isNormalised(dataset) ? 'modified,norm' : 'modified'} /></th>
        </tr>
      </thead>
      <tbody>
        {#if view.padTop > 0}<tr class="spacer" aria-hidden="true" style={`height:${view.padTop}px`}><td colspan="4"></td></tr>{/if}
        {#each indices as index (index)}
          {@const peak = peakByIndex.get(index)}
          <tr
            data-row-index={index}
            class:odd={index % 2 === 0}
            class:hovered={index === hoveredIndex}
            class:peak-row={peak !== undefined}
            on:mouseenter={() => onHover(dataset.id, index)}
            on:mouseleave={() => onHover(dataset.id, null)}
          >
            <td class="flag-col">
              {#if peak}
                <span
                  class="peak-flag"
                  class:disabled={!peak.enabled}
                  style={`color:${dataset.style.lineColor}`}
                  title={`${peak.label || 'Peak'}${peak.enabled ? '' : ' (disabled)'}`}
                >⚑</span>
              {/if}
            </td>
            <td>{dataset.data.abscissa[index]}</td>
            <td>{formatOrdinate(dataset.data.ordinateOriginal[index], dataset.units.y)}</td>
            <td>{formatOrdinate(dataset.data.ordinateModified[index], dataset.units.y)}</td>
          </tr>
        {/each}
        {#if view.padBottom > 0}<tr class="spacer" aria-hidden="true" style={`height:${view.padBottom}px`}><td colspan="4"></td></tr>{/if}
      </tbody>
    </table>
  </div>
</div>
<button
  type="button"
  class="peak-column-resizer"
  aria-label="Resize data table and metadata"
  on:pointerdown={(event) => startSideColumnResize(event, viewEl, sideWidthPx, (width) => { sideWidthPx = width })}
></button>
<ExperimentMetadataPanel {dataset} {onLinkMetadata} />
</div>

<style>
  .flag-col { width: 1.6em; padding-left: 4px !important; padding-right: 0 !important; text-align: center !important; }
  .peak-row td:not(.flag-col) { font-weight: 600; }
  .peak-flag { font-size: .8rem; }
  .peak-flag.disabled { opacity: .35; }
</style>
