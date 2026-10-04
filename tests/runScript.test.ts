import { describe, expect, it } from 'vitest'
import { buildRunScript, runnerMetadata, runnerScriptFiles } from '../src/services/script/runScript'
import { scriptExecutionKey } from '../src/state/executionCache'
import { buildDataset } from './fixtures'

describe('generated runner', () => {
  it('lists only the changed samples and never runs main.py', () => {
    const script = buildRunScript(['a', 'b"c'])
    expect(script).toContain('CHANGED_SAMPLE_IDS = ["a","b\\"c"]')
    expect(script).toContain('from processing import process_spectrum')
    expect(script).toContain('run_results = run_samples(CHANGED_SAMPLE_IDS, runner_samples, process_spectrum, assign_ir_peaks)')
    expect(script).not.toMatch(/import main|main\.py'|exec\(/)
  })

  it('sends only the editable modules, so main.py and samples.json edits do not re-run samples', () => {
    const files = { 'main.py': 'print(1)', 'processing.py': 'x = 1', 'samples.json': '[]' }
    expect(Object.keys(runnerScriptFiles(files))).toEqual(['processing.py'])
    const dataset = buildDataset()
    expect(scriptExecutionKey(dataset, runnerScriptFiles({ ...files, 'main.py': 'print(2)' }), 'float32'))
      .toBe(scriptExecutionKey(dataset, runnerScriptFiles(files), 'float32'))
  })

  it('passes script inputs only, without display metadata', () => {
    const metadata = runnerMetadata(buildDataset())
    expect(Object.keys(metadata).sort()).toEqual(['peakDetection', 'pipeline', 'spectrumType', 'units'])
    expect(metadata.peakDetection.mode).toBe('maxima')
  })
})
