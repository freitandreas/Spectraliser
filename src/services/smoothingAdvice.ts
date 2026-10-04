import type { SmoothingSuggestion } from '../worker/messages'
import type { SpectrumDataset } from '../types/project'

export type SmoothingAdvice = {
  params: { window_length: number; polyorder: number } | null
  /** True when the data should not be smoothed at all, so the step must be switched off. */
  disable: boolean
  message: string
}

const STATUS_MESSAGES: Record<Exclude<SmoothingSuggestion['status'], 'ok'>, string> = {
  noise_free: 'Smoothing switched off: the noise level is negligible.',
  too_narrow: 'Smoothing switched off: the bands are too narrow to smooth without distorting them.',
  too_short: 'Too few points to estimate the noise level.',
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Ordinate the tuner sees: the original data inside the crop window when cropping is on. */
export function smoothingInput(dataset: SpectrumDataset): number[] {
  const crop = dataset.pipeline.find((step) => step.type === 'crop' && step.enabled)
  const { abscissa, ordinateOriginal } = dataset.data
  if (!crop) return ordinateOriginal.filter(Number.isFinite)
  const low = Number(crop.params.x_min ?? -Infinity)
  const high = Number(crop.params.x_max ?? Infinity)
  return ordinateOriginal.filter((value, index) => Number.isFinite(value) && abscissa[index] >= low && abscissa[index] <= high)
}

/**
 * One parameter set for all given samples: the median window (made odd) and the
 * most frequent order among the samples that can be smoothed safely.
 */
export function combineSmoothingSuggestions(suggestions: SmoothingSuggestion[]): SmoothingAdvice {
  const usable = suggestions.filter((item) => item.status === 'ok')
  if (usable.length === 0) {
    const counts = new Map<Exclude<SmoothingSuggestion['status'], 'ok'>, number>()
    for (const item of suggestions) {
      if (item.status !== 'ok') counts.set(item.status, (counts.get(item.status) ?? 0) + 1)
    }
    const status = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'too_short'
    return { params: null, disable: status !== 'too_short', message: STATUS_MESSAGES[status] }
  }

  const orders = usable.map((item) => item.polyorder)
  const polyorder = [...new Set(orders)]
    .sort((a, b) => orders.filter((o) => o === b).length - orders.filter((o) => o === a).length || a - b)[0]
  let window = Math.round(median(usable.map((item) => item.windowLength)))
  if (window % 2 === 0) window -= 1
  window = Math.max(window, polyorder + 3)

  const snr = median(usable.map((item) => item.snr ?? 0))
  const fwhm = usable.map((item) => item.fwhmPoints).filter((value): value is number => value !== null)
  const parts = [
    `Window ${window}, order ${polyorder}`,
    `S/N ≈ ${snr.toPrecision(3)}`,
    fwhm.length ? `narrowest bands ≈ ${median(fwhm).toFixed(1)} points FWHM` : 'no resolved band',
  ]
  if (suggestions.length > 1) parts.push(`${usable.length} of ${suggestions.length} samples`)
  return { params: { window_length: window, polyorder }, disable: false, message: `${parts.join(' · ')}.` }
}
