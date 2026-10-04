import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { createDatasetFromParsed } from '../src/state/projectContext'
import { updateDatasetMetadata } from '../src/state/datasetActions'
import { appState } from '../src/state/projectContext'

describe('physical axis metadata updates', () => {
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('converts data, peak positions, and crop bounds when axis units change', () => {
    vi.useFakeTimers()
    const dataset = createDatasetFromParsed({
      name: 'wavelength.csv',
      parsed: { abscissa: [500, 600], ordinate: [0.2, 0.4], xUnit: 'nm', spectrumType: 'uv-vis' },
    })
    dataset.peaks = [{
      id: 'p1',
      index: 1,
      x: 600,
      y: 0.4,
      label: 'peak',
      source: 'manual',
      enabled: true,
    }]
    const previousState = get(appState)
    appState.set({ ...previousState, datasets: [dataset], projectSpectrumType: 'uv-vis' })

    updateDatasetMetadata(dataset.id, {
      units: { x: 'cm⁻¹', xQuantity: 'Wavenumber' },
    })

    const converted = get(appState).datasets[0]!
    expect(converted.data.abscissa[0]).toBeCloseTo(20_000)
    expect(converted.data.abscissa[1]).toBeCloseTo(16_666.6667)
    expect(converted.peaks[0]?.x).toBeCloseTo(16_666.6667)
    expect(converted.pipeline[0]?.params.x_min).toBeCloseTo(16_666.6667)
    expect(converted.pipeline[0]?.params.x_max).toBeCloseTo(20_000)

    appState.set(previousState)
  })
})
