import { get } from 'svelte/store'
import type { NormalizationMode } from '../types/project'
import { appState } from './projectContext'
import { projectStore } from './projectStore'
import { COLOR_PALETTES } from '../lib/workbench/workbenchUtils'

export interface GlobalApplyContext {
  /** Wraps an action in the desync confirmation flow owned by the shell. */
  queueGuiAction: (action: () => void) => void
  requestGlobalApply: (action: () => void) => void
}

export function applyGlobalPalette(context: GlobalApplyContext, paletteId: string): void {
  const palette = COLOR_PALETTES.find((entry) => entry.id === paletteId)
  if (!palette || palette.colors.length === 0) return

  const datasets = get(appState).datasets
  context.requestGlobalApply(() => {
    datasets.forEach((dataset, index) => {
      projectStore.updateStyle(dataset.id, { lineColor: palette.colors[index % palette.colors.length] })
    })
  })
}

export function applyGlobalLineWidth(context: GlobalApplyContext, width: number): void {
  const datasets = get(appState).datasets
  context.requestGlobalApply(() => {
    datasets.forEach((dataset) => projectStore.updateStyle(dataset.id, { lineWidth: width }))
  })
}

export function applyGlobalNormalization(context: GlobalApplyContext, mode: NormalizationMode): void {
  context.requestGlobalApply(() => {
    projectStore.updateTransformGlobal('normalize-1', { scope: 'global', params: { mode } })
  })
}

export function applyGlobalSmoothing(
  context: GlobalApplyContext,
  windowLength: number,
  polyorder: number,
): void {
  context.requestGlobalApply(() => {
    projectStore.updateTransformGlobal('smooth-1', {
      scope: 'global',
      params: { window_length: windowLength, polyorder },
    })
  })
}

export function applyGlobalAxisMetadata(
  context: GlobalApplyContext,
  metadata: { xQuantity: string; xUnit: string; yQuantity: string; yUnit: string },
): void {
  const datasets = get(appState).datasets
  context.requestGlobalApply(() => {
    datasets.forEach((dataset) => projectStore.updateDatasetMetadata(dataset.id, {
      units: {
        x: metadata.xUnit,
        y: metadata.yUnit,
        xQuantity: metadata.xQuantity,
        yQuantity: metadata.yQuantity,
      },
    }))
  })
}

export function setTransformEnabled(
  context: GlobalApplyContext,
  datasetId: string,
  transformId: string,
  enabled: boolean,
  scope: 'no' | 'individual' | 'global',
): void {
  context.queueGuiAction(() => {
    if (scope === 'global') {
      projectStore.updateTransformGlobal(transformId, { enabled })
      return
    }
    projectStore.updateTransform(datasetId, transformId, { enabled })
  })
}

export function setTransformParams(
  context: GlobalApplyContext,
  datasetId: string,
  transformId: string,
  params: Record<string, number | string | boolean>,
  currentScope: 'no' | 'individual' | 'global',
): void {
  context.queueGuiAction(() => {
    if (currentScope === 'global') {
      projectStore.updateTransformGlobal(transformId, { params })
      return
    }
    projectStore.updateTransform(datasetId, transformId, { params })
  })
}

export function removeAllDatasets(): void {
  const datasets = get(appState).datasets
  datasets.forEach((dataset) => projectStore.removeDataset(dataset.id))
}

export function setAllDatasetsVisible(context: GlobalApplyContext, visible: boolean): void {
  const datasets = get(appState).datasets
  context.queueGuiAction(() => {
    datasets.forEach((dataset) => projectStore.updateStyle(dataset.id, { visible }))
  })
}
