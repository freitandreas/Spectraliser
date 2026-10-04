import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import type { SpectrumDataset } from '../src/types/project'
import {
  adoptGeneralSettings,
  deriveGeneralSettings,
  normalizeGeneralSettings,
  sampleDifferences,
  stepsEquivalent,
  type GeneralSettingsSnapshot,
} from '../src/services/generalSettings'
import { COLOR_PALETTES, paletteColor, paletteColorAt } from '../src/services/palettes'
import { convertOrdinates, ordinateConversion } from '../src/services/ordinateConversion'
import { buildPipeline } from '../src/state/pipelineBlueprint'
import { appState, createDatasetFromParsed } from '../src/state/projectContext'
import { importDatasets } from '../src/state/datasetActions'
import {
  applyGeneralChange,
  axisChangeError,
  pendingGeneralChange,
  planGeneralChange,
  requestGeneralChange,
  resetSampleSetting,
  resolvePendingGeneralChange,
  type GeneralSettingsContext,
} from '../src/state/generalSettingsActions'

const AXES = { xQuantity: 'Wavelength', xUnit: 'nm', yQuantity: 'Absorbance', yUnit: '' }

function sample(id: string, index: number, patch: Partial<SpectrumDataset['style']> = {}): SpectrumDataset {
  const dataset = createDatasetFromParsed({
    name: `${id}.csv`,
    parsed: { abscissa: [400, 500, 600], ordinate: [0.1, 0.5, 0.2], xUnit: 'nm', spectrumType: 'uv-vis' },
  })
  return {
    ...dataset,
    id,
    units: { x: 'nm', y: '', xQuantity: 'Wavelength', yQuantity: 'Absorbance' },
    style: { ...dataset.style, label: id, lineColor: paletteColor('rainbow', { index, count: 2 }), lineWidth: 2, abscissaInverted: false, ordinateInverted: false, ...patch },
  }
}

function snapshot(datasets: SpectrumDataset[]): GeneralSettingsSnapshot {
  return { ...deriveGeneralSettings(datasets, 'uv-vis'), axes: { ...AXES } }
}

function context(): GeneralSettingsContext {
  return { axes: { ...AXES }, queueGuiAction: (action) => action(), persistAxes: vi.fn(), persistLineWidth: vi.fn() }
}

function load(datasets: SpectrumDataset[]): void {
  appState.set({ ...get(appState), datasets, projectSpectrumType: 'uv-vis', generalSettings: deriveGeneralSettings(datasets, 'uv-vis') })
}

describe('general settings model', () => {
  it('ignores parameters of disabled steps when comparing', () => {
    const [crop] = buildPipeline([400, 600])
    expect(stepsEquivalent(crop, { ...crop!, params: { x_min: 1, x_max: 2 } })).toBe(true)
    expect(stepsEquivalent({ ...crop!, enabled: true }, { ...crop!, enabled: true, params: { x_min: 1, x_max: 2 } })).toBe(false)
  })

  it('reports only the settings a sample overrides', () => {
    const datasets = [sample('a', 0), sample('b', 1, { lineWidth: 4 })]
    const general = snapshot([datasets[0]!, sample('c', 1)])
    expect(sampleDifferences(datasets[0]!, { index: 0, count: 2 }, general)).toEqual([])
    expect(sampleDifferences(datasets[1]!, { index: 1, count: 2 }, general)).toEqual(['lineWidth'])
  })

  it('derives settings for legacy projects and validates stored values', () => {
    const datasets = [sample('a', 0), sample('b', 1)]
    const derived = normalizeGeneralSettings(undefined, datasets, 'uv-vis')
    expect(derived.paletteId).toBe('rainbow')
    expect(derived.lineWidth).toBe(2)
    const stored = normalizeGeneralSettings({ paletteId: 'nope', lineWidth: 40, pipeline: 'bad' }, datasets, 'uv-vis')
    expect(stored.paletteId).toBe('rainbow')
    expect(stored.lineWidth).toBe(6)
    expect(stored.pipeline).toHaveLength(6)
  })

  it('gives newly imported samples the general values', () => {
    const general = { ...deriveGeneralSettings([], 'uv-vis'), paletteId: 'ocean', lineWidth: 3 }
    general.pipeline = general.pipeline.map((step) => (step.type === 'baseline' ? { ...step, enabled: true, params: { order: 2 } } : step))
    const adopted = adoptGeneralSettings(sample('a', 0), { index: 1, count: 3 }, general)
    expect(adopted.style.lineColor).toBe(paletteColor('ocean', { index: 1, count: 3 }))
    expect(adopted.style.lineWidth).toBe(3)
    expect(adopted.pipeline.find((step) => step.type === 'baseline')).toMatchObject({ enabled: true, params: { order: 2 } })
    // A disabled general crop keeps the sample's own measured window.
    expect(adopted.pipeline.find((step) => step.type === 'crop')?.params).toEqual({ x_min: 400, x_max: 600 })
  })
})

