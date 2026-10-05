import type { AppState, PeakDetectionOptions, SpectrumDataset, SpectrumType, TransformDefinition } from '../../types/project'
import { deriveGeneralSettings, stepsEquivalent, stepTitle } from '../generalSettings'
import { peakShape } from '../peakShape'

export interface ReportTable {
  headers: string[]
  rows: string[][]
}

export interface ProcessingRow {
  step: string
  status: string
  parameters: string
}

export interface PeakTable extends ReportTable {
  /** States the detection parameters and any manual changes to the detected peaks. */
  caption: string
}

export interface SampleReport {
  id: string
  name: string
  metadata: Array<[string, string]>
  /** Processing steps whose settings differ from the general pipeline; empty when none do. */
  differences: ProcessingRow[]
  peaks: PeakTable
}

export interface ReportContent {
  title: string
  generated: string
  /** Facts shared by every sample, such as the spectrum type and axes. */
  overview: Array<[string, string]>
  processing: ProcessingRow[]
  /** Set when edited Python sources may have changed the processing. */
  pythonNote: string | null
  samples: SampleReport[]
}

export type PeakColumn = 'position' | 'ordinate' | 'prominence' | 'fwhm' | 'area' | 'intensity' | 'assignment'

export const PEAK_COLUMNS: ReadonlyArray<{ id: PeakColumn; label: string; hint?: string }> = [
  { id: 'position', label: 'Position (abscissa)' },
  { id: 'ordinate', label: 'Ordinate value' },
  { id: 'prominence', label: 'Prominence' },
  { id: 'fwhm', label: 'FWHM' },
  { id: 'area', label: 'Area' },
  { id: 'intensity', label: 'Intensity (w/m/s)', hint: 'IR band strength; omitted for samples without it.' },
  { id: 'assignment', label: 'Assignment' },
]

export const DEFAULT_PEAK_COLUMNS: PeakColumn[] = ['position', 'ordinate', 'intensity', 'assignment']

export interface ReportOptions {
  peakColumns?: readonly PeakColumn[]
  generated?: Date
}

export const PROCESSING_HEADERS = ['Step', 'Status', 'Parameters'] as const
export const GENERAL_SECTION_TITLE = 'Measurement and processing'
export const GENERAL_SECTION_INTRO = 'Applies to every sample unless the sample section lists a deviation.'

const SPECTRUM_TYPE_LABELS: Record<SpectrumType, string> = { 'uv-vis': 'UV-Vis', ir: 'IR', raman: 'Raman' }

function formatParameter(value: number | string | boolean): string {
  if (typeof value === 'number') return String(Number(value.toPrecision(6)))
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return value
}

function parameterText(params: TransformDefinition['params']): string {
  const entries = Object.entries(params).map(([name, value]) => `${name.replace(/_/g, ' ')}: ${formatParameter(value)}`)
  return entries.length > 0 ? entries.join(', ') : '—'
}

function processingRow(step: TransformDefinition): ProcessingRow {
  return {
    step: stepTitle(step.type),
    status: step.enabled ? 'Applied' : 'Off',
    parameters: step.enabled ? parameterText(step.params) : '—',
  }
}

function detectionText(options: PeakDetectionOptions | undefined): ProcessingRow {
  const detection = options ?? null
  const mode = detection?.mode === 'minima' ? 'minima' : 'maxima'
  if (!detection || detection.auto !== false) {
    return { step: 'Peak detection', status: 'Automatic', parameters: `${mode}; prominence and minimum spacing derived from the noise level and band widths` }
  }
  const height = detection.minHeight === null ? '' : `, minimum height: ${formatParameter(detection.minHeight)}`
  return {
    step: 'Peak detection',
    status: 'Manual',
    parameters: `${mode}; prominence: ${formatParameter(Math.abs(detection.prominence))}, minimum distance: ${formatParameter(detection.minDistance)} points${height}`,
  }
}

function sameDetection(left: PeakDetectionOptions | undefined, right: PeakDetectionOptions | undefined): boolean {
  return detectionText(left).status === detectionText(right).status && detectionText(left).parameters === detectionText(right).parameters
}

