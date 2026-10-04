import type { SpectrumDataset } from '../src/types/project'

export function buildDataset(overrides: Partial<SpectrumDataset> = {}): SpectrumDataset {
  return {
    id: 'sample-1',
    name: 'Sample_01.csv',
    sourcePath: 'Sample_01.csv',
    spectrumType: 'uv-vis',
    units: { x: 'nm', y: 'Absorbance' },
    data: {
      abscissa: [200, 201],
      ordinateOriginal: [0.1, 0.2],
      ordinateModified: [0.1, 0.2],
      precision: 'float32',
    },
    pipeline: [
      {
        id: 'a',
        type: 'smoothing',
        scope: 'individual',
        enabled: true,
        params: { window_length: 15, polyorder: 2 },
      },
    ],
    style: {
      lineColor: '#ffffff',
      lineWidth: 2,
      scatterSymbol: 'circle',
      label: 'Sample 01 (Processed)',
    },
    peaks: [],
    ...overrides,
  }
}
