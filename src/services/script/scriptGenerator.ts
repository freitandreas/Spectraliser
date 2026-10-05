import { peakDetectionFor, type SpectrumDataset } from '../../types/project'
import mainSource from '../../python/main.py?raw'
import processingSource from '../../python/processing.py?raw'
import sampleIoSource from '../../python/sample_io.py?raw'
import irAssignmentsSource from '../../python/ir_assignments.py?raw'
import irReferenceSource from '../../python/ir_reference.py?raw'
import peakDetectionSource from '../../python/peak_detection.py?raw'

export const PYTHON_FILE_NAMES = [
  'main.py', 'processing.py', 'sample_io.py', 'peak_detection.py', 'ir_assignments.py', 'ir_reference.py',
] as const
export const SAMPLES_FILE_NAME = 'samples.json'
/** Every file of the exported project; samples.json is generated and never edited directly. */
export const PROJECT_FILE_NAMES = [...PYTHON_FILE_NAMES, SAMPLES_FILE_NAME] as const

export type PythonFileName = typeof PYTHON_FILE_NAMES[number]
export type ProjectFileName = typeof PROJECT_FILE_NAMES[number]
export type PythonFiles = Record<PythonFileName, string>
export type ProjectFiles = Record<ProjectFileName, string>

const SAMPLES_LOADER = 'SAMPLES = load_samples()'
const LEGACY_EMBEDDED_SAMPLES = /^SAMPLES = json\.loads\(.*\)$/m

/**
 * Sample metadata for standalone runs; display edits only change this file, never
 * main.py. `dataFiles` maps sample ids to exported CSV paths relative to main.py.
 */
export function generateSamplesJson(datasets: SpectrumDataset[], dataFiles: Record<string, string> = {}): string {
  const samples = datasets.map(({ id, name, sourcePath, spectrumType, units, style, pipeline, peakDetection }) => ({
    id,
    name,
    sourcePath,
    ...(dataFiles[id] ? { dataFile: dataFiles[id] } : {}),
    spectrumType,
    units,
    style,
    pipeline,
    peakDetection: peakDetection ? peakDetectionFor(spectrumType, peakDetection) : null,
  }))
  return `${JSON.stringify(samples, null, 2)}\n`
}

/**
 * Older projects embedded the sample list into main.py. Rewrites that line so
 * saved overrides read samples.json, keeping every other user edit intact.
 */
export function migrateLegacyMainScript(source: string): string {
  if (!LEGACY_EMBEDDED_SAMPLES.test(source)) return source
  const replaced = source.replace(LEGACY_EMBEDDED_SAMPLES, SAMPLES_LOADER)
  return replaced.includes('def load_samples(') ? replaced : replaced.replace(
    SAMPLES_LOADER,
    [
      'from pathlib import Path',
      '',
      '',
      'def load_samples():',
      "    with open(Path(__file__).with_name('samples.json'), encoding='utf-8') as handle:",
      '        return json.load(handle)',
      '',
      '',
      SAMPLES_LOADER,
    ].join('\n'),
  )
}

export function generatePythonFiles(): PythonFiles {
  return {
    'main.py': mainSource,
    'processing.py': processingSource,
    'sample_io.py': sampleIoSource,
    'peak_detection.py': peakDetectionSource,
    'ir_assignments.py': irAssignmentsSource,
    'ir_reference.py': irReferenceSource,
  }
}

// Existing consumers and saved projects still address main.py as generatedScript.
export function generatePythonScript(_datasets?: SpectrumDataset[]): string {
  return mainSource
}

export function effectivePythonFiles(
  datasets: SpectrumDataset[],
  generatedScript: string,
  overrides: Partial<PythonFiles>,
): ProjectFiles {
  return {
    ...generatePythonFiles(),
    'main.py': generatedScript,
    ...overrides,
    [SAMPLES_FILE_NAME]: generateSamplesJson(datasets),
  }
}
