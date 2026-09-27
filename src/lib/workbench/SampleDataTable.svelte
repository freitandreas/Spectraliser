<script lang="ts">
  import { tick } from 'svelte'
  import { formatUnit, isPercentUnit } from '../../services/spectrumPresets'

  export let dataset: any
  export let hoverSelection: { datasetId: string; pointIndex: number } | null
  export let onHover: (datasetId: string, pointIndex: number | null) => void

  let tableScrollEl: HTMLDivElement | null = null

  function formatOrdinate(value: number, unit: string): string {
    if (!Number.isFinite(value)) {
      return String(value)
    }
    return isPercentUnit(unit) ? `${value.toFixed(4)} %` : String(value)
  }

  $: if (hoverSelection?.datasetId === dataset.id) {
    void tick().then(() => {
      const row = tableScrollEl?.querySelector<HTMLTableRowElement>(
        `[data-row-index='${hoverSelection?.pointIndex}']`,
      )
      if (!row || !tableScrollEl) return

      const rowTop = row.offsetTop
      const rowBottom = rowTop + row.offsetHeight
      const visibleTop = tableScrollEl.scrollTop
      const visibleBottom = visibleTop + tableScrollEl.clientHeight

      if (rowTop < visibleTop) {
        tableScrollEl.scrollTop = rowTop - 8
      } else if (rowBottom > visibleBottom) {
        tableScrollEl.scrollTop = rowBottom - tableScrollEl.clientHeight + 8
      }
    })
  }
</script>

<div class="sample-table-wrap">
  <h3>Data Table</h3>
  <div class="sample-table-scroll" bind:this={tableScrollEl}>
    <table class="sample-table" style={`--row-accent:${dataset.style.lineColor};`}>
      <thead>
        <tr>
          <th><i>{dataset.units.xQuantity}</i>{#if dataset.units.x} / {formatUnit(dataset.units.x)}{/if}</th>
          <th><i>{dataset.units.yQuantity}<sub>original</sub></i>{#if dataset.units.y} / {formatUnit(dataset.units.y)}{/if}</th>
          <th><i>{dataset.units.yQuantity}<sub>modified</sub></i>{#if dataset.units.y} / {formatUnit(dataset.units.y)}{/if}</th>
        </tr>
      </thead>
      <tbody>
        {#each dataset.data.abscissa as point, index (index)}
          <tr
            data-row-index={index}
            class:hovered={hoverSelection?.datasetId === dataset.id && hoverSelection?.pointIndex === index}
            on:mouseenter={() => onHover(dataset.id, index)}
            on:mouseleave={() => onHover(dataset.id, null)}
          >
            <td>{point}</td>
            <td>{formatOrdinate(dataset.data.ordinateOriginal[index], dataset.units.y)}</td>
            <td>{formatOrdinate(dataset.data.ordinateModified[index], dataset.units.y)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
