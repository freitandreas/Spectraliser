import { finiteRange } from '../services/numeric'
import { get, writable } from 'svelte/store'
import type { SpectrumDataset, TransformDefinition } from '../types/project'
import {
  adoptStep,
  deriveGeneralSettings,
  pipelineKey,
  settingDiffers,
  settingLabel,
  type GeneralAxes,
  type GeneralSettingsSnapshot,
  type ProjectGeneralSettings,
  type SettingKey,
  type TransformType,
} from '../services/generalSettings'
import { canConvertAbscissa, convertAbscissa } from '../services/import/unitConversion'
import { paletteColor, type PaletteSlot } from '../services/palettes'
import { isAbsorbanceTransmittancePair } from '../services/ordinateConversion'
import { canonicalUnit, formatUnit } from '../services/spectrumPresets'
import { appState, commitDatasets, mapDataset } from './projectContext'
import { updateDatasetMetadata } from './datasetActions'

export type GeneralChange =
  | { kind: 'axes'; axes: GeneralAxes }
  | { kind: 'palette'; paletteId: string }
  | { kind: 'lineWidth'; lineWidth: number }
  | { kind: 'inversion'; axis: 'abscissa' | 'ordinate'; inverted: boolean }
  | { kind: 'step'; type: TransformType; enabled?: boolean; params?: Record<string, number | string | boolean> }

export type GeneralApplyMode = 'all' | 'followers'

export interface GeneralSettingsContext {
  axes: GeneralAxes
  /** Wraps a project mutation in the shell's script-desync confirmation. */
  queueGuiAction: (action: () => void) => void
  persistAxes: (axes: GeneralAxes) => void
  persistLineWidth: (lineWidth: number) => void
}

export interface GeneralChangePlan {
  change: GeneralChange
  next: GeneralSettingsSnapshot
  keys: SettingKey[]
  /** Per affected key, the ids of samples that matched the previous general value. */
  followers: Partial<Record<SettingKey, string[]>>
  deviatorCount: number
  followerCount: number
  context: GeneralSettingsContext
}

export const pendingGeneralChange = writable<GeneralChangePlan | null>(null)
export const generalSettingsError = writable('')

const AXIS_KEYS: Array<{ key: SettingKey; field: keyof GeneralAxes }> = [
  { key: 'xQuantity', field: 'xQuantity' },
  { key: 'xUnit', field: 'xUnit' },
  { key: 'yQuantity', field: 'yQuantity' },
  { key: 'yUnit', field: 'yUnit' },
]

export function currentGeneralSettings(): ProjectGeneralSettings {
  const state = get(appState)
  return state.generalSettings ?? deriveGeneralSettings(state.datasets, state.projectSpectrumType)
}

export function generalSnapshot(general: ProjectGeneralSettings, axes: GeneralAxes): GeneralSettingsSnapshot {
  return { ...general, axes: { ...axes } }
}

function patchedStep(
  step: TransformDefinition,
  change: Extract<GeneralChange, { kind: 'step' }>,
  datasets: SpectrumDataset[],
): TransformDefinition {
  const params = { ...step.params, ...(change.params ?? {}) }
  // A general crop window starts from the measured range of all samples instead of an empty window.
  if (step.type === 'crop' && change.enabled && params.x_min === params.x_max) {
    const range = finiteRange(...datasets.map((dataset) => dataset.data.abscissa))
    if (range) [params.x_min, params.x_max] = range
  }
  return { ...step, enabled: change.enabled ?? step.enabled, params }
}

function convertCrop(pipeline: TransformDefinition[], fromUnit: string, toUnit: string): TransformDefinition[] {
  if (fromUnit === toUnit || !canConvertAbscissa(fromUnit, toUnit)) return pipeline
  return pipeline.map((step) => {
    const { x_min: low, x_max: high } = step.params
    if (step.type !== 'crop' || typeof low !== 'number' || typeof high !== 'number' || low === high) return step
    const [min, max] = convertAbscissa([low, high], fromUnit, toUnit).sort((a, b) => a - b)
    return { ...step, params: { ...step.params, x_min: min!, x_max: max! } }
  })
}

