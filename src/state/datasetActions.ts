import { getSpectrumStyleDefaults, type AppState, type SpectrumDataset } from '../types/project'
import { appState, scheduleAutosave, regenerateScript, commitDatasets, createDatasetFromParsed, resolveProjectSpectrumType, resolveUniqueLabels, logScriptDebug } from './projectContext'
import type { ParsedSpectrum } from '../services/import/parsers'
import { convertAbscissa } from '../services/import/unitConversion'
import { axisDefaultsFor, percentScaleFactor } from '../services/spectrumPresets'
import { transitionSyncState } from '../services/script/syncStateMachine'

export function updateDatasetMetadata(
  datasetId: string,
  partial: {
    name?: string
    sourcePath?: string
    spectrumType?: SpectrumDataset['spectrumType']
    units?: Partial<SpectrumDataset['units']>
  },
): void {
  appState.update((state) => {
    logScriptDebug('metadata_update', {
      datasetId,
      partial,
      syncMode: state.syncMode,
      scriptSyncEnabled: state.scriptSyncEnabled,
    })

    const datasets = state.datasets.map((dataset) => {
      if (dataset.id !== datasetId) {
        return dataset
      }

      const nextSpectrumType = partial.spectrumType ?? dataset.spectrumType
      const nextStyle = nextSpectrumType === 'ir'
        ? { ...dataset.style, ...getSpectrumStyleDefaults(nextSpectrumType, dataset.style), abscissaInverted: true }
        : { ...dataset.style, ...getSpectrumStyleDefaults(nextSpectrumType, dataset.style) }

      // Switching spectrum type reseeds the axis metadata with that technique's conventions.
      const typeDefaults = partial.spectrumType && partial.spectrumType !== dataset.spectrumType
        ? axisDefaultsFor(nextSpectrumType)
        : null
      const nextUnits = {
        ...dataset.units,
        ...(typeDefaults ?? {}),
        ...(partial.units ?? {}),
        xQuantity: partial.units?.xQuantity ?? typeDefaults?.xQuantity ?? dataset.units.xQuantity ?? 'Abscissa',
        yQuantity: partial.units?.yQuantity ?? typeDefaults?.yQuantity ?? dataset.units.yQuantity ?? 'Ordinate',
      }

      const scale = percentScaleFactor(dataset.units.y, nextUnits.y)
      const data = scale === null ? dataset.data : {
        ...dataset.data,
        ordinateOriginal: dataset.data.ordinateOriginal.map((value) => value * scale),
        ordinateModified: dataset.data.ordinateModified.map((value) => value * scale),
      }

      return {
        ...dataset,
        name: partial.name ?? dataset.name,
        sourcePath: partial.sourcePath ?? dataset.sourcePath,
        spectrumType: nextSpectrumType,
        units: nextUnits,
        data,
        style: nextStyle,
      }
    })

    if (partial.spectrumType) {
      const policy = resolveProjectSpectrumType([], datasets)
      if (policy.error) {
        return state
      }
    }

    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'GUI_EDIT' },
    )

    const generatedScript = syncResult.scriptSyncEnabled
      ? regenerateScript(datasets)
      : state.generatedScript

    const nextState = {
      ...state,
      datasets,
      generatedScript,
      updatedAt: new Date().toISOString(),
      syncMode: syncResult.mode,
      scriptSyncEnabled: syncResult.scriptSyncEnabled,
    }

    scheduleAutosave(nextState)
    return nextState
  })
}

export function convertDatasetAbscissa(datasetId: string, targetUnit: string): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => {
      if (dataset.id !== datasetId || dataset.units.x === targetUnit) return dataset

      const abscissa = convertAbscissa(dataset.data.abscissa, dataset.units.x, targetUnit)
      return {
        ...dataset,
        units: { ...dataset.units, x: targetUnit },
        data: { ...dataset.data, abscissa },
        peaks: [],
      }
    })

    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'GUI_EDIT' },
    )
    const nextState = {
      ...state,
      datasets,
      generatedScript: syncResult.scriptSyncEnabled ? regenerateScript(datasets) : state.generatedScript,
      updatedAt: new Date().toISOString(),
      syncMode: syncResult.mode,
      scriptSyncEnabled: syncResult.scriptSyncEnabled,
    }
    scheduleAutosave(nextState)
    return nextState
  })
}

