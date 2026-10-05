<script lang="ts">
  import { PEAK_COLUMNS, type PeakColumn } from '../../services/export/reportContent'
  import { EXPORT_PRESETS, EXPORT_SIZE_LIMITS_CM, formatCm, type ExportSettings, type ExportFormat, type ExportPreset } from '../../services/export/exportSettings'

  export let settings: ExportSettings
  export let onChange: (settings: ExportSettings) => void
  export let onExport: () => void
  export let onClose: () => void
  export let error = ''
  export let busy = false
  let inputError = ''

  const FORMATS: Array<{ id: ExportFormat; label: string }> = [
    { id: 'python', label: 'Python project ZIP (with data)' },
    { id: 'plot-image', label: 'Plot image (PNG)' },
    { id: 'excel-table', label: 'Report tables (Excel)' },
    { id: 'latex-table', label: 'Report tables (LaTeX)' },
    { id: 'pdf-report', label: 'PDF report (print dialog)' },
    { id: 'latex-report', label: 'LaTeX report ZIP (plot and tables)' },
    { id: 'html', label: 'HTML report' },
    { id: 'csv', label: 'CSV summary' },
    { id: 'json', label: 'JSON project snapshot' },
  ]

  function textValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value
  }

  function changeNumber(key: 'widthCm' | 'heightCm' | 'fontSizePt', event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    if (!Number.isFinite(input.valueAsNumber) || !input.validity.valid) {
      inputError = 'Enter a value within the displayed limits.'
      input.value = String(settings[key])
      return
    }
    inputError = ''
    change({ [key]: input.valueAsNumber, ...(key === 'widthCm' || key === 'heightCm' ? { preset: 'custom' as const } : {}) })
  }

  function changeDpi(event: Event): void {
    const dpi = Number(textValue(event))
    if (dpi !== 150 && dpi !== 300 && dpi !== 600) {
      inputError = 'Choose one of the listed resolution values.'
      return
    }
    inputError = ''
    change({ dpi })
  }

  function changeFont(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const fontFamily = input.value.trim()
    if (!/^[A-Za-z0-9 .,-]{1,80}$/.test(fontFamily)) {
      inputError = 'Enter a font family using letters, numbers, spaces, commas, periods, or hyphens.'
      input.value = settings.fontFamily
      return
    }
    inputError = ''
    change({ fontFamily })
  }

  function change(patch: Partial<ExportSettings>): void {
    onChange({ ...settings, ...patch })
  }

  function changePreset(event: Event): void {
    const preset = textValue(event) as ExportPreset
    if (preset === 'custom') change({ preset })
    else change({ preset, widthCm: EXPORT_PRESETS[preset].widthCm, heightCm: EXPORT_PRESETS[preset].heightCm })
  }

  function togglePeakColumn(id: PeakColumn, visible: boolean): void {
    const selected = new Set(settings.peakColumns)
    if (visible) selected.add(id)
    else selected.delete(id)
    change({ peakColumns: PEAK_COLUMNS.map((column) => column.id).filter((column) => selected.has(column)) })
  }

  $: hasPeakTables = ['excel-table', 'latex-table', 'pdf-report', 'latex-report', 'html'].includes(settings.format)
  $: exportLabel = FORMATS.find((format) => format.id === settings.format)?.label ?? 'Export'
</script>

