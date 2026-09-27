import type { SpectrumDataset } from '../../types/project'
import mainSource from '../../python/main.py?raw'
import processingSource from '../../python/processing.py?raw'
import sampleIoSource from '../../python/sample_io.py?raw'
import irAssignmentsSource from '../../python/ir_assignments.py?raw'
import irReferenceSource from '../../python/ir_reference.py?raw'
import peakDetectionSource from '../../python/peak_detection.py?raw'

export const PYTHON_FILE_NAMES = [
  'main.py', 'processing.py', 'sample_io.py', 'peak_detection.py', 'ir_assignments.py', 'ir_reference.py',
] as const

export type PythonFileName = typeof PYTHON_FILE_NAMES[number]
export type PythonFiles = Record<PythonFileName, string>

export function generatePythonFiles(datasets: SpectrumDataset[]): PythonFiles {
  const samples = datasets.map(({ id, name, sourcePath, spectrumType, units, style, pipeline }) => ({
    id, name, sourcePath, spectrumType, units, style, pipeline,
  }))
  // A JSON string literal is safe to embed in a Python json.loads expression.
  const literal = JSON.stringify(JSON.stringify(samples))
  return {
    'main.py': mainSource.replace('SAMPLES = json.loads("[]")', `SAMPLES = json.loads(${literal})`),
    'processing.py': processingSource,
    'sample_io.py': sampleIoSource,
    'peak_detection.py': peakDetectionSource,
    'ir_assignments.py': irAssignmentsSource,
    'ir_reference.py': irReferenceSource,
  }
}

// Existing consumers and saved projects still address main.py as generatedScript.
export function generatePythonScript(datasets: SpectrumDataset[]): string {
  return generatePythonFiles(datasets)['main.py']
}

export function effectivePythonFiles(
  datasets: SpectrumDataset[],
  generatedScript: string,
  overrides: Partial<PythonFiles>,
): PythonFiles {
  return { ...generatePythonFiles(datasets), 'main.py': generatedScript, ...overrides }
}
