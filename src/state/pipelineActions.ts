import { get } from 'svelte/store'
import type { TransformDefinition } from '../types/project'
import { appState, commitDatasets } from './projectContext'
import { effectivePythonFiles } from '../services/script/scriptGenerator'
import { executeScriptForDatasets } from './scriptActions'

function currentMainScript(): string {
  const state = get(appState)
  const files = effectivePythonFiles(state.datasets, state.generatedScript, state.pythonFileOverrides ?? {})
  return state.userScriptOverride ?? files['main.py']
}

/** Recomputes one sample through the same Python modules the script editor runs. */
export async function rerunPipeline(datasetId: string): Promise<void> {
  if (!get(appState).datasets.some((dataset) => dataset.id === datasetId)) {
    return
  }

  await executeScriptForDatasets(currentMainScript(), [datasetId])
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

export function updateTransformGlobal(
  transformId: string,
  partial: Partial<TransformDefinition>,
): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => ({
      ...dataset,
      pipeline: dataset.pipeline.map((step) => (step.id === transformId ? patchStep(step, partial) : step)),
    }))

    return commitDatasets(state, datasets)
  })
}