function nextSnapshot(current: GeneralSettingsSnapshot, change: GeneralChange, datasets: SpectrumDataset[]): GeneralSettingsSnapshot {
  switch (change.kind) {
    case 'axes':
      return { ...current, axes: { ...change.axes }, pipeline: convertCrop(current.pipeline, current.axes.xUnit, change.axes.xUnit) }
    case 'palette':
      return { ...current, paletteId: change.paletteId }
    case 'lineWidth':
      return { ...current, lineWidth: change.lineWidth }
    case 'inversion':
      return change.axis === 'abscissa'
        ? { ...current, abscissaInverted: change.inverted }
        : { ...current, ordinateInverted: change.inverted }
    case 'step':
      return {
        ...current,
        pipeline: current.pipeline.map((step) => (step.type === change.type ? patchedStep(step, change, datasets) : step)),
      }
  }
}

function affectedKeys(change: GeneralChange, current: GeneralSettingsSnapshot): SettingKey[] {
  switch (change.kind) {
    case 'axes':
      return AXIS_KEYS.filter(({ field }) => current.axes[field] !== change.axes[field]).map(({ key }) => key)
    case 'palette': return ['lineColor']
    case 'lineWidth': return ['lineWidth']
    case 'inversion': return [change.axis === 'abscissa' ? 'abscissaInverted' : 'ordinateInverted']
    case 'step': return [pipelineKey(change.type)]
  }
}

export function planGeneralChange(
  change: GeneralChange,
  context: GeneralSettingsContext,
  datasets: SpectrumDataset[] = get(appState).datasets,
  general: ProjectGeneralSettings = currentGeneralSettings(),
): GeneralChangePlan {
  const current = generalSnapshot(general, context.axes)
  const keys = affectedKeys(change, current)
  const followers: Partial<Record<SettingKey, string[]>> = {}
  const deviating = new Set<string>()
  for (const key of keys) {
    followers[key] = datasets.filter((dataset, index) => {
      const differs = settingDiffers(dataset, { index, count: datasets.length }, current, key)
      if (differs) deviating.add(dataset.id)
      return !differs
    }).map((dataset) => dataset.id)
  }
  return {
    change,
    next: nextSnapshot(current, change, datasets),
    keys,
    followers,
    deviatorCount: deviating.size,
    followerCount: datasets.length - deviating.size,
    context,
  }
}

function targetsFor(plan: GeneralChangePlan, key: SettingKey, mode: GeneralApplyMode, datasets: SpectrumDataset[]): Set<string> {
  return new Set(mode === 'all' ? datasets.map((dataset) => dataset.id) : plan.followers[key] ?? [])
}

function storedSettings(snapshot: GeneralSettingsSnapshot): ProjectGeneralSettings {
  const { axes: _axes, ...general } = snapshot
  return general
}

function applyStyleAndPipeline(plan: GeneralChangePlan, mode: GeneralApplyMode): void {
  appState.update((state) => {
    const datasets = state.datasets.map((dataset, index) => {
      let next = dataset
      for (const key of plan.keys) {
        if (!targetsFor(plan, key, mode, state.datasets).has(dataset.id)) continue
        next = withGeneralValue(next, { index, count: state.datasets.length }, plan.next, key)
      }
      return next
    })
    return { ...commitDatasets(state, datasets), generalSettings: storedSettings(plan.next) }
  })
}

function withGeneralValue(dataset: SpectrumDataset, slot: PaletteSlot, general: GeneralSettingsSnapshot, key: SettingKey): SpectrumDataset {
  switch (key) {
    case 'lineColor': return { ...dataset, style: { ...dataset.style, lineColor: paletteColor(general.paletteId, slot) } }
    case 'lineWidth': return { ...dataset, style: { ...dataset.style, lineWidth: general.lineWidth } }
    case 'abscissaInverted': return { ...dataset, style: { ...dataset.style, abscissaInverted: general.abscissaInverted } }
    case 'ordinateInverted': return { ...dataset, style: { ...dataset.style, ordinateInverted: general.ordinateInverted } }
    default: {
      if (!key.startsWith('pipeline:')) return dataset
      const generalStep = general.pipeline.find((step) => pipelineKey(step.type) === key)
      if (!generalStep) return dataset
      return { ...dataset, pipeline: dataset.pipeline.map((step) => (step.type === generalStep.type ? adoptStep(step, generalStep) : step)) }
    }
  }
}

function axisUnits(general: GeneralSettingsSnapshot, keys: SettingKey[]): Partial<SpectrumDataset['units']> {
  const units: Partial<SpectrumDataset['units']> = {}
  if (keys.includes('xQuantity')) units.xQuantity = general.axes.xQuantity
  if (keys.includes('xUnit')) units.x = general.axes.xUnit
  if (keys.includes('yQuantity')) units.yQuantity = general.axes.yQuantity
  if (keys.includes('yUnit')) units.y = general.axes.yUnit
  return units
}

