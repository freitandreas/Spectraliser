import { projectStore } from './projectStore'
import { removeAllDatasets as removeAll, updateAllStyles } from './datasetActions'
import { resetScriptExecutionCache } from './scriptActions'
import { resetRuntime } from './runtimeState'

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
  removeAll()
  resetScriptExecutionCache()
  resetRuntime()
}

export function setAllDatasetsVisible(queue: QueueGuiAction, visible: boolean): void {
  queue(() => updateAllStyles({ visible }))
}
