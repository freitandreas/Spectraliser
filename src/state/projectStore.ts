import { derived, get } from 'svelte/store'
import type { AppState } from '../types/project'
import { appState } from './projectContext'
import { rerunPipeline, updateTransform } from './pipelineActions'
import { executeScriptForDatasets, setScriptOverride, setPythonFileOverride, revertScriptToGuiState, confirmOverwriteForGuiEdits } from './scriptActions'
import { updateDatasetMetadata, updateStyle, importDatasets, selectDataset, setActiveTab, removeDataset, linkExperimentMetadata } from './datasetActions'
import { adviseSmoothing } from './autoParameterActions'
import { detectPeaks, addPeakAtIndex, setPeakEnabled, removePeak, clearPeaks, updatePeakLabel, setPeakDetectionMode, updatePeakDetectionSettings } from './peakActions'

function snapshot(): AppState { return get(appState) }

export const projectStore = {
  subscribe: appState.subscribe,
  rerunPipeline, executeScriptForDatasets, updateDatasetMetadata, updateStyle,
  updateTransform, setScriptOverride, setPythonFileOverride, revertScriptToGuiState,
  confirmOverwriteForGuiEdits, importDatasets, selectDataset,
  setActiveTab, removeDataset, linkExperimentMetadata, detectPeaks, addPeakAtIndex,
  setPeakEnabled, removePeak, clearPeaks, updatePeakLabel, setPeakDetectionMode, updatePeakDetectionSettings,
  adviseSmoothing, snapshot,
}

export const activeDataset = derived(appState, state =>
  state.datasets.find(dataset => dataset.id === state.viewState.selectedSpectrumId) ?? null,
)
