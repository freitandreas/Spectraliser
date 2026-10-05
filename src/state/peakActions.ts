import { get } from 'svelte/store'
import { peakDetectionFor, type Peak, type PeakDetectionOptions, type SpectrumDataset } from '../types/project'
import { appState, workerClient, updateDataset, updateProject } from './projectContext'
import { patchRuntime } from './runtimeState'
import { afterPaint, withActivity } from './activityState'
import { executeScriptForDatasets, invalidateScriptResult } from './scriptActions'

type DetectedPeak = { index: number; x: number; y: number; prominence?: number }

function autoPeak(peak: DetectedPeak): Peak {
  return {
    id: crypto.randomUUID(),
    index: peak.index,
    x: peak.x,
    y: peak.y,
    label: peak.x.toFixed(2),
    source: 'auto',
    prominence: peak.prominence,
    enabled: true,
  }
}

type PeaksResponse = Extract<Awaited<ReturnType<typeof workerClient.detectPeaks>>, { type: 'peaks_result' }>

function requestPeaks(dataset: SpectrumDataset, options: PeakDetectionOptions) {
  return workerClient.detectPeaks({
    spectrumId: dataset.id,
    abscissa: dataset.data.abscissa,
    ordinate: dataset.data.ordinateModified,
    prominence: Math.abs(options.prominence),
    minDistance: options.minDistance,
    minHeight: options.minHeight,
    mode: options.mode,
    auto: options.auto === true,
  })
}

/** Replaces the auto-detected peaks (manual peaks are preserved) and records the settings used. */
function withDetectedPeaks(item: SpectrumDataset, options: PeakDetectionOptions, response: PeaksResponse): SpectrumDataset {
  const sign = options.mode === 'minima' ? -1 : 1
  return {
    ...item,
    // Automatic mode stores the values it resolved so the panel can show what was used.
    peakDetection: options.auto
      ? { ...options, prominence: sign * response.settings.prominence, minDistance: response.settings.minDistance }
      : item.peakDetection,
    removedPeakCount: 0,
    peaks: [
      ...item.peaks.filter((peak) => peak.source === 'manual'),
      ...response.peaks.map(autoPeak),
    ].sort((a, b) => a.x - b.x),
  }
}

export async function detectPeaks(datasetId: string, options: PeakDetectionOptions): Promise<void> {
  const dataset = get(appState).datasets.find((item) => item.id === datasetId)
  if (!dataset) return
  options = peakDetectionFor(dataset.spectrumType, options)

  patchRuntime({ workerBusy: true, workerLastError: null })
  updateDataset(datasetId, (item) => ({ ...item, peakDetection: { ...options } }))

  try {
    const response = await requestPeaks(dataset, options)
    if (response.type !== 'peaks_result') {
      patchRuntime((current) => ({
        workerBusy: false,
        workerLastError: response.type === 'error' ? response.message : current.workerLastError,
      }))
      return
    }
    updateDataset(datasetId, (item) => withDetectedPeaks(item, options, response))
    patchRuntime({ workerBusy: false })
    // Detection replaced the auto peaks; IR band labels come from the script, so it must run again.
    if (dataset.spectrumType === 'ir') invalidateScriptResult(datasetId)
  } catch (error) {
    patchRuntime({ workerBusy: false, workerLastError: error instanceof Error ? error.message : 'Peak detection failed' })
  }
}

export function setPeakDetectionMode(datasetId: string, mode: 'maxima' | 'minima'): void {
  updateDataset(datasetId, (dataset) => ({
    ...dataset,
    peakDetection: peakDetectionFor(dataset.spectrumType, { ...peakDetectionFor(dataset.spectrumType, dataset.peakDetection), mode }),
  }))
}

export function updatePeakDetectionSettings(datasetId: string, settings: PeakDetectionOptions): void {
  updateDataset(datasetId, (dataset) => ({ ...dataset, peakDetection: peakDetectionFor(dataset.spectrumType, { ...settings }) }))
}

