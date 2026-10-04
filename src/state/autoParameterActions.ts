import { get } from 'svelte/store'
import type { SmoothingSuggestion } from '../worker/messages'
import { combineSmoothingSuggestions, smoothingInput, type SmoothingAdvice } from '../services/smoothingAdvice'
import { appState, workerClient } from './projectContext'

/** Ask the worker for Savitzky–Golay parameters suited to the given samples, or to all of them. */
export async function adviseSmoothing(scope: string[] | 'all'): Promise<SmoothingAdvice> {
  const all = get(appState).datasets
  const datasets = scope === 'all' ? all : all.filter((dataset) => scope.includes(dataset.id))
  const suggestions: SmoothingSuggestion[] = []
  for (const dataset of datasets) {
    const response = await workerClient.suggestSmoothing({ spectrumId: dataset.id, ordinate: smoothingInput(dataset) })
    if (response.type === 'error') throw new Error(response.message)
    if (response.type === 'smoothing_suggestion') suggestions.push(response.suggestion)
  }
  return combineSmoothingSuggestions(suggestions)
}
