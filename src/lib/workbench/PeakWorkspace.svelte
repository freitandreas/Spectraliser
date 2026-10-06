<script lang="ts">
  import { startSideColumnResize } from './columnResize'
  import { peakModeFor, type SpectrumDataset } from '../../types/project'
  import QuantityLabel from '../QuantityLabel.svelte'
  import HelpTip from '../HelpTip.svelte'
  import { peakShape, type PeakShape } from '../../services/peakShape'
  import { projectStore } from '../../state/projectStore'
  import { peakSingleSeriesView } from '../../state/displaySettings'

  export let dataset: SpectrumDataset
  export let peakHoverSelection: { datasetId: string; peakId: string } | null
  export let onPeakHover: (datasetId: string, peakId: string | null, fromTable: boolean) => void
  export let prominence: number
  export let minDistance: number
  export let minHeight: number | null
  export let mode: 'maxima' | 'minima'
  export let auto: boolean
  export let onModeChange: (mode: 'maxima' | 'minima') => void
  export let onParametersChange: () => void
  export let onDetectionComplete: () => void

  const PEAK_MODES = [
    { id: 'maxima', label: 'Maxima', help: 'Detect local maxima (e.g. absorbance bands).' },
    { id: 'minima', label: 'Minima', help: 'Detect local minima (e.g. transmittance dips).' },
  ] as const

  const HELP = {
    auto: 'Recomputed from the data at every detection. Prominence is the larger of the white-noise range 2σ√(2 ln n) (σ from second differences) and twice the digitisation step; each peak must also exceed the noise range around it, so noisy high-absorbance regions add no false peaks. Min distance is half the median FWHM of the more prominent bands and stays 1 when no band is found. The fields show the values of the last detection; editing one switches automatic mode off.',
    prominence: 'Minimum height a peak must rise above the higher of its two surrounding valleys. Lower values also detect smaller, subtler peaks.',
    minDistance: 'Minimum number of data points between two neighbouring peaks. Higher values suppress closely spaced duplicates.',
    minHeight: 'Minimum ordinate value a point must reach to qualify as a peak. Leave empty to disable this threshold.',
  }

  let detecting = false
  let peakViewEl: HTMLDivElement | null = null
  let settingsWidthPx = 304

  $: if (mode !== peakModeFor(dataset.spectrumType, dataset.peakDetection?.mode)) {
    mode = peakModeFor(dataset.spectrumType, dataset.peakDetection?.mode)
  }

  function handleModeChange(event: Event): void {
    const nextMode = (event.target as HTMLInputElement).value as 'maxima' | 'minima'
    mode = nextMode
    prominence = nextMode === 'minima' ? -Math.abs(prominence) : Math.abs(prominence)
    projectStore.setPeakDetectionMode(dataset.id, nextMode)
    onParametersChange()
    onModeChange(nextMode)
  }

  async function runPeakDetection(): Promise<void> {
    if (detecting) return

    detecting = true
    try {
      await projectStore.detectPeaks(dataset.id, {
        prominence,
        minDistance,
        minHeight,
        mode,
        auto,
      })
      onDetectionComplete()
    } finally {
      detecting = false
    }
  }

  function handleAutoChange(event: Event): void {
    auto = (event.target as HTMLInputElement).checked
    onParametersChange()
  }

  // Typing a value takes the parameters out of automatic mode.
  function handleManualChange(): void {
    auto = false
    onParametersChange()
  }

  $: isIr = dataset.spectrumType === 'ir'
  $: shapes = computeShapes(dataset)

  // Recomputed from the current ordinate so the values follow processing and unit changes.
  function computeShapes(item: SpectrumDataset): Map<string, PeakShape | null> {
    const indices = item.peaks.map((peak) => peak.index).sort((a, b) => a - b)
    const peakMode = peakModeFor(item.spectrumType, item.peakDetection?.mode)
    return new Map(item.peaks.map((peak) => {
      const position = indices.indexOf(peak.index)
      return [peak.id, peakShape(item.data.abscissa, item.data.ordinateModified, peak.index, peakMode, {
        previous: indices[position - 1],
        next: indices[position + 1],
      })]
    }))
  }

  function formatNumber(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) return '—'
    return Math.abs(value) >= 1e4 || (value !== 0 && Math.abs(value) < 1e-3) ? value.toExponential(3) : value.toPrecision(4)
  }

  function startColumnResize(event: PointerEvent): void {
    startSideColumnResize(event, peakViewEl, settingsWidthPx, (width) => { settingsWidthPx = width })
  }
