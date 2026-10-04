import { get } from 'svelte/store'
import { DEFAULT_PEAK_DETECTION, type Peak, type PeakDetectionOptions } from '../types/project'
import { appState, workerClient, updateDataset } from './projectContext'
import { patchRuntime } from './runtimeState'
import { invalidateScriptResult } from './scriptActions'

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

export async function detectPeaks(datasetId: string, options: PeakDetectionOptions): Promise<void> {
  const dataset = get(appState).datasets.find((item) => item.id === datasetId)
  if (!dataset) return

  patchRuntime({ workerBusy: true, workerLastError: null })
  updateDataset(datasetId, (item) => ({ ...item, peakDetection: { ...options } }))

  try {
    const response = await workerClient.detectPeaks({
      spectrumId: dataset.id,
      abscissa: dataset.data.abscissa,
      ordinate: dataset.data.ordinateModified,
      prominence: Math.abs(options.prominence),
      minDistance: options.minDistance,
      minHeight: options.minHeight,
      mode: options.mode,
      auto: options.auto === true,
    })
    if (response.type !== 'peaks_result') {
      patchRuntime((current) => ({
        workerBusy: false,
        workerLastError: response.type === 'error' ? response.message : current.workerLastError,
      }))
      return
    }

    const sign = options.mode === 'minima' ? -1 : 1
    // Auto-detected peaks are replaced on re-run; manually added peaks are preserved.
    updateDataset(datasetId, (item) => ({
      ...item,
      // Automatic mode stores the values it resolved so the panel can show what was used.
      peakDetection: options.auto
        ? { ...options, prominence: sign * response.settings.prominence, minDistance: response.settings.minDistance }
        : item.peakDetection,
      peaks: [
        ...item.peaks.filter((peak) => peak.source === 'manual'),
        ...response.peaks.map(autoPeak),
      ].sort((a, b) => a.x - b.x),
    }))
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
    peakDetection: { ...(dataset.peakDetection ?? DEFAULT_PEAK_DETECTION), mode },
  }))
}

export function updatePeakDetectionSettings(datasetId: string, settings: PeakDetectionOptions): void {
  updateDataset(datasetId, (dataset) => ({ ...dataset, peakDetection: { ...settings } }))
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
  updateDataset(datasetId, (dataset) => ({ ...dataset, peaks: dataset.peaks.filter((peak) => peak.id !== peakId) }))
}

export function clearPeaks(datasetId: string): void {
  updateDataset(datasetId, (dataset) => ({ ...dataset, peaks: [] }))
}
