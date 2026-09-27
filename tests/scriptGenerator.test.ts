import { describe, expect, it } from 'vitest'
import { generatePythonScript, generatePythonFiles, PYTHON_FILE_NAMES } from '../src/services/script/scriptGenerator'
import type { SpectrumDataset } from '../src/types/project'

function buildDataset(): SpectrumDataset {
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
  }
}

describe('generatePythonScript', () => {
  it('is deterministic for identical input', () => {
    const one = generatePythonScript([buildDataset()])
    const two = generatePythonScript([buildDataset()])
    expect(one).toBe(two)
  })

  it('includes style values in output', () => {
    const script = generatePythonScript([buildDataset()])
    expect(script).toContain('\\"lineColor\\":\\"#ffffff\\"')
    expect(script).toContain('\\"label\\":\\"Sample 01 (Processed)\\"')
    const files = generatePythonFiles([buildDataset()])
    expect(Object.keys(files)).toEqual(PYTHON_FILE_NAMES)
    expect(files['ir_assignments.py']).toContain('def assign_ir_peaks(')
    expect(files['processing.py']).toContain('def process_spectrum(')
  })
})
