import { describe, expect, it } from 'vitest'
import {
  effectivePythonFiles,
  generatePythonFiles,
  generatePythonScript,
  generateSamplesJson,
  migrateLegacyMainScript,
  PROJECT_FILE_NAMES,
  PYTHON_FILE_NAMES,
} from '../src/services/script/scriptGenerator'
import { buildDataset } from './fixtures'

describe('generated Python project', () => {
  it('keeps main.py independent of sample metadata', () => {
    const one = generatePythonScript([buildDataset()])
    const two = generatePythonScript([buildDataset({ style: { ...buildDataset().style, label: 'Renamed' } })])
    expect(one).toBe(two)
    expect(one).toContain("PROJECT_DIR / 'samples.json'")
    expect(one).not.toContain('Sample 01')
  })

  it('writes sample metadata to samples.json', () => {
    const samples = JSON.parse(generateSamplesJson([buildDataset()]))
    expect(samples).toEqual([expect.objectContaining({
      id: 'sample-1',
      sourcePath: 'Sample_01.csv',
      units: { x: 'nm', y: 'Absorbance' },
      style: expect.objectContaining({ lineColor: '#ffffff', label: 'Sample 01 (Processed)' }),
      peakDetection: null,
    })])
    expect(samples[0]).not.toHaveProperty('dataFile')
    expect(JSON.parse(generateSamplesJson([buildDataset()], { 'sample-1': 'data/a.csv' }))[0].dataFile).toBe('data/a.csv')
  })

  it('lists every module and always regenerates samples.json', () => {
    const files = generatePythonFiles()
    expect(Object.keys(files)).toEqual(PYTHON_FILE_NAMES)
    expect(files['ir_assignments.py']).toContain('def assign_ir_peaks(')
    expect(files['processing.py']).toContain('def process_spectrum(')

    const effective = effectivePythonFiles([buildDataset()], 'print(1)', { 'processing.py': '# edited' })
    expect(Object.keys(effective).sort()).toEqual([...PROJECT_FILE_NAMES].sort())
    expect(effective['main.py']).toBe('print(1)')
    expect(effective['processing.py']).toBe('# edited')
    expect(JSON.parse(effective['samples.json'])[0].id).toBe('sample-1')
  })

  it('migrates main.py overrides that embedded the sample list', () => {
    const legacy = 'import json\nfrom processing import process_spectrum\n\nSAMPLES = json.loads("[{\\"id\\":\\"x\\"}]")\n\n# user edit\n'
    const migrated = migrateLegacyMainScript(legacy)
    expect(migrated).not.toContain('json.loads(')
    expect(migrated).toContain("with_name('samples.json')")
    expect(migrated).toContain('SAMPLES = load_samples()')
    expect(migrated).toContain('# user edit')
    expect(migrateLegacyMainScript(migrated)).toBe(migrated)
  })
})
