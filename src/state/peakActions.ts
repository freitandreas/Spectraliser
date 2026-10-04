import { get } from 'svelte/store'
import type { Peak, PeakDetectionOptions } from '../types/project'
import { appState, workerClient, scheduleAutosave } from './projectContext'
import { invalidateScriptResult } from './scriptActions'

export async function detectPeaks(datasetId: string, options: PeakDetectionOptions): Promise<void> {
  const dataset = get(appState).datasets.find((item) => item.id === datasetId)
  if (!dataset) {
    return
  }

  appState.update((current) => ({
    ...current,
    workerBusy: true,
    workerLastError: null,
  }))

  appState.update((current) => ({
    ...current,
    datasets: current.datasets.map((item) => item.id === datasetId
      ? { ...item, peakDetection: { ...options } }
      : item),
  }))

  try {
    const [processedResponse, originalResponse] = await Promise.all([
      workerClient.detectPeaks({
        spectrumId: dataset.id,
        abscissa: dataset.data.abscissa,
        ordinate: dataset.data.ordinateModified,
        prominence: Math.abs(options.prominence),
        minDistance: options.minDistance,
        minHeight: options.minHeight,
        mode: options.mode,
      }),
      workerClient.detectPeaks({
        spectrumId: dataset.id,
        abscissa: dataset.data.abscissa,
        ordinate: dataset.data.ordinateOriginal,
        prominence: Math.abs(options.prominence),
        minDistance: options.minDistance,
        minHeight: options.minHeight,
        mode: options.mode,
      }),
    ])

    if (processedResponse.type !== 'peaks_result') {
      appState.update((current) => ({
        ...current,
        workerBusy: false,
        workerLastError: processedResponse.type === 'error' ? processedResponse.message : current.workerLastError,
      }))
      return
    }

    // Peaks already found on the processed curve take priority; original-only peaks are added as unchecked rows.
    const processedIndices = new Set(processedResponse.peaks.map((peak) => peak.index))
    const originalOnlyPeaks = originalResponse.type === 'peaks_result'
      ? originalResponse.peaks.filter((peak) => !processedIndices.has(peak.index))
      : []

    appState.update((current) => {
      const datasets = current.datasets.map((item) => {
        if (item.id !== datasetId) {
          return item
        }

        // Auto-detected peaks are replaced on re-run; manually added peaks are preserved.
        const manualPeaks = item.peaks.filter((peak) => peak.source === 'manual')
        const autoProcessedPeaks: Peak[] = processedResponse.peaks.map((peak) => ({
          id: crypto.randomUUID(),
          index: peak.index,
          x: peak.x,
          y: peak.y,
          label: peak.x.toFixed(2),
          source: 'auto',
          prominence: peak.prominence,
          enabled: true,
          dataOrigin: 'processed',
        }))
        const autoOriginalPeaks: Peak[] = originalOnlyPeaks.map((peak) => ({
          id: crypto.randomUUID(),
          index: peak.index,
          x: peak.x,
          y: peak.y,
          label: peak.x.toFixed(2),
          source: 'auto',
          prominence: peak.prominence,
          enabled: false,
          dataOrigin: 'original',
        }))

        return {
          ...item,
          peaks: [...manualPeaks, ...autoProcessedPeaks, ...autoOriginalPeaks].sort((a, b) => a.x - b.x),
        }
      })

      const nextState = {
        ...current,
        datasets,
        workerBusy: false,
        updatedAt: new Date().toISOString(),
      }
      scheduleAutosave(nextState)
      return nextState
    })
    // Detection replaced the auto peaks; IR band labels come from the script, so it must run again.
    if (dataset.spectrumType === 'ir') invalidateScriptResult(datasetId)
  } catch (error) {
    appState.update((current) => ({
      ...current,
      workerBusy: false,
      workerLastError: error instanceof Error ? error.message : 'Peak detection failed',
    }))
  }
}

