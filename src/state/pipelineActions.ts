import { get } from 'svelte/store'
import type { TransformDefinition } from '../types/project'
import { appState, commitDatasets } from './projectContext'
import { executeScriptForDatasets } from './scriptActions'

/** Recomputes one sample through the same Python modules the script editor runs. */
export async function rerunPipeline(datasetId: string): Promise<void> {
  if (!get(appState).datasets.some((dataset) => dataset.id === datasetId)) {
    return
  }

  await executeScriptForDatasets([datasetId])
}

function patchStep(step: TransformDefinition, partial: Partial<TransformDefinition>): TransformDefinition {
  return {
    ...step,
    ...partial,
    params: {
      ...step.params,
      ...(partial.params ?? {}),
    },
  }
}

export function updateTransform(
  datasetId: string,
  transformId: string,
  partial: Partial<TransformDefinition>,
): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) =>
      dataset.id === datasetId
        ? {
            ...dataset,
            pipeline: dataset.pipeline.map((step) => (step.id === transformId ? patchStep(step, partial) : step)),
          }
        : dataset,
    )

    return commitDatasets(state, datasets)
  })
}