export function sampleName(dataset: SpectrumDataset): string {
  return dataset.style.label || dataset.name
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return Math.abs(value) >= 1e4 || (value !== 0 && Math.abs(value) < 1e-3) ? value.toExponential(3) : value.toPrecision(4)
}

function unitSuffix(unit: string): string {
  return unit.trim() ? ` / ${unit.trim()}` : ''
}

function columnHeader(column: PeakColumn, dataset: SpectrumDataset): string {
  switch (column) {
    case 'position': return `${dataset.units.xQuantity || 'Position'}${unitSuffix(dataset.units.x)}`
    case 'ordinate': return `${dataset.units.yQuantity || 'Ordinate'}${unitSuffix(dataset.units.y)}`
    case 'prominence': return `Prominence${unitSuffix(dataset.units.y)}`
    case 'fwhm': return `FWHM${unitSuffix(dataset.units.x)}`
    case 'area': return 'Area'
    case 'intensity': return 'Intensity'
    case 'assignment': return 'Assignment'
  }
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** Detection parameters plus the manual edits that make the table differ from a plain detection run. */
export function peakCaption(dataset: SpectrumDataset): string {
  const detection = dataset.peakDetection
  const mode = detection?.mode === 'minima' ? 'minima' : 'maxima'
  const values = detection
    ? `prominence ${formatParameter(Math.abs(detection.prominence))}, minimum distance ${plural(detection.minDistance, 'point')}${detection.minHeight === null ? '' : `, minimum height ${formatParameter(detection.minHeight)}`}`
    : ''
  const method = !detection
    ? `Detection of ${mode}.`
    : detection.auto !== false
      ? `Automatic detection of ${mode} (${values}; derived from the noise level and band widths).`
      : `Detection of ${mode} with ${values}.`
  const added = dataset.peaks.filter((peak) => peak.source === 'manual' && peak.enabled !== false).length
  const removed = dataset.peaks.filter((peak) => peak.enabled === false).length + (dataset.removedPeakCount ?? 0)
  const edits = [
    added > 0 ? `${plural(added, 'peak')} added manually` : '',
    removed > 0 ? `${plural(removed, 'detected peak')} removed manually` : '',
  ].filter(Boolean)
  return `Peaks of ${sampleName(dataset)}. ${method}${edits.length ? ` ${edits.join('; ')}.` : ''}`
}

export function peakTable(dataset: SpectrumDataset, columns: readonly PeakColumn[] = DEFAULT_PEAK_COLUMNS): PeakTable {
  const mode = dataset.peakDetection?.mode ?? 'maxima'
  const peaks = dataset.peaks.filter((peak) => peak.enabled !== false)
  const hasIntensity = peaks.some((peak) => peak.intensity !== undefined)
  // Columns follow the canonical order; intensity is an IR band strength and is omitted where it does not exist.
  const shown = PEAK_COLUMNS.map((column) => column.id)
    .filter((column) => columns.includes(column) && (column !== 'intensity' || hasIntensity))
  const needsShape = shown.some((column) => column === 'prominence' || column === 'fwhm' || column === 'area')
  const indices = peaks.map((peak) => peak.index).sort((a, b) => a - b)
  const rows = peaks.map((peak) => {
    const position = indices.indexOf(peak.index)
    const shape = needsShape
      ? peakShape(dataset.data.abscissa, dataset.data.ordinateModified, peak.index, mode, {
          previous: indices[position - 1],
          next: indices[position + 1],
        })
      : null
    const cell = (column: PeakColumn): string => {
      switch (column) {
        case 'position': return peak.x.toFixed(3)
        case 'ordinate': return formatNumber(dataset.data.ordinateModified[peak.index] ?? peak.y)
        case 'prominence': return formatNumber(shape?.prominence)
        case 'fwhm': return formatNumber(shape?.fwhm)
        case 'area': return formatNumber(shape?.area)
        case 'intensity': return peak.intensity ?? '—'
        case 'assignment': return peak.label || '—'
      }
    }
    return shown.map(cell)
  })
  return { headers: shown.map((column) => columnHeader(column, dataset)), rows, caption: peakCaption(dataset) }
}

function spectrumTypeSummary(datasets: SpectrumDataset[]): string {
  const counts = new Map<SpectrumType, number>()
  for (const dataset of datasets) counts.set(dataset.spectrumType, (counts.get(dataset.spectrumType) ?? 0) + 1)
  if (counts.size === 1) return SPECTRUM_TYPE_LABELS[datasets[0].spectrumType]
  return [...counts].map(([type, count]) => `${SPECTRUM_TYPE_LABELS[type]} (${count})`).join(', ')
}

function axisText(quantity: string, unit: string): string {
  return `${quantity || '—'}${unitSuffix(unit)}`
}

function sharedValue(datasets: SpectrumDataset[], value: (dataset: SpectrumDataset) => string): string | null {
  const first = datasets[0] ? value(datasets[0]) : null
  return first !== null && datasets.every((dataset) => value(dataset) === first) ? first : null
}

function overviewFields(datasets: SpectrumDataset[]): Array<[string, string]> {
  if (datasets.length === 0) return [['Samples', '0']]
  const fields: Array<[string, string]> = [
    ['Spectrum type', spectrumTypeSummary(datasets)],
    ['Samples', String(datasets.length)],
  ]
  const abscissa = sharedValue(datasets, (dataset) => axisText(dataset.units.xQuantity, dataset.units.x))
  const ordinate = sharedValue(datasets, (dataset) => axisText(dataset.units.yQuantity, dataset.units.y))
  if (abscissa) fields.push(['Abscissa', abscissa])
  if (ordinate) fields.push(['Ordinate', ordinate])
  return fields
}

function sampleMetadata(dataset: SpectrumDataset, sharedType: boolean): Array<[string, string]> {
  const fields: Array<[string, string]> = [
    ['Source file', dataset.sourcePath || dataset.name],
    ...(sharedType ? [] : [['Spectrum type', SPECTRUM_TYPE_LABELS[dataset.spectrumType]] as [string, string]]),
    ['Data points', String(dataset.data.abscissa.length)],
  ]
  for (const [key, value] of Object.entries(dataset.experimentMetadata ?? {})) {
    if (value !== null && value.trim()) fields.push([key, value.trim()])
  }
  return fields
}

export function customPythonNote(state: AppState): string | null {
  const files = new Set(Object.keys(state.pythonFileOverrides ?? {}))
  if (state.userScriptOverride !== null) files.add('main.py')
  if (files.size === 0) return null
  return `Edited Python sources were used for processing (${[...files].sort().join(', ')}); the settings above describe the generated pipeline.`
}

/** The single source for every report and table export, so all formats state the same facts. */
export function buildReportContent(state: AppState, options: ReportOptions = {}): ReportContent {
  const columns = options.peakColumns ?? DEFAULT_PEAK_COLUMNS
  const general = state.generalSettings ?? deriveGeneralSettings(state.datasets, state.projectSpectrumType)
  const generalDetection = state.datasets[0]?.peakDetection
  const commonDetection = state.datasets.every((dataset) => sameDetection(dataset.peakDetection, generalDetection))
  const sharedType = new Set(state.datasets.map((dataset) => dataset.spectrumType)).size <= 1
  const processing = [
    ...general.pipeline.map(processingRow),
    commonDetection ? detectionText(generalDetection) : { step: 'Peak detection', status: 'Per sample', parameters: 'See the sample sections' },
  ]
  const samples = state.datasets.map((dataset): SampleReport => {
    const differences = general.pipeline.flatMap((generalStep) => {
      const step = dataset.pipeline.find((item) => item.type === generalStep.type)
      // A step missing from the sample pipeline is not applied, which matches a disabled general step.
      if (step ? stepsEquivalent(step, generalStep) : !generalStep.enabled) return []
      return [step ? processingRow(step) : { step: stepTitle(generalStep.type), status: 'Off', parameters: '—' }]
    })
    if (!commonDetection) differences.push(detectionText(dataset.peakDetection))
    return {
      id: dataset.id,
      name: sampleName(dataset),
      metadata: sampleMetadata(dataset, sharedType),
      differences,
      peaks: peakTable(dataset, columns),
    }
  })
  return {
    title: state.projectName,
    generated: (options.generated ?? new Date()).toLocaleString(),
    overview: overviewFields(state.datasets),
    processing,
    pythonNote: customPythonNote(state),
    samples,
  }
}