</script>

<div
  class="peak-view"
  bind:this={peakViewEl}
  style={`--peak-settings-width:${settingsWidthPx}px;`}
>
  <div class="peak-table-col">
    <div class="peak-table-heading">
      <div class="peak-table-title">
        <h3>Peak Assignments <HelpTip label="Peak assignments" text="Click on the trace in the plot above to add a peak manually. Peak rows are also flagged ⚑ in the data table." /></h3>
        <button
          type="button"
          class="peak-series-toggle"
          class:active={$peakSingleSeriesView}
          aria-pressed={$peakSingleSeriesView}
          title="Plot only this series as a 2D spectrum with its peaks, whatever the plot mode"
          on:click={() => peakSingleSeriesView.update((value) => !value)}
        >Only this series</button>
      </div>
    </div>
    {#if dataset.peaks.length === 0}
      <div class="sample-empty">No peaks yet. Run detection or click on the plot.</div>
    {:else}
      <div class="sample-table-scroll">
        <table class="sample-table" style={`--row-accent:${dataset.style.lineColor};`}>
          <thead>
            <tr>
              <th><QuantityLabel quantity={dataset.units.xQuantity ?? 'Abscissa'} unit={dataset.units.x} /></th>
              <th><QuantityLabel quantity={dataset.units.yQuantity ?? 'Ordinate'} unit={dataset.units.y} /></th>
              <th title="Height above the higher flanking minimum, in ordinate units">Prominence / {dataset.units.y || '1'}</th>
              <th title="Full width at half prominence">FWHM / {dataset.units.x || '1'}</th>
              <th title="Band area above the valley-to-valley baseline">Area</th>
              {#if isIr}<th>Intensity</th>{/if}
              <th>Label</th>
              {#if isIr}<th>Confidence</th>{/if}
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each dataset.peaks as peak (peak.id)}
              <tr class:hovered={peakHoverSelection?.peakId === peak.id}>
                <td
                  on:mouseenter={() => onPeakHover(dataset.id, peak.id, true)}
                  on:mouseleave={() => onPeakHover(dataset.id, null, true)}
                >{peak.x.toFixed(3)} {dataset.units.x}</td>
                <td
                  on:mouseenter={() => onPeakHover(dataset.id, peak.id, true)}
                  on:mouseleave={() => onPeakHover(dataset.id, null, true)}
                >{peak.y.toFixed(4)} {dataset.units.y}</td>
                <td>{formatNumber(shapes.get(peak.id)?.prominence)}</td>
                <td>{formatNumber(shapes.get(peak.id)?.fwhm)}</td>
                <td>{formatNumber(shapes.get(peak.id)?.area)}</td>
                {#if isIr}<td>{peak.intensity ?? '—'}</td>{/if}
                <td>
                  <input
                    type="text"
                    class="peak-label-input"
                    title={peak.alternatives?.length ? `Other possible groups: ${peak.alternatives.join(', ')}` : peak.label}
                    value={peak.label}
                    on:input={(event) => projectStore.updatePeakLabel(dataset.id, peak.id, (event.target as HTMLInputElement).value)}
                  />
                </td>
                {#if isIr}<td>{peak.confidence ?? '—'}</td>{/if}
                <td>{peak.source}</td>
                <td>
                  <button
                    type="button"
                    class="remove-x"
                    aria-label={`Remove peak at ${peak.x.toFixed(2)}`}
                    on:click={() => projectStore.removePeak(dataset.id, peak.id)}
                  >
                    x
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <button
    type="button"
    class="peak-column-resizer"
    aria-label="Resize peak table and detection settings"
    on:pointerdown={startColumnResize}
  ></button>

  <aside class="peak-settings-col">
    <div class="peak-settings-header">
      <h4>Peak detection</h4>
      {#if isIr}
        <span class="peak-mode-fixed" title="IR bands are read as transmittance dips, so IR peaks are always minima.">Minima (IR)</span>
      {:else}
      <div class="peak-mode-toggle" role="radiogroup" aria-label="Peak mode">
        {#each PEAK_MODES as option (option.id)}
          <label class:active={mode === option.id} title={option.help}>
            <input type="radio" name={`peak-mode-${dataset.id}`} value={option.id} checked={mode === option.id} on:change={handleModeChange} />
            {option.label}
          </label>
        {/each}
      </div>
      {/if}
    </div>

    <div class="peak-auto-row">
      <label class="peak-auto-toggle">
        <input type="checkbox" checked={auto} on:change={handleAutoChange} />
        <span>Automatic parameters</span>
      </label>
      <HelpTip label="Automatic parameters" text={HELP.auto} />
    </div>

    {#if dataset.processingDiagnostics?.noise?.warning}
      <p class="option-description" role="status">{dataset.processingDiagnostics.noise.warning}</p>
      <p class="option-description">
        Noise estimates (lags 1 / 2 / 4):
        {dataset.processingDiagnostics.noise.lagEstimates.lag1.toPrecision(3)} /
        {dataset.processingDiagnostics.noise.lagEstimates.lag2.toPrecision(3)} /
        {dataset.processingDiagnostics.noise.lagEstimates.lag4.toPrecision(3)}
      </p>
    {/if}

    <div class="peak-settings-fields">
      <label for={`peak-prominence-${dataset.id}`}>
        Prominence <HelpTip label="Prominence" text={HELP.prominence} />
      </label>
      <div class="peak-field-input">
        <input id={`peak-prominence-${dataset.id}`} type="number" step="0.0001" bind:value={prominence} on:change={handleManualChange} />
        {#if auto}<span class="peak-auto-tag" title="Value of the last automatic detection">auto</span>{/if}
      </div>

      <label for={`peak-distance-${dataset.id}`}>
        Min distance <HelpTip label="Min distance" text={HELP.minDistance} />
      </label>
      <div class="peak-field-input">
        <input id={`peak-distance-${dataset.id}`} type="number" min="0" step="1" bind:value={minDistance} on:change={handleManualChange} />
        <span class="peak-field-unit">pts</span>
        {#if auto}<span class="peak-auto-tag" title="Value of the last automatic detection">auto</span>{/if}
      </div>

      <label for={`peak-height-${dataset.id}`}>
        Min height <HelpTip label="Min height" text={HELP.minHeight} />
      </label>
      <div class="peak-field-input">
        <input
          id={`peak-height-${dataset.id}`}
          type="number"
          step="0.01"
          value={minHeight ?? ''}
          placeholder="none"
          on:input={(event) => {
            const raw = (event.target as HTMLInputElement).value
            minHeight = raw.trim().length > 0 ? Number(raw) : null
          }}
          on:change={onParametersChange}
        />
      </div>
    </div>

    <div class="peak-actions-row">
      <button type="button" class="run" disabled={detecting} on:click={() => void runPeakDetection()}>
        {detecting ? 'Detecting…' : 'Detect peaks'}
      </button>
      <button
        type="button"
        class="ghost"
        disabled={dataset.peaks.length === 0}
        on:click={() => projectStore.clearPeaks(dataset.id)}
      >
        Clear
      </button>
    </div>
  </aside>
</div>
