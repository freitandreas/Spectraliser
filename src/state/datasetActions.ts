import { getSpectrumStyleDefaults, type AppState, type SpectrumDataset } from '../types/project'
import { appState, updateProject, commitDatasets, commitGuiEdit, mapDataset, createDatasetFromParsed, resolveProjectSpectrumType, resolveUniqueLabels } from './projectContext'
import type { ParsedSpectrum } from '../services/import/parsers'
import { canConvertAbscissa, convertAbscissa } from '../services/import/unitConversion'
import { axisDefaultsFor } from '../services/spectrumPresets'
import { convertOrdinates, ordinateConversion } from '../services/ordinateConversion'
import { DEFAULT_PALETTE_ID } from '../services/palettes'
import { adoptGeneralSettings, deriveGeneralSettings, respreadPaletteColors } from '../services/generalSettings'
import { validateAndLinkMetadata, type MetadataImportOptions, type MetadataImportResult, type MetadataTable } from '../services/metadata/importMetadata'

export interface MetadataPatch {
  name?: string
  sourcePath?: string
  spectrumType?: SpectrumDataset['spectrumType']
  units?: Partial<SpectrumDataset['units']>
  experimentMetadata?: SpectrumDataset['experimentMetadata']
}

export type StylePatch = Partial<SpectrumDataset['style']>

export function updateDatasetMetadata(datasetId: string, partial: MetadataPatch): void {
  appState.update((state) => {
    const datasets = mapDataset(state.datasets, datasetId, (dataset) => {
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

      const isRamanShift = dataset.spectrumType === 'raman'
        && (dataset.units.xQuantity === 'Raman shift' || nextUnits.xQuantity === 'Raman shift')
      const wavenumberUnits = ['cm^-1', 'cm⁻¹', '1/cm']
      if (dataset.units.x !== nextUnits.x && (dataset.units.x === 's' || nextUnits.x === 's')) {
        throw new Error('Time cannot be converted to or from wavelength, frequency, or spectral energy without a defined physical relationship.')
      }
      if (isRamanShift && !wavenumberUnits.includes(dataset.units.x)) {
        throw new Error('Raman-shift data must be stored in inverse centimetres.')
      }
      if (isRamanShift && !wavenumberUnits.includes(nextUnits.x)) {
        throw new Error('Raman shift cannot be converted to wavelength without excitation-laser metadata.')
      }

      const mapY = ordinateConversion(dataset.units.yQuantity, dataset.units.y, nextUnits.yQuantity, nextUnits.y)
      const abscissa = dataset.units.x !== nextUnits.x && canConvertAbscissa(dataset.units.x, nextUnits.x)
        ? convertAbscissa(dataset.data.abscissa, dataset.units.x, nextUnits.x)
        : dataset.data.abscissa
      const xConverted = dataset.units.x !== nextUnits.x && abscissa !== dataset.data.abscissa
      const pipeline = xConverted
        ? dataset.pipeline.map((step) => {
          if (step.type !== 'crop') return step
          const params = { ...step.params }
          const low = params.x_min
          const high = params.x_max
          if (typeof low === 'number' && typeof high === 'number' && Number.isFinite(low) && Number.isFinite(high)) {
            const converted = convertAbscissa([low, high], dataset.units.x, nextUnits.x).sort((a, b) => a - b)
            params.x_min = converted[0]!
            params.x_max = converted[1]!
          }
          return { ...step, params }
        })
        : dataset.pipeline
      const ordinateOriginal = convertOrdinates(dataset.data.ordinateOriginal, mapY)
      const ordinateModified = convertOrdinates(dataset.data.ordinateModified, mapY)
      const data = dataset.units.x === nextUnits.x && mapY === null
        ? dataset.data
        : {
        ...dataset.data,
        abscissa,
        ordinateOriginal,
        ordinateModified,
      }
      const peaks = dataset.peaks.map((peak) => ({
        ...peak,
        x: abscissa[peak.index] ?? peak.x,
        y: mapY === null || !Number.isFinite(peak.y) ? peak.y : mapY(peak.y),
      }))

      return {
        ...dataset,
        name: partial.name ?? dataset.name,
        sourcePath: partial.sourcePath ?? dataset.sourcePath,
        spectrumType: nextSpectrumType,
        units: nextUnits,
        data,
        peaks,
        pipeline,
        style: nextStyle,
        experimentMetadata: partial.experimentMetadata ?? dataset.experimentMetadata,
      }
    })

    if (partial.spectrumType && resolveProjectSpectrumType([], datasets).error) return state
    return commitGuiEdit(state, datasets)
  })
}

export function updateStyle(datasetId: string, partial: StylePatch): void {
  appState.update((state) => commitGuiEdit(
    state,
    mapDataset(state.datasets, datasetId, (dataset) => ({ ...dataset, style: { ...dataset.style, ...partial } })),
  ))
}

/** One update (and one script regeneration) for a style change on every sample. */
export function updateAllStyles(partial: StylePatch): void {
  appState.update((state) => commitGuiEdit(
    state,
    state.datasets.map((dataset) => ({ ...dataset, style: { ...dataset.style, ...partial } })),
  ))
}

export function removeAllDatasets(): void {
  appState.update((state) => {
    const next = commitDatasets(state, [])
    return { ...next, viewState: { ...next.viewState, selectedSpectrumId: null, activeTab: 'script_view' } }
  })
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
    const baseGeneral = state.generalSettings ?? deriveGeneralSettings(state.datasets, state.projectSpectrumType)
    // An empty project adopts the orientation convention of the newly fixed spectrum type.
    const general = state.datasets.length === 0
      ? { ...baseGeneral, abscissaInverted: policy.spectrumType === 'ir' }
      : baseGeneral
    const count = state.datasets.length + imported.length
    const adopted = imported.map((dataset, index) =>
      adoptGeneralSettings(dataset, { index: state.datasets.length + index, count }, general))
    const datasets = respreadPaletteColors(state.datasets, [...state.datasets, ...adopted], general.paletteId)
    const selected = imported[imported.length - 1]?.id ?? state.viewState.selectedSpectrumId
    const nextState = commitDatasets(state, datasets)
    return {
      ...nextState,
      projectSpectrumType: policy.spectrumType,
      generalSettings: general,
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
    const datasets = respreadPaletteColors(
      state.datasets,
      state.datasets.filter((dataset) => dataset.id !== datasetId),
      state.generalSettings?.paletteId ?? DEFAULT_PALETTE_ID,
    )
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

/** Links a validated metadata table without rerunning or changing the scientific pipeline. */
export function linkExperimentMetadata(
  table: MetadataTable,
  options: MetadataImportOptions,
): MetadataImportResult {
  let result!: MetadataImportResult
  updateProject((state) => {
    result = validateAndLinkMetadata(state.datasets, table, options)
    return result.errors.length ? state : { ...state, datasets: result.datasets }
  })
  return result
}
