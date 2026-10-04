import type { SpectrumDataset, SpectrumType, TransformDefinition } from '../types/project'
import { buildPipeline } from '../state/pipelineBlueprint'
import { COLOR_PALETTES, DEFAULT_PALETTE_ID, paletteColor, type PaletteSlot } from './palettes'
import { formatUnit } from './spectrumPresets'

export type TransformType = TransformDefinition['type']

/** Project-level values every sample follows unless it was given its own value. */
export interface ProjectGeneralSettings {
  paletteId: string
  lineWidth: number
  abscissaInverted: boolean
  ordinateInverted: boolean
  pipeline: TransformDefinition[]
}

export interface GeneralAxes {
  xQuantity: string
  xUnit: string
  yQuantity: string
  yUnit: string
}

/** Everything a sample is compared against; axes are the plot units from the preferences. */
export interface GeneralSettingsSnapshot extends ProjectGeneralSettings {
  axes: GeneralAxes
}

export type PipelineSettingKey = `pipeline:${TransformType}`
export type SettingKey =
  | 'xQuantity' | 'xUnit' | 'yQuantity' | 'yUnit'
  | 'lineColor' | 'lineWidth' | 'abscissaInverted' | 'ordinateInverted'
  | PipelineSettingKey

const STEP_TITLES: Record<TransformType, string> = {
  crop: 'Crop',
  baseline: 'Baseline',
  smoothing: 'Smoothing',
  inversion: 'Inversion',
  normalization: 'Normalisation',
  peak_localisation: 'Peak localisation',
}

const BASE_LABELS: Record<Exclude<SettingKey, PipelineSettingKey>, string> = {
  xQuantity: 'Abscissa quantity',
  xUnit: 'Abscissa unit',
  yQuantity: 'Ordinate quantity',
  yUnit: 'Ordinate unit',
  lineColor: 'Line colour',
  lineWidth: 'Line width',
  abscissaInverted: 'Inverted abscissa',
  ordinateInverted: 'Inverted ordinate',
}

const BASE_KEYS = Object.keys(BASE_LABELS) as Array<Exclude<SettingKey, PipelineSettingKey>>

export function pipelineKey(type: TransformType): PipelineSettingKey {
  return `pipeline:${type}`
}

export function stepTitle(type: TransformType): string {
  return STEP_TITLES[type] ?? type
}

export function settingLabel(key: SettingKey): string {
  return key.startsWith('pipeline:')
    ? stepTitle(key.slice('pipeline:'.length) as TransformType)
    : BASE_LABELS[key as Exclude<SettingKey, PipelineSettingKey>]
}

export function settingKeys(general: ProjectGeneralSettings): SettingKey[] {
  return [...BASE_KEYS, ...general.pipeline.map((step) => pipelineKey(step.type))]
}

function sameNumber(left: number, right: number): boolean {
  return left === right || Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right))
}

function sameParam(left: unknown, right: unknown): boolean {
  return typeof left === 'number' && typeof right === 'number' ? sameNumber(left, right) : left === right
}

/** Parameters of a disabled step have no effect, so only the switch is compared then. */
export function stepsEquivalent(left: TransformDefinition | undefined, right: TransformDefinition | undefined): boolean {
  if (!left || !right) return left === right
  if (left.enabled !== right.enabled) return false
  if (!left.enabled) return true
  const keys = new Set([...Object.keys(left.params), ...Object.keys(right.params)])
  return [...keys].every((key) => sameParam(left.params[key], right.params[key]))
}

function findStep(pipeline: TransformDefinition[], type: TransformType): TransformDefinition | undefined {
  return pipeline.find((step) => step.type === type)
}

function rawValue(dataset: SpectrumDataset, key: SettingKey): unknown {
  switch (key) {
    case 'xQuantity': return dataset.units.xQuantity
    case 'xUnit': return dataset.units.x
    case 'yQuantity': return dataset.units.yQuantity
    case 'yUnit': return dataset.units.y
    case 'lineColor': return dataset.style.lineColor.toLowerCase()
    case 'lineWidth': return dataset.style.lineWidth
    case 'abscissaInverted': return dataset.style.abscissaInverted ?? false
    case 'ordinateInverted': return dataset.style.ordinateInverted ?? false
    default: return findStep(dataset.pipeline, key.slice('pipeline:'.length) as TransformType)
  }
}

