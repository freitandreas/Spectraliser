import { get } from 'svelte/store'
import { appState } from './projectContext'
import { projectStore } from './projectStore'
import { resetScriptExecutionCache } from './scriptActions'

/** Wraps an action in the desync confirmation flow owned by the shell. */
export type QueueGuiAction = (action: () => void) => void

export function setTransformEnabled(queue: QueueGuiAction, datasetId: string, transformId: string, enabled: boolean): void {
  queue(() => projectStore.updateTransform(datasetId, transformId, { enabled }))
}

export function setTransformParams(
  queue: QueueGuiAction,
  datasetId: string,
  transformId: string,
  params: Record<string, number | string | boolean>,
): void {
  queue(() => projectStore.updateTransform(datasetId, transformId, { params }))
}

export function removeAllDatasets(): void {
  const datasets = get(appState).datasets
  datasets.forEach((dataset) => projectStore.removeDataset(dataset.id))
  resetScriptExecutionCache()
}

export function setAllDatasetsVisible(queue: QueueGuiAction, visible: boolean): void {
  const datasets = get(appState).datasets
  queue(() => {
    datasets.forEach((dataset) => projectStore.updateStyle(dataset.id, { visible }))
  })
}