describe('continuous palettes', () => {
  it('spreads distinct colours over any number of samples, end to end', () => {
    for (const palette of COLOR_PALETTES) {
      const colors = Array.from({ length: 12 }, (_, index) => paletteColor(palette.id, { index, count: 12 }))
      expect(new Set(colors).size).toBe(12)
      expect(colors[0]).toBe(palette.stops[0])
      expect(colors[11]).toBe(palette.stops[palette.stops.length - 1])
    }
    expect(paletteColorAt('default', 0.5)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('re-spreads palette followers when samples are added and keeps custom colours', () => {
    vi.useFakeTimers()
    const custom = { ...sample('b', 1), style: { ...sample('b', 1).style, lineColor: '#123456' } }
    load([sample('a', 0), custom])
    appState.update((state) => ({ ...state, generalSettings: { ...state.generalSettings!, paletteId: 'rainbow' } }))
    expect(importDatasets([{ name: 'c.csv', parsed: { abscissa: [400, 500], ordinate: [0.1, 0.2], xUnit: 'nm', spectrumType: 'uv-vis' } }])).toBeNull()
    const colors = get(appState).datasets.map((dataset) => dataset.style.lineColor)
    expect(colors).toEqual([paletteColor('rainbow', { index: 0, count: 3 }), '#123456', paletteColor('rainbow', { index: 2, count: 3 })])
    vi.useRealTimers()
  })
})

describe('ordinate conversion', () => {
  it('converts transmittance to absorbance and back', () => {
    const toA = ordinateConversion('Transmittance', '%', 'Absorbance', '')
    expect(convertOrdinates([100, 10, 1], toA)).toEqual([0, 1, 2].map((value) => expect.closeTo(value, 12)))
    const toT = ordinateConversion('Absorbance', '', 'Transmittance', '')
    expect(convertOrdinates([0, 1], toT)).toEqual([1, expect.closeTo(0.1, 12)])
  })

  it('rejects non-positive transmittance', () => {
    const toA = ordinateConversion('Transmittance', '', 'Absorbance', '')
    expect(() => convertOrdinates([0.5, 0], toA)).toThrow(/positive/)
  })

  it('rejects incompatible axis changes instead of relabelling', () => {
    const units = { x: 'nm', y: '', xQuantity: 'Wavelength', yQuantity: 'Absorbance' }
    expect(axisChangeError(units, { x: 's' })).toMatch(/cannot be converted/)
    expect(axisChangeError(units, { yQuantity: 'Reflectance' })).toMatch(/cannot be converted/)
    expect(axisChangeError(units, { x: 'cm⁻¹', yQuantity: 'Transmittance' })).toBeNull()
  })
})

describe('general setting changes', () => {
  afterEach(() => {
    pendingGeneralChange.set(null)
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('applies directly when every sample follows', () => {
    vi.useFakeTimers()
    load([sample('a', 0), sample('b', 1)])
    const ctx = context()
    requestGeneralChange({ kind: 'lineWidth', lineWidth: 3 }, ctx)
    expect(get(pendingGeneralChange)).toBeNull()
    expect(get(appState).datasets.map((dataset) => dataset.style.lineWidth)).toEqual([3, 3])
    expect(get(appState).generalSettings?.lineWidth).toBe(3)
    expect(ctx.persistLineWidth).toHaveBeenCalledWith(3)
  })

  it('asks before touching deviating samples and can update followers only', () => {
    vi.useFakeTimers()
    load([sample('a', 0), sample('b', 1, { lineWidth: 5 })])
    requestGeneralChange({ kind: 'lineWidth', lineWidth: 3 }, context())
    const plan = get(pendingGeneralChange)
    expect(plan?.deviatorCount).toBe(1)
    expect(plan?.followerCount).toBe(1)
    resolvePendingGeneralChange('followers')
    expect(get(appState).datasets.map((dataset) => dataset.style.lineWidth)).toEqual([3, 5])
  })

  it('overwrites every sample when chosen, and resets a single sample setting', () => {
    vi.useFakeTimers()
    load([sample('a', 0), sample('b', 1, { lineWidth: 5 })])
    const ctx = context()
    applyGeneralChange(planGeneralChange({ kind: 'palette', paletteId: 'sunset' }, ctx), 'all')
    expect(get(appState).datasets.map((dataset) => dataset.style.lineColor)).toEqual([paletteColor('sunset', { index: 0, count: 2 }), paletteColor('sunset', { index: 1, count: 2 })])
    resetSampleSetting('b', 'lineWidth', ctx)
    expect(get(appState).datasets[1]?.style.lineWidth).toBe(2)
  })

  it('updates pipeline steps of following samples without mutating sources', () => {
    vi.useFakeTimers()
    load([sample('a', 0), sample('b', 1)])
    const before = structuredClone(get(appState).datasets[0]!.data)
    applyGeneralChange(planGeneralChange({ kind: 'step', type: 'crop', enabled: true }, context()), 'all')
    const crop = get(appState).datasets.map((dataset) => dataset.pipeline.find((step) => step.type === 'crop'))
    expect(crop.every((step) => step?.enabled && step.params.x_min === 400 && step.params.x_max === 600)).toBe(true)
    expect(get(appState).datasets[0]!.data).toEqual(before)
  })

  it('converts sample data when the general axes change and persists them', () => {
    vi.useFakeTimers()
    load([sample('a', 0)])
    const ctx = context()
    applyGeneralChange(planGeneralChange({ kind: 'axes', axes: { ...AXES, xQuantity: 'Wavenumber', xUnit: 'cm⁻¹' } }, ctx), 'all')
    const converted = get(appState).datasets[0]!
    expect(converted.units.x).toBe('cm⁻¹')
    expect(converted.data.abscissa[0]).toBeCloseTo(25_000)
    expect(ctx.persistAxes).toHaveBeenCalledWith(expect.objectContaining({ xUnit: 'cm⁻¹' }))
  })
})
