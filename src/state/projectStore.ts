import { derived, get } from 'svelte/store'
import type { AppState } from '../types/project'
import { appState } from './projectContext'
import { rerunPipeline, updateTransform, updateTransformGlobal } from './pipelineActions'
import { executeScriptForDatasets, setScriptOverride, setPythonFileOverride, revertScriptToGuiState, confirmOverwriteForGuiEdits } from './scriptActions'
import { updateDatasetMetadata, convertDatasetAbscissa, updateStyle, importDataset, importDatasets, selectDataset, setActiveTab, removeDataset } from './datasetActions'
import { detectPeaks, computePeakHeatmap, addPeakAtIndex, setPeakEnabled, removePeak, clearPeaks, updatePeakLabel, setPeakDetectionMode, updatePeakDetectionSettings } from './peakActions'

function snapshot(): AppState { return get(appState) }

export const projectStore = {
  subscribe: appState.subscribe,
  rerunPipeline, executeScriptForDatasets, updateDatasetMetadata, convertDatasetAbscissa, updateStyle,
  updateTransform, updateTransformGlobal, setScriptOverride, setPythonFileOverride, revertScriptToGuiState,
  confirmOverwriteForGuiEdits, importDataset, importDatasets, selectDataset,
  setActiveTab, removeDataset, detectPeaks, computePeakHeatmap, addPeakAtIndex,
  setPeakEnabled, removePeak, clearPeaks, updatePeakLabel, setPeakDetectionMode, updatePeakDetectionSettings, snapshot,
}

export const activeDataset = derived(appState, state =>
  state.datasets.find(dataset => dataset.id === state.viewState.selectedSpectrumId) ?? null,
)
