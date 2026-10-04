import type { SpectrumDataset } from '../types/project'
import type { BatchSampleResult } from '../worker/messages'
import { mergeAssignedPeaks, shouldApplyAssignedPeaks } from './peakMerge'

export type SampleRunResult = Extract<BatchSampleResult, { ordinateModified: unknown }>

/**
 * Applies one runner result. The runner only returns the modified ordinate and
 * the assigned peaks, so imported measurements, units and display metadata are
 * never written back.
 */
export function applyScriptResult(current: SpectrumDataset, result: SampleRunResult): SpectrumDataset {
  if (result.ordinateModified.length !== current.data.abscissa.length) {
    throw new Error(`Processed data has ${result.ordinateModified.length} points but the sample has ${current.data.abscissa.length}.`)
  }
  return {
    ...current,
    data: {
      ...current.data,
      ordinateModified: result.ordinateModified,
      precision: result.precision,
    },
    peaks: shouldApplyAssignedPeaks(result.peaks, current.spectrumType)
      ? mergeAssignedPeaks(current.peaks, result.peaks)
      : current.peaks,
  }
}