function generalRawValue(general: GeneralSettingsSnapshot, slot: PaletteSlot, key: SettingKey): unknown {
  switch (key) {
    case 'xQuantity': return general.axes.xQuantity
    case 'xUnit': return general.axes.xUnit
    case 'yQuantity': return general.axes.yQuantity
    case 'yUnit': return general.axes.yUnit
    case 'lineColor': return paletteColor(general.paletteId, slot).toLowerCase()
    case 'lineWidth': return general.lineWidth
    case 'abscissaInverted': return general.abscissaInverted
    case 'ordinateInverted': return general.ordinateInverted
    default: return findStep(general.pipeline, key.slice('pipeline:'.length) as TransformType)
  }
}

/** `slot` is the sample's position among all samples, which selects its palette colour. */
export function settingDiffers(dataset: SpectrumDataset, slot: PaletteSlot, general: GeneralSettingsSnapshot, key: SettingKey): boolean {
  const sample = rawValue(dataset, key)
  const expected = generalRawValue(general, slot, key)
  if (key.startsWith('pipeline:')) {
    return !stepsEquivalent(sample as TransformDefinition | undefined, expected as TransformDefinition | undefined)
  }
  return !sameParam(sample, expected)
}

export function sampleDifferences(dataset: SpectrumDataset, slot: PaletteSlot, general: GeneralSettingsSnapshot): SettingKey[] {
  return settingKeys(general).filter((key) => settingDiffers(dataset, slot, general, key))
}

function formatParam(value: number | string | boolean): string {
  return typeof value === 'number' ? String(Number(value.toPrecision(6))) : String(value)
}

export function describeStep(step: TransformDefinition | undefined): string {
  if (!step) return '—'
  if (!step.enabled) return 'Off'
  const params = Object.entries(step.params).map(([name, value]) => `${name.replace(/_/g, ' ')} ${formatParam(value)}`)
  return params.length > 0 ? `On · ${params.join(', ')}` : 'On'
}

function describe(key: SettingKey, value: unknown): string {
  if (key.startsWith('pipeline:')) return describeStep(value as TransformDefinition | undefined)
  if (key === 'xUnit' || key === 'yUnit') return String(value).trim() ? formatUnit(String(value)) : '(none)'
  if (key === 'abscissaInverted' || key === 'ordinateInverted') return value ? 'Yes' : 'No'
  if (key === 'lineWidth') return `${value} px`
  return String(value)
}

export function sampleSettingText(dataset: SpectrumDataset, key: SettingKey): string {
  return describe(key, rawValue(dataset, key))
}

export function generalSettingText(general: GeneralSettingsSnapshot, slot: PaletteSlot, key: SettingKey): string {
  return describe(key, generalRawValue(general, slot, key))
}

function mostCommon<T>(values: T[], keyOf: (value: T) => string, fallback: T): T {
  const counts = new Map<string, { value: T; count: number }>()
  for (const value of values) {
    const key = keyOf(value)
    const entry = counts.get(key)
    if (entry) entry.count += 1
    else counts.set(key, { value, count: 1 })
  }
  let best: { value: T; count: number } | null = null
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry
  return best?.value ?? fallback
}

function stepSignature(step: TransformDefinition): string {
  return step.enabled ? JSON.stringify(Object.entries(step.params).sort(([a], [b]) => a.localeCompare(b))) : 'off'
}