export function setPeakDetectionMode(datasetId: string, mode: 'maxima' | 'minima'): void {
  appState.update((state) => ({
    ...state,
    datasets: state.datasets.map((dataset) => dataset.id === datasetId
      ? { ...dataset, peakDetection: { ...(dataset.peakDetection ?? { prominence: 0.01, minDistance: 1, minHeight: null, mode: 'maxima' }), mode } }
      : dataset),
    updatedAt: new Date().toISOString(),
  }))
}

export function updatePeakDetectionSettings(
  datasetId: string,
  settings: { prominence: number; minDistance: number; minHeight: number | null; mode: 'maxima' | 'minima' },
): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => dataset.id === datasetId
      ? { ...dataset, peakDetection: { ...settings } }
      : dataset)
    const nextState = { ...state, datasets, updatedAt: new Date().toISOString() }
    scheduleAutosave(nextState)
    return nextState
  })
}

export async function computePeakHeatmap(
  datasetId: string,
  params: { prominenceValues: number[]; distanceValues: number[]; minHeight: number | null; mode: 'maxima' | 'minima' },
): Promise<number[][] | null> {
  const dataset = get(appState).datasets.find((item) => item.id === datasetId)
  if (!dataset) {
    return null
  }

  const response = await workerClient.computePeakHeatmap({
    spectrumId: dataset.id,
    abscissa: dataset.data.abscissa,
    ordinate: dataset.data.ordinateModified,
    prominenceValues: params.prominenceValues.map((value) => Math.abs(value)),
    distanceValues: params.distanceValues,
    minHeight: params.minHeight,
    mode: params.mode,
  })

  return response.type === 'peaks_heatmap_result' ? response.counts : null
}

export function addPeakAtIndex(datasetId: string, index: number): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => {
      if (dataset.id !== datasetId) {
        return dataset
      }

      const x = dataset.data.abscissa[index]
      const y = dataset.data.ordinateModified[index]
      if (x === undefined || y === undefined || Number.isNaN(y) || dataset.peaks.some((peak) => peak.index === index)) {
        return dataset
      }

      const peak: Peak = {
        id: crypto.randomUUID(),
        index,
        x,
        y,
        label: x.toFixed(2),
        source: 'manual',
        enabled: true,
        dataOrigin: 'processed',
      }

      return { ...dataset, peaks: [...dataset.peaks, peak].sort((a, b) => a.x - b.x) }
    })

    const nextState = { ...state, datasets, updatedAt: new Date().toISOString() }
    scheduleAutosave(nextState)
    return nextState
  })
}

export function setPeakEnabled(datasetId: string, peakId: string, enabled: boolean): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => {
      if (dataset.id !== datasetId) {
        return dataset
      }

      return {
        ...dataset,
        peaks: dataset.peaks.map((peak) => (peak.id === peakId ? { ...peak, enabled } : peak)),
      }
    })

    const nextState = { ...state, datasets, updatedAt: new Date().toISOString() }
    scheduleAutosave(nextState)
    return nextState
  })
}

export function removePeak(datasetId: string, peakId: string): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) =>
      dataset.id === datasetId
        ? { ...dataset, peaks: dataset.peaks.filter((peak) => peak.id !== peakId) }
        : dataset,
    )

    const nextState = { ...state, datasets, updatedAt: new Date().toISOString() }
    scheduleAutosave(nextState)
    return nextState
  })
}

export function clearPeaks(datasetId: string): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) =>
      dataset.id === datasetId ? { ...dataset, peaks: [] } : dataset,
    )

    const nextState = { ...state, datasets, updatedAt: new Date().toISOString() }
    scheduleAutosave(nextState)
    return nextState
  })
}

export function updatePeakLabel(datasetId: string, peakId: string, label: string): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => {
      if (dataset.id !== datasetId) {
        return dataset
      }

      return {
        ...dataset,
        peaks: dataset.peaks.map((peak) => (peak.id === peakId ? { ...peak, label, labelEdited: true } : peak)),
      }
    })

    const nextState = { ...state, datasets, updatedAt: new Date().toISOString() }
    scheduleAutosave(nextState)
    return nextState
  })
}
