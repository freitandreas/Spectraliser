<script lang="ts">
  import QuantityLabel from '../QuantityLabel.svelte'
  import PeakHeatmap from '../PeakHeatmap.svelte'
  import { projectStore } from '../../state/projectStore'
  import { peakSingleSeriesView } from '../../state/displaySettings'

  export let dataset: any
  export let peakHoverSelection: { datasetId: string; peakId: string } | null
  export let onPeakHover: (datasetId: string, peakId: string | null, fromTable: boolean) => void
  export let prominence: number
  export let minDistance: number
  export let minHeight: number | null
  export let mode: 'maxima' | 'minima'
  export let onModeChange: (mode: 'maxima' | 'minima') => void
  export let onParametersChange: () => void
  export let onDetectionComplete: () => void

  let detecting = false
  let heatmapOpen = false
  let heatmapLoading = false
  let heatmapProminenceValues: number[] = []
  let heatmapDistanceValues: number[] = []
  let heatmapCounts: number[][] = []
  let peakViewEl: HTMLDivElement | null = null
  let settingsWidthPx = 304

  $: if (mode !== (dataset.peakDetection?.mode ?? 'maxima')) {
    mode = dataset.peakDetection?.mode ?? 'maxima'
  }

  function handleModeChange(event: Event): void {
    const nextMode = (event.target as HTMLSelectElement).value as 'maxima' | 'minima'
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
      })
      onDetectionComplete()
    } finally {
      detecting = false
    }
  }

  function buildHeatmapAxisValues(): { prominenceValues: number[]; distanceValues: number[] } {
    const values = dataset.data.ordinateModified.filter(Number.isFinite)
    const min = values.length ? Math.min(...values) : 0
    const max = values.length ? Math.max(...values) : 0
    const range = Math.max(max - min, 1e-6)

    return {
      prominenceValues: Array.from({ length: 8 }, (_, i) => {
        const t = i / 7
        const value = Number((range * (0.002 + t * 0.25)).toFixed(6))
        return mode === 'minima' ? -value : value
      }),
      distanceValues: Array.from({ length: 8 }, (_, i) => {
        const t = i / 7
        return Math.max(1, Math.round(1 + t * 39))
      }),
    }
  }

  async function runPeakHeatmap(): Promise<void> {
    heatmapLoading = true
    const { prominenceValues, distanceValues } = buildHeatmapAxisValues()
    heatmapProminenceValues = prominenceValues
    heatmapDistanceValues = distanceValues

    try {
      const counts = await projectStore.computePeakHeatmap(dataset.id, {
        prominenceValues,
        distanceValues,
        minHeight,
        mode,
      })
      heatmapCounts = counts ?? []
    } finally {
      heatmapLoading = false
    }
  }

  function toggleHeatmap(): void {
    heatmapOpen = !heatmapOpen
    if (heatmapOpen) void runPeakHeatmap()
  }

  function handleHeatmapSelect(event: CustomEvent<{ prominence: number; distance: number }>): void {
    const selectedProminence = Number(event.detail.prominence.toFixed(6))
    prominence = mode === 'minima' ? -Math.abs(selectedProminence) : Math.abs(selectedProminence)
    minDistance = Math.max(1, Math.round(event.detail.distance))
    onParametersChange()
    heatmapOpen = false
  }

  function startColumnResize(event: PointerEvent): void {
    if (!peakViewEl) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = settingsWidthPx
    const bounds = peakViewEl.getBoundingClientRect()
    const maxWidth = Math.max(280, bounds.width - 320)

    const handleMove = (moveEvent: PointerEvent): void => {
      const delta = startX - moveEvent.clientX
      settingsWidthPx = Math.min(maxWidth, Math.max(264, startWidth + delta))
    }
    const handleUp = (): void => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
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
        <h3>Peak Assignments</h3>
        <button
          type="button"
          class="peak-series-toggle"
          class:active={$peakSingleSeriesView}
          aria-pressed={$peakSingleSeriesView}
          title="Plot only this series as a 2D spectrum with its peaks, whatever the plot mode"
          on:click={() => peakSingleSeriesView.update((value) => !value)}
        >Only this series</button>
      </div>
      <p class="peak-assignment-note">Click on the trace in the plot above to add a peak manually.</p>
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
              <th>Prominence</th>
              <th>Intensity</th>
              <th>Label</th>
              <th>Confidence</th>
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
                <td>{peak.prominence !== undefined ? peak.prominence.toFixed(4) : '—'}</td>
                <td>{peak.intensity ?? '—'}</td>
                <td>
                  <input
                    type="text"
                    class="peak-label-input"
                    title={peak.alternatives?.length ? `Other possible groups: ${peak.alternatives.join(', ')}` : peak.label}
                    value={peak.label}
                    on:input={(event) => projectStore.updatePeakLabel(dataset.id, peak.id, (event.target as HTMLInputElement).value)}
                  />
                </td>
                <td>{peak.confidence ?? '—'}</td>
                <td>{peak.dataOrigin === 'original' ? 'original data' : peak.source}</td>
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
      <h4>Peak Detection</h4>
      <button type="button" class="ghost" on:click={toggleHeatmap}>
        {heatmapOpen ? 'Back to Settings' : 'Parameter Heatmap'}
      </button>
    </div>

    {#if heatmapOpen}
      <p class="peak-hint">Click a cell to apply that prominence / min distance combination.</p>
      <div class="peak-heatmap-container">
        <PeakHeatmap
          prominenceValues={heatmapProminenceValues}
          distanceValues={heatmapDistanceValues}
          counts={heatmapCounts}
          currentProminence={prominence}
          currentDistance={minDistance}
          loading={heatmapLoading}
          on:select={handleHeatmapSelect}
        />
      </div>
    {:else}
      <div class="peak-settings-fields">
        <label>
          <span class="peak-field-label">Peak mode</span>
          <select bind:value={mode} on:change={handleModeChange}>
            <option value="maxima">Maxima</option>
            <option value="minima">Minima</option>
          </select>
        </label>
        <label>
          <span class="peak-field-label">
            Prominence
            <button
              type="button"
              class="info-icon"
              title="Minimum vertical distance a peak must stand above the surrounding baseline before it merges into a taller neighboring peak. Lower values detect smaller, subtler peaks."
            >?</button>
          </span>
          <input
            type="number"
            step="0.0001"
            bind:value={prominence}
            on:change={onParametersChange}
          />
        </label>
        <label>
          <span class="peak-field-label">
            Min distance (points)
            <button
              type="button"
              class="info-icon"
              title="Minimum number of abscissa samples required between two neighboring peaks. Higher values suppress closely spaced duplicate peaks."
            >?</button>
          </span>
          <input
            type="number"
            min="0"
            step="1"
            bind:value={minDistance}
            on:change={onParametersChange}
          />
        </label>
        <label>
          <span class="peak-field-label">
            Min height
            <button
              type="button"
              class="info-icon"
              title="Minimum absolute y-value (signal intensity) a point must reach to qualify as a peak. Leave empty to disable this threshold."
            >?</button>
          </span>
          <input
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
        </label>
      </div>
      <div class="peak-actions-row">
        <button type="button" class="run" disabled={detecting} on:click={() => void runPeakDetection()}>
          {detecting ? 'Detecting...' : 'Detect Peaks'}
        </button>
        <button
          type="button"
          class="ghost"
          disabled={dataset.peaks.length === 0}
          on:click={() => projectStore.clearPeaks(dataset.id)}
        >
          Clear Peaks
        </button>
      </div>
    {/if}
  </aside>
</div>
