import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_STARTUP_PREFERENCES,
  MAX_INTERPOLATION_STEPS,
  hasCompletedStartupWizard,
  loadStartupPreferences,
  normalizeStartupPreferences,
  preferencesForTemplate,
  saveStartupPreferences,
} from '../src/services/startupPreferences'

afterEach(() => {
  localStorage.clear()
})

describe('startup preferences', () => {
  it('defaults to UV-Vis, the grid template and the overlay plot', () => {
    expect(loadStartupPreferences()).toEqual(DEFAULT_STARTUP_PREFERENCES)
    expect(DEFAULT_STARTUP_PREFERENCES.spectrumType).toBe('uv-vis')
    expect(DEFAULT_STARTUP_PREFERENCES.plotStyle).toMatchObject({
      plotMode: 'overlay',
      axisLabelFormat: 'slash',
      seriesUnit: 's',
      seriesInterpolation: { enabled: false, steps: 1 },
    })
    expect(hasCompletedStartupWizard()).toBe(false)
  })

  it('persists spectrum choice and user-edited plot style', () => {
    const preferences = {
      ...DEFAULT_STARTUP_PREFERENCES,
      spectrumType: 'ir' as const,
      axes: { xQuantity: 'Wavenumber', xUnit: 'cm⁻¹', yQuantity: 'Transmittance', yUnit: '%' },
      plotStyle: {
        ...preferencesForTemplate('framed'),
        showGrid: false,
        lineWidth: 4,
        plotMode: 'surface3d' as const,
        axisLabelFormat: 'fraction' as const,
        seriesUnit: 'min' as const,
        seriesInterpolation: { enabled: true, steps: 3 },
      },
    }

    saveStartupPreferences(preferences)

    expect(hasCompletedStartupWizard()).toBe(true)
    expect(loadStartupPreferences()).toEqual(preferences)
  })

  it('falls back to valid defaults for invalid saved values', () => {
    localStorage.setItem('spectraliser.startup-preferences.v1', '{invalid')

    expect(loadStartupPreferences()).toEqual(DEFAULT_STARTUP_PREFERENCES)
    expect(hasCompletedStartupWizard()).toBe(false)
  })

  it('migrates the original one-page preferences without losing saved choices', () => {
    expect(normalizeStartupPreferences({
      spectrumType: 'ir',
      plotStyle: { template: 'minimal', showGrid: false, showBorder: false, lineWidth: 3 },
    })).toEqual({
      ...DEFAULT_STARTUP_PREFERENCES,
      spectrumType: 'ir',
      axes: { xQuantity: 'Wavenumber', xUnit: 'cm⁻¹', yQuantity: 'Transmittance', yUnit: '%' },
      plotStyle: { ...DEFAULT_STARTUP_PREFERENCES.plotStyle, template: 'minimal', showGrid: false, showBorder: false, lineWidth: 3 },
    })
  })

  it('migrates auto-detect and removed import fields from older preferences', () => {
    const normalized = normalizeStartupPreferences({
      spectrumType: 'auto',
      seriesLabelTemplate: '{file} {series}',
      interpolation: { enabled: true, points: 400 },
    })

    expect(normalized).toEqual(DEFAULT_STARTUP_PREFERENCES)
    expect(normalized).not.toHaveProperty('seriesLabelTemplate')
    expect(normalized).not.toHaveProperty('interpolation')
  })

  it('defaults compute precision to float32 and keeps an explicit float64 choice', () => {
    expect(DEFAULT_STARTUP_PREFERENCES.computePrecision).toBe('float32')
    expect(normalizeStartupPreferences({ spectrumType: 'ir' }).computePrecision).toBe('float32')
    expect(normalizeStartupPreferences({ computePrecision: 'float128' }).computePrecision).toBe('float32')
    expect(normalizeStartupPreferences({ computePrecision: 'float64' }).computePrecision).toBe('float64')
  })

  it('clamps interpolation steps and rejects invalid plot settings', () => {
    const normalized = normalizeStartupPreferences({
      ...DEFAULT_STARTUP_PREFERENCES,
      plotStyle: {
        ...DEFAULT_STARTUP_PREFERENCES.plotStyle,
        seriesMode: 'invalid',
        plotMode: 'pie',
        axisLabelFormat: 'bogus',
        seriesUnit: 'years',
        seriesInterpolation: { enabled: true, steps: 500 },
      },
    })

    expect(normalized.plotStyle.seriesInterpolation).toEqual({ enabled: true, steps: MAX_INTERPOLATION_STEPS })
    expect(normalized.plotStyle).toMatchObject({ seriesMode: 'lines', plotMode: 'overlay', axisLabelFormat: 'slash', seriesUnit: 's' })
  })

  it('normalizes persisted axis quantity/unit pairs to supported physical choices', () => {
    const normalized = normalizeStartupPreferences({
      ...DEFAULT_STARTUP_PREFERENCES,
      axes: { xQuantity: 'Wavenumber', xUnit: 'nm', yQuantity: 'unknown', yUnit: 'bogus' },
    })

    expect(normalized.axes).toEqual({
      xQuantity: 'Wavenumber',
      xUnit: 'cm⁻¹',
      yQuantity: 'Absorbance',
      yUnit: '',
    })
  })

  it('defaults quantity notation to names and keeps only a valid symbol choice', () => {
    expect(DEFAULT_STARTUP_PREFERENCES.plotStyle.quantityNotation).toBe('name')
    const symbol = normalizeStartupPreferences({
      ...DEFAULT_STARTUP_PREFERENCES,
      plotStyle: { ...DEFAULT_STARTUP_PREFERENCES.plotStyle, quantityNotation: 'symbol' },
    })
    expect(symbol.plotStyle.quantityNotation).toBe('symbol')
    const invalid = normalizeStartupPreferences({
      ...DEFAULT_STARTUP_PREFERENCES,
      plotStyle: { ...DEFAULT_STARTUP_PREFERENCES.plotStyle, quantityNotation: 'glyphs' },
    })
    expect(invalid.plotStyle.quantityNotation).toBe('name')
  })
})