/** Seeds general values from the configuration most samples already share. */
export function deriveGeneralSettings(
  datasets: SpectrumDataset[],
  spectrumType: SpectrumType | null | undefined,
  lineWidth = 2,
): ProjectGeneralSettings {
  const blueprint = buildPipeline([])
  const paletteId = mostCommon(
    COLOR_PALETTES.filter((palette) => datasets.length > 0 && datasets.every((dataset, index) =>
      dataset.style.lineColor.toLowerCase() === paletteColor(palette.id, { index, count: datasets.length }).toLowerCase())).map((palette) => palette.id),
    (id) => id,
    DEFAULT_PALETTE_ID,
  )
  return {
    paletteId,
    lineWidth: mostCommon(datasets.map((dataset) => dataset.style.lineWidth), String, lineWidth),
    abscissaInverted: mostCommon(datasets.map((dataset) => dataset.style.abscissaInverted ?? false), String, spectrumType === 'ir'),
    ordinateInverted: mostCommon(datasets.map((dataset) => dataset.style.ordinateInverted ?? false), String, false),
    pipeline: blueprint.map((fallback) => {
      const steps = datasets.flatMap((dataset) => dataset.pipeline.filter((step) => step.type === fallback.type))
      const common = mostCommon(steps, stepSignature, fallback)
      return { ...fallback, enabled: common.enabled, params: { ...fallback.params, ...common.params } }
    }),
  }
}

/** Validates persisted general settings; anything missing or malformed is re-derived. */
export function normalizeGeneralSettings(
  raw: unknown,
  datasets: SpectrumDataset[],
  spectrumType: SpectrumType | null | undefined,
): ProjectGeneralSettings {
  const derived = deriveGeneralSettings(datasets, spectrumType)
  if (!raw || typeof raw !== 'object') return derived
  const saved = raw as Partial<ProjectGeneralSettings>
  const savedPipeline = Array.isArray(saved.pipeline) ? saved.pipeline : []
  return {
    paletteId: COLOR_PALETTES.some((palette) => palette.id === saved.paletteId) ? saved.paletteId! : derived.paletteId,
    lineWidth: typeof saved.lineWidth === 'number' && Number.isFinite(saved.lineWidth)
      ? Math.min(6, Math.max(1, saved.lineWidth))
      : derived.lineWidth,
    abscissaInverted: typeof saved.abscissaInverted === 'boolean' ? saved.abscissaInverted : derived.abscissaInverted,
    ordinateInverted: typeof saved.ordinateInverted === 'boolean' ? saved.ordinateInverted : derived.ordinateInverted,
    pipeline: derived.pipeline.map((step) => {
      const stored = savedPipeline.find((item) => item?.type === step.type)
      return stored && typeof stored.enabled === 'boolean' && stored.params && typeof stored.params === 'object'
        ? { ...step, enabled: stored.enabled, params: { ...step.params, ...stored.params } }
        : step
    }),
  }
}

/** Copies a general step onto a sample step; a disabled crop keeps the sample's own window. */
export function adoptStep(sample: TransformDefinition, general: TransformDefinition): TransformDefinition {
  if (sample.type === 'crop' && !general.enabled) return { ...sample, enabled: false }
  return { ...sample, enabled: general.enabled, params: { ...sample.params, ...general.params } }
}

/** Gives a newly imported sample the general style and processing values. */
export function adoptGeneralSettings(
  dataset: SpectrumDataset,
  slot: PaletteSlot,
  general: ProjectGeneralSettings,
): SpectrumDataset {
  return {
    ...dataset,
    style: {
      ...dataset.style,
      lineColor: paletteColor(general.paletteId, slot),
      lineWidth: general.lineWidth,
      abscissaInverted: general.abscissaInverted,
      ordinateInverted: general.ordinateInverted,
    },
    pipeline: dataset.pipeline.map((step) => {
      const generalStep = findStep(general.pipeline, step.type)
      return generalStep ? adoptStep(step, generalStep) : step
    }),
  }
}

/**
 * Palette colours depend on the number of samples, so whenever samples are added or removed the
 * samples that followed the palette are re-spread over the new count; custom colours stay untouched.
 */
export function respreadPaletteColors(
  previous: SpectrumDataset[],
  next: SpectrumDataset[],
  paletteId: string,
): SpectrumDataset[] {
  const followers = new Set(previous
    .filter((dataset, index) => dataset.style.lineColor.toLowerCase()
      === paletteColor(paletteId, { index, count: previous.length }).toLowerCase())
    .map((dataset) => dataset.id))
  return next.map((dataset, index) => {
    if (!followers.has(dataset.id)) return dataset
    const lineColor = paletteColor(paletteId, { index, count: next.length })
    return lineColor === dataset.style.lineColor ? dataset : { ...dataset, style: { ...dataset.style, lineColor } }
  })
}