export function updateStyle(datasetId: string, partial: Partial<SpectrumDataset['style']>): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset) => {
      if (dataset.id !== datasetId) {
        return dataset
      }

      return {
        ...dataset,
        style: {
          ...dataset.style,
          ...partial,
        },
      }
    })

    const syncResult = transitionSyncState(
      { mode: state.syncMode, scriptSyncEnabled: state.scriptSyncEnabled },
      { type: 'GUI_EDIT' },
    )

    const generatedScript = syncResult.scriptSyncEnabled
      ? regenerateScript(datasets)
      : state.generatedScript

    const nextState = {
      ...state,
      datasets,
      generatedScript,
      updatedAt: new Date().toISOString(),
      syncMode: syncResult.mode,
      scriptSyncEnabled: syncResult.scriptSyncEnabled,
    }

    scheduleAutosave(nextState)
    return nextState
  })
}

export function importDataset(input: { name: string; parsed: ParsedSpectrum; sourcePath?: string }): void {
  importDatasets([
    {
      name: input.name,
      parsed: input.parsed,
    },
  ])
}

export function importDatasets(inputs: Array<{ name: string; parsed: ParsedSpectrum; label?: string; sourcePath?: string }>): string | null {
  if (inputs.length === 0) {
    return null
  }

  let importError: string | null = null
  appState.update((state) => {
    const existingLabels = state.datasets.map((dataset) => dataset.style.label)
    const requestedLabels = inputs.map((input) => {
      if (input.label?.trim().length) {
        return input.label
      }
      return `${input.name} (Processed)`
    })
    const resolvedLabels = resolveUniqueLabels(existingLabels, requestedLabels)

    const imported = inputs.map((input, index) =>
      createDatasetFromParsed({
        ...input,
        resolvedLabel: resolvedLabels[index],
      }),
    )
    const policy = resolveProjectSpectrumType(state.datasets, imported)
    if (policy.error) {
      importError = policy.error
      return state
    }
    const datasets = [...state.datasets, ...imported]
    const selected = imported[imported.length - 1]?.id ?? state.viewState.selectedSpectrumId
    const nextState = commitDatasets(state, datasets)
    return {
      ...nextState,
      projectSpectrumType: policy.spectrumType,
      viewState: {
        ...nextState.viewState,
        selectedSpectrumId: selected,
        activeTab: selected ? 'sample_view' : nextState.viewState.activeTab,
      },
    }
  })
  return importError
}

export function selectDataset(datasetId: string): void {
  appState.update((state) => ({
    ...state,
    viewState: {
      ...state.viewState,
      activeTab: 'sample_view',
      selectedSpectrumId: datasetId,
    },
  }))
}

export function setActiveTab(activeTab: AppState['viewState']['activeTab']): void {
  appState.update((state) => ({
    ...state,
    viewState: {
      ...state.viewState,
      activeTab,
    },
  }))
}

export function removeDataset(datasetId: string): void {
  appState.update((state) => {
    const datasets = state.datasets.filter((dataset) => dataset.id !== datasetId)
    const nextSelected = state.viewState.selectedSpectrumId === datasetId
      ? datasets[0]?.id ?? null
      : state.viewState.selectedSpectrumId
    const nextActiveTab = state.viewState.selectedSpectrumId === datasetId
      ? (nextSelected ? 'sample_view' : 'script_view')
      : state.viewState.activeTab

    const nextState = commitDatasets(state, datasets)
    return {
      ...nextState,
      viewState: {
        ...nextState.viewState,
        selectedSpectrumId: nextSelected,
        activeTab: nextActiveTab,
      },
    }
  })
}