export function addPeakAtIndex(datasetId: string, index: number): void {
  updateDataset(datasetId, (dataset) => {
    const x = dataset.data.abscissa[index]
    const y = dataset.data.ordinateModified[index]
    if (x === undefined || y === undefined || Number.isNaN(y) || dataset.peaks.some((peak) => peak.index === index)) {
      return dataset
    }
    const peak: Peak = { id: crypto.randomUUID(), index, x, y, label: x.toFixed(2), source: 'manual', enabled: true }
    return { ...dataset, peaks: [...dataset.peaks, peak].sort((a, b) => a.x - b.x) }
  })
}

function updatePeak(datasetId: string, peakId: string, mutate: (peak: Peak) => Peak): void {
  updateDataset(datasetId, (dataset) => ({
    ...dataset,
    peaks: dataset.peaks.map((peak) => (peak.id === peakId ? mutate(peak) : peak)),
  }))
}

export function setPeakEnabled(datasetId: string, peakId: string, enabled: boolean): void {
  updatePeak(datasetId, peakId, (peak) => ({ ...peak, enabled }))
}

export function updatePeakLabel(datasetId: string, peakId: string, label: string): void {
  updatePeak(datasetId, peakId, (peak) => ({ ...peak, label, labelEdited: true }))
}

export function removePeak(datasetId: string, peakId: string): void {
  updateDataset(datasetId, (dataset) => {
    const peak = dataset.peaks.find((item) => item.id === peakId)
    if (!peak) return dataset
    return {
      ...dataset,
      peaks: dataset.peaks.filter((item) => item.id !== peakId),
      removedPeakCount: (dataset.removedPeakCount ?? 0) + (peak.source === 'auto' ? 1 : 0),
    }
  })
}

export function clearPeaks(datasetId: string): void {
  updateDataset(datasetId, (dataset) => ({
    ...dataset,
    peaks: [],
    removedPeakCount: (dataset.removedPeakCount ?? 0) + dataset.peaks.filter((peak) => peak.source === 'auto').length,
  }))
}

/**
 * Detects peaks with automatic parameters on freshly imported samples. The
 * processing script runs first so detection sees the processed signal; the second
 * call waits for a run that was already in progress before ours was queued.
 */
export async function detectPeaksAfterImport(datasetIds: string[]): Promise<void> {
  if (datasetIds.length === 0) return
  await executeScriptForDatasets(datasetIds)
  await executeScriptForDatasets(datasetIds)
  // Results are collected first and committed in one store update, so the plot re-renders once.
  const detected = new Map<string, { options: PeakDetectionOptions; response: PeaksResponse; signal: number[] }>()
  await withActivity('Detecting peaks', async (activity) => {
    for (const [position, id] of datasetIds.entries()) {
      const dataset = get(appState).datasets.find((item) => item.id === id)
      activity.update({ completed: position, message: `Detecting peaks · ${dataset ? dataset.style.label || dataset.name : ''}` })
      if (!dataset) continue
      const options = { ...peakDetectionFor(dataset.spectrumType, dataset.peakDetection), auto: true }
      try {
        const response = await requestPeaks(dataset, options)
        if (response.type === 'peaks_result') detected.set(id, { options, response, signal: dataset.data.ordinateModified })
        else if (response.type === 'error') patchRuntime({ workerLastError: response.message })
      } catch (error) {
        patchRuntime({ workerLastError: error instanceof Error ? error.message : 'Peak detection failed' })
      }
      if (position % 8 === 7) await afterPaint()
    }
    activity.update({ completed: datasetIds.length, message: 'Applying detected peaks' })
    await afterPaint()
  }, datasetIds.length)

  const irIds: string[] = []
  updateProject((state) => {
    let changed = false
    const datasets = state.datasets.map((item) => {
      const entry = detected.get(item.id)
      // A signal changed since detection would misplace the peaks; the user can re-detect.
      if (!entry || item.data.ordinateModified !== entry.signal) return item
      changed = true
      if (item.spectrumType === 'ir') irIds.push(item.id)
      return withDetectedPeaks(item, entry.options, entry.response)
    })
    return changed ? { ...state, datasets } : state
  })
  // IR band assignments come from the script, which must run again on the new peaks.
  for (const id of irIds) invalidateScriptResult(id)
  if (irIds.length > 0) await executeScriptForDatasets(irIds)
}
