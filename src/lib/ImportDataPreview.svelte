<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { ParsedSpectrumSeries } from '../services/import/parsers'
  import VirtualTable from './VirtualTable.svelte'
  import { DEFAULT_PALETTE_ID, paletteColor } from '../services/palettes'

  export let tableRows: string[][] = []
  export let series: ParsedSpectrumSeries[] = []
  export let labels: string[] = []

  const dispatch = createEventDispatcher<{ labelchange: string[] }>()
  export let paletteId = DEFAULT_PALETTE_ID

  $: colorOf = (index: number): string => paletteColor(paletteId, { index, count: series.length })

  function buildPolyline(spectrum: ParsedSpectrumSeries): string {
    if (spectrum.abscissa.length === 0 || spectrum.ordinate.length === 0) return ''
    const minX = spectrum.abscissa.reduce((min, value) => Math.min(min, value), Infinity)
    const maxX = spectrum.abscissa.reduce((max, value) => Math.max(max, value), -Infinity)
    const minY = spectrum.ordinate.reduce((min, value) => Math.min(min, value), Infinity)
    const maxY = spectrum.ordinate.reduce((max, value) => Math.max(max, value), -Infinity)
    const spanX = maxX - minX || 1
    const spanY = maxY - minY || 1
    const stride = Math.max(1, Math.ceil(spectrum.abscissa.length / 1500))
    const indexes = Array.from({ length: Math.ceil(spectrum.abscissa.length / stride) }, (_, index) => index * stride)
    if (indexes[indexes.length - 1] !== spectrum.abscissa.length - 1) indexes.push(spectrum.abscissa.length - 1)
    return indexes.map((index) => {
      const value = spectrum.abscissa[index]!
      const px = 20 + ((value - minX) / spanX) * 760
      const py = 210 - ((spectrum.ordinate[index]! - minY) / spanY) * 180
      return `${px},${py}`
    }).join(' ')
  }

  function updateLabel(index: number, value: string): void {
    const next = [...labels]
    next[index] = value
    dispatch('labelchange', next)
  }
</script>

<div class="preview-shell">
  <div class="preview-table-wrap">
    <h3>Table Preview <small>{tableRows.length} row{tableRows.length === 1 ? '' : 's'}</small></h3>
    <div class="wizard-table-scroll"><VirtualTable rows={tableRows} /></div>
  </div>
  <div class="preview-plot-wrap">
    <h3>Plot Preview</h3>
    <svg class="preview-plot" viewBox="0 0 800 230" role="img" aria-label="Import preview plot">
      <rect x="0" y="0" width="800" height="230" fill="#15171b"></rect>
      {#each series as spectrum, index (spectrum.label + index)}
        <polyline fill="none" stroke={colorOf(index)} stroke-width="2" points={buildPolyline(spectrum)} />
      {/each}
    </svg>
    <div class="series-legend">
      {#each series as spectrum, index (spectrum.label + index)}
        <label class="legend-item">
          <span class="legend-dot" style={`background:${colorOf(index)};`}></span>
          <input
            type="text"
            aria-label={`Series ${index + 1} name`}
            value={labels[index] ?? spectrum.label}
            on:input={(event) => updateLabel(index, (event.target as HTMLInputElement).value)}
          />
        </label>
      {/each}
    </div>
  </div>
</div>

<style>
  .preview-shell{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:12px;align-items:stretch}
  .preview-table-wrap,.preview-plot-wrap{min-height:0;padding:10px;border:1px solid #3f3f46;border-radius:8px;background:#1a1b1f}
  .preview-table-wrap{display:flex;flex-direction:column}
  h3{margin:0;font-size:1rem}
  h3 small{margin-left:6px;color:#9da0a5;font-size:.75rem;font-weight:400}
  .wizard-table-scroll{flex:1 1 0;min-height:0;margin-top:8px}
  .preview-plot{width:100%;height:230px;margin-top:8px;border-radius:6px}
  .series-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;color:#9da0a5;font-size:.78rem}
  .legend-item{display:inline-flex;align-items:center;gap:6px}
  .legend-item input{width:150px;padding:4px 6px;font-size:.78rem}
  .legend-dot{width:8px;height:8px;flex:0 0 auto;border-radius:50%}
  @media(max-width:900px){.preview-shell{grid-template-columns:1fr}.wizard-table-scroll{flex-basis:auto;height:300px}}
</style>
