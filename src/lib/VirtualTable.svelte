<script lang="ts">
  export let rows: string[][] = []
  export let rowHeight = 28

  const OVERSCAN = 12
  let scrollTop = 0
  let viewportHeight = 0

  $: columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0)
  $: first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  $: last = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN)
  $: visible = rows.slice(first, last)
  $: if (rows) scrollTop = Math.min(scrollTop, Math.max(0, rows.length * rowHeight - viewportHeight))
</script>

<div
  class="virtual-table"
  bind:clientHeight={viewportHeight}
  on:scroll={(event) => { scrollTop = (event.currentTarget as HTMLDivElement).scrollTop }}
>
  <table style={`--row-height:${rowHeight}px`}>
    <tbody>
      {#if first > 0}<tr class="spacer" style={`height:${first * rowHeight}px`}><td colspan={columnCount + 1}></td></tr>{/if}
      {#each visible as row, offset (first + offset)}
        <tr class:odd={(first + offset) % 2 === 0}>
          <th scope="row">{first + offset + 1}</th>
          {#each Array.from({ length: columnCount }, (_, index) => row[index] ?? '') as cell}<td>{cell}</td>{/each}
        </tr>
      {/each}
      {#if last < rows.length}<tr class="spacer" style={`height:${(rows.length - last) * rowHeight}px`}><td colspan={columnCount + 1}></td></tr>{/if}
    </tbody>
  </table>
</div>

<style>
  .virtual-table{height:100%;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#4a5f72 #1a1b1f}
  .virtual-table::-webkit-scrollbar{width:10px;height:10px}
  .virtual-table::-webkit-scrollbar-track{background:#1a1b1f}
  .virtual-table::-webkit-scrollbar-thumb{background:#4a5f72;border:2px solid #1a1b1f;border-radius:8px}
  table{width:100%;border-collapse:collapse;font-size:.8rem}
  tr:not(.spacer){height:var(--row-height)}
  td,th{padding:0 6px;border-bottom:1px solid rgba(255,255,255,.08);color:#d4d4d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
  th{position:sticky;left:0;background:#1f2126;color:#7f848c;font-weight:400;text-align:right;font-variant-numeric:tabular-nums}
  tr.odd{background:rgba(79,193,255,.08)}
  tr:not(.odd):not(.spacer){background:rgba(79,193,255,.03)}
  .spacer td{padding:0;border:0}
</style>
