import type { SpectrumDataset } from '../types/project'
import type { ComputePrecision } from '../services/startupPreferences'
import { arrayId } from '../services/arrayIdentity'

/** FNV-1a (32 bit, two seeds) keeps cache keys short even for long script files. */
function hashString(value: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ value.length
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193)
    b = Math.imul(b ^ code, 0x5bd1e995)
  }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}:${value.length}`
}

/**
 * Identifies everything that can change the Python result for one sample. Labels,
 * colours, widths, visibility and peak labels are deliberately excluded: they are
 * display metadata and must never cause the script to run again.
 */
export function scriptExecutionKey(
  dataset: SpectrumDataset,
  scriptFiles: Record<string, string>,
  precision: ComputePrecision,
): string {
  const files = Object.keys(scriptFiles)
    .filter((name) => name.endsWith('.py'))
    .sort()
    .map((name) => [name, scriptFiles[name]])
  return hashString(JSON.stringify({
    precision,
    files,
    id: dataset.id,
    spectrumType: dataset.spectrumType,
    units: [dataset.units.x, dataset.units.y, dataset.units.xQuantity ?? '', dataset.units.yQuantity ?? ''],
    pipeline: dataset.pipeline,
    // Only the IR assignment step reads peak settings; elsewhere they must not force reprocessing.
    peakDetection: dataset.spectrumType === 'ir' ? dataset.peakDetection ?? null : null,
    abscissa: arrayId(dataset.data.abscissa),
    ordinate: arrayId(dataset.data.ordinateOriginal),
  }))
}

/** Remembers the inputs whose results are currently applied to each sample. */
export class ExecutionCache {
  private readonly keys = new Map<string, string>()

  isCurrent(datasetId: string, key: string): boolean {
    return this.keys.get(datasetId) === key
  }

  remember(datasetId: string, key: string): void {
    this.keys.set(datasetId, key)
  }

  forget(datasetId: string): void {
    this.keys.delete(datasetId)
  }

  retainOnly(datasetIds: Iterable<string>): void {
    const keep = new Set(datasetIds)
    for (const id of [...this.keys.keys()]) {
      if (!keep.has(id)) this.keys.delete(id)
    }
  }

  clear(): void {
    this.keys.clear()
  }
}
