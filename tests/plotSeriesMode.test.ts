import { describe, expect, it } from 'vitest'
import type { SpectrumDataset } from '../src/types/project'
import { buildLineTraces } from '../src/lib/plot/plotTraces'

const dataset: SpectrumDataset = {
  id: 'sample',
  name: 'sample.csv',
  sourcePath: 'sample.csv',
  spectrumType: 'uv-vis',
  units: { x: 'nm', y: '', xQuantity: 'Wavelength', yQuantity: 'Absorbance' },
  data: { abscissa: [200, 201], ordinateOriginal: [0.1, 0.2], ordinateModified: [0.1, 0.2], precision: 'float64' },
  pipeline: [],
  style: {
    lineColor: '#ffffff',
    lineWidth: 2,
    scatterSymbol: 'circle',
    label: 'Sample',
  },
  peaks: [],
}

describe('plot series display mode', () => {
  it.each(['lines', 'lines+markers', 'markers'] as const)('uses the selected Plotly trace mode: %s', (mode) => {
    expect(buildLineTraces([dataset], null, null, 2, mode)[0]?.mode).toBe(mode)
  })
})
