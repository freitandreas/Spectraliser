export type SampleSubView = 'data' | 'peaks'
export type ResizeKind = 'left' | 'right' | 'bottom'

export interface DescribedOption {
  id: string
  label: string
  description: string
}

export const NORMALIZATION_MODES: DescribedOption[] = [
  { id: 'minmax', label: 'Min-max', description: 'Rescales each spectrum so its lowest point is 0 and its highest is 1.' },
  { id: 'vector', label: 'Vector', description: 'Divides by the Euclidean norm, keeping relative band ratios intact.' },
  { id: 'area', label: 'Area', description: 'Divides by the absolute integrated area, so every spectrum carries equal area.' },
  { id: 'peak', label: 'Peak', description: 'Divides by the largest absolute intensity in the spectrum.' },
  { id: 'reference', label: 'Reference window', description: 'Divides by the mean in a chosen axis window; refuses a near-zero reference.' },
]

export const PEAK_PROFILE_MODELS: DescribedOption[] = [
  { id: 'gaussian', label: 'Gaussian', description: 'Symmetric bell shape; fits instrument- and Doppler-broadened bands.' },
  { id: 'lorentzian', label: 'Lorentzian', description: 'Narrow core with heavy tails; fits lifetime-broadened bands.' },
]

export function describeOption(options: DescribedOption[], id: string): string {
  return options.find((option) => option.id === id)?.description ?? ''
}

export { COLOR_PALETTES } from '../../services/palettes'

export function makeSampleTabId(datasetId: string, subView: SampleSubView): string {
  return `${datasetId}::${subView}`
}

export function parseSampleTabId(tabId: string): { datasetId: string; subView: SampleSubView } | null {
  if (tabId === 'script_view') {
    return null
  }

  const [datasetId, subViewRaw] = tabId.split('::')
  if (!datasetId) {
    return null
  }

  const subView: SampleSubView = subViewRaw === 'peaks' ? 'peaks' : 'data'
  return { datasetId, subView }
}