/** Rejects axis changes that would relabel values without a defined physical conversion. */
export function axisChangeError(current: SpectrumDataset['units'], units: Partial<SpectrumDataset['units']>): string | null {
  if (units.x !== undefined && canonicalUnit(units.x) !== canonicalUnit(current.x) && !canConvertAbscissa(current.x, units.x)) {
    return `${formatUnit(current.x) || '(no unit)'} cannot be converted to ${formatUnit(units.x) || '(no unit)'}.`
  }
  const yQuantity = units.yQuantity
  if (yQuantity !== undefined && yQuantity.trim().toLowerCase() !== current.yQuantity.trim().toLowerCase()
    && !isAbsorbanceTransmittancePair(current.yQuantity, yQuantity)) {
    return `${current.yQuantity} cannot be converted to ${yQuantity}; only absorbance ↔ transmittance has a defined conversion.`
  }
  return null
}

/** Converts sample axes through the real metadata path; failures are collected, not swallowed. */
function applyAxes(plan: GeneralChangePlan, mode: GeneralApplyMode): string[] {
  const errors: string[] = []
  const datasets = get(appState).datasets
  for (const dataset of datasets) {
    const keys = plan.keys.filter((key) => targetsFor(plan, key, mode, datasets).has(dataset.id))
    if (keys.length === 0) continue
    const units = axisUnits(plan.next, keys)
    const invalid = axisChangeError(dataset.units, units)
    if (invalid) {
      errors.push(`${dataset.style.label}: ${invalid}`)
      continue
    }
    try {
      updateDatasetMetadata(dataset.id, { units })
    } catch (error) {
      errors.push(`${dataset.style.label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  appState.update((state) => ({ ...state, generalSettings: storedSettings(plan.next) }))
  return errors
}

export function applyGeneralChange(plan: GeneralChangePlan, mode: GeneralApplyMode): void {
  plan.context.queueGuiAction(() => {
    if (plan.change.kind === 'axes') {
      const errors = applyAxes(plan, mode)
      plan.context.persistAxes(plan.next.axes)
      generalSettingsError.set(errors.length > 0 ? `Some samples kept their axes:\n${errors.join('\n')}` : '')
      return
    }
    applyStyleAndPipeline(plan, mode)
    if (plan.change.kind === 'lineWidth') plan.context.persistLineWidth(plan.next.lineWidth)
    generalSettingsError.set('')
  })
}

/** Applies directly when every sample follows; otherwise asks how to treat deviating samples. */
export function requestGeneralChange(change: GeneralChange, context: GeneralSettingsContext): void {
  const plan = planGeneralChange(change, context)
  if (plan.keys.length === 0) return
  if (plan.deviatorCount === 0) {
    applyGeneralChange(plan, 'all')
    return
  }
  pendingGeneralChange.set(plan)
}

export function resolvePendingGeneralChange(mode: GeneralApplyMode | null): void {
  const plan = get(pendingGeneralChange)
  pendingGeneralChange.set(null)
  if (plan && mode) applyGeneralChange(plan, mode)
}

export function describeAffected(plan: GeneralChangePlan): string {
  return plan.keys.map(settingLabel).join(', ')
}

/** Makes one sample follow the general value of a single setting again. */
export function resetSampleSetting(datasetId: string, key: SettingKey, context: GeneralSettingsContext): void {
  const state = get(appState)
  const index = state.datasets.findIndex((dataset) => dataset.id === datasetId)
  if (index < 0) return
  const general = generalSnapshot(currentGeneralSettings(), context.axes)
  context.queueGuiAction(() => {
    if (AXIS_KEYS.some((entry) => entry.key === key)) {
      const units = axisUnits(general, [key])
      const invalid = axisChangeError(state.datasets[index]!.units, units)
      if (invalid) {
        generalSettingsError.set(invalid)
        return
      }
      try {
        updateDatasetMetadata(datasetId, { units })
        generalSettingsError.set('')
      } catch (error) {
        generalSettingsError.set(error instanceof Error ? error.message : String(error))
      }
      return
    }
    appState.update((current) => commitDatasets(current, mapDataset(current.datasets, datasetId, (dataset) =>
      withGeneralValue(dataset, { index: current.datasets.indexOf(dataset), count: current.datasets.length }, general, key))))
  })
}