<aside class="right-sidebar export-sidebar">
  <div class="panel-header">
    <h2>Export</h2>
    <button type="button" class="panel-close" aria-label="Close export settings" on:click={onClose}>x</button>
  </div>

  <div class="settings-scroll export-settings">
    <label>
      Format
      <select value={settings.format} on:change={(event) => change({ format: textValue(event) as ExportFormat })}>
        {#each FORMATS as format (format.id)}<option value={format.id}>{format.label}</option>{/each}
      </select>
    </label>

    <section class="export-controls" aria-label="Figure format settings">
      <h3>Figure layout and typography</h3>
      <label>
        Target
        <select value={settings.preset} on:change={changePreset}>
          {#each Object.entries(EXPORT_PRESETS) as [id, preset] (id)}
            <option value={id}>{preset.label} · {formatCm(preset.widthCm)} × {formatCm(preset.heightCm)} cm</option>
          {/each}
          <option value="custom">Custom dimensions</option>
        </select>
      </label>
      <div class="export-number-pair">
        <label>Width (cm)<input type="number" min={EXPORT_SIZE_LIMITS_CM.min} max={EXPORT_SIZE_LIMITS_CM.max} step="any" value={formatCm(settings.widthCm)} on:change={(event) => changeNumber('widthCm', event)} /></label>
        <label>Height (cm)<input type="number" min={EXPORT_SIZE_LIMITS_CM.min} max={EXPORT_SIZE_LIMITS_CM.max} step="any" value={formatCm(settings.heightCm)} on:change={(event) => changeNumber('heightCm', event)} /></label>
      </div>
      <label>
        Resolution
        <select value={settings.dpi} on:change={changeDpi}>
          <option value={150}>150 dpi</option>
          <option value={300}>300 dpi</option>
          <option value={600}>600 dpi</option>
        </select>
      </label>
      <label>
        Font family
        <input list="export-font-families" value={settings.fontFamily} on:change={changeFont} />
        <datalist id="export-font-families">
          <option value="Arial"></option>
          <option value="Helvetica"></option>
          <option value="Times New Roman"></option>
          <option value="Georgia"></option>
          <option value="Computer Modern"></option>
          <option value="Aptos"></option>
          <option value="IBM Plex Sans"></option>
        </datalist>
      </label>
      <div class="export-number-pair">
        <label>Font size (pt)<input type="number" min="6" max="36" step="0.5" value={settings.fontSizePt} on:change={(event) => changeNumber('fontSizePt', event)} /></label>
        <label>
          Background
          <select value={settings.background} on:change={(event) => change({ background: textValue(event) as ExportSettings['background'] })}>
            <option value="white">White</option>
            <option value="transparent">Transparent</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
      <label class="export-toggle">
        <input type="checkbox" checked={settings.showPeaks} on:change={(event) => change({ showPeaks: event.currentTarget.checked })} />
        Show peaks of all series
      </label>
      <p class="export-hint">The figure is laid out at its physical size, so the font size matches the slide or document. The preview scales it to the available space; image exports render it at the chosen resolution. 3D plots keep the current workspace camera.</p>
      {#if inputError}<p class="export-error" role="alert">{inputError}</p>{/if}
    </section>

    {#if hasPeakTables}
      <fieldset class="export-controls">
        <legend>Peak table columns</legend>
        {#each PEAK_COLUMNS as column (column.id)}
          <label class="export-toggle" title={column.hint ?? ''}>
            <input type="checkbox" checked={settings.peakColumns.includes(column.id)} on:change={(event) => togglePeakColumn(column.id, event.currentTarget.checked)} />
            {column.label}
          </label>
        {/each}
        <p class="export-hint">Intensity applies to IR bands only. The caption lists the peak detection parameters and any manually added or removed peaks.</p>
      </fieldset>
    {/if}

    <button type="button" class="run export-action" disabled={busy} on:click={onExport}>
      {busy ? 'Preparing export…' : `Export ${exportLabel}`}
    </button>
    {#if error}<p class="export-error" role="alert">{error}</p>{/if}
  </div>
</aside>

<style>
  .export-settings{display:grid;align-content:start;gap:12px;padding:8px}
  .export-settings>label,.export-controls label{display:grid;gap:5px;color:var(--text-dim);font-size:.76rem}
  .export-settings select,.export-settings input{width:100%;min-width:0;border:1px solid var(--border);border-radius:5px;background:#1c1c20;color:var(--text);padding:6px;font:inherit}
  .export-controls{display:grid;gap:10px;padding:10px;border:1px solid var(--border);border-radius:7px;background:rgba(20,20,22,.25)}
  fieldset.export-controls{margin:0;min-width:0}
  .export-controls legend{padding:0 4px;color:var(--text);font-size:.82rem;font-weight:600}
  .export-controls h3{margin:0;color:var(--text);font-size:.82rem}
  .export-number-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .export-controls label.export-toggle{display:flex;align-items:center;gap:8px;color:var(--text);cursor:pointer}
  .export-controls label.export-toggle input{width:auto}
  .export-hint{margin:0;color:var(--text-dim);font-size:.7rem;line-height:1.45}
  .export-action{width:100%;padding:8px}
  .export-error{margin:0;color:#f3b0b0;font-size:.76rem;white-space:pre-wrap}
</style>
