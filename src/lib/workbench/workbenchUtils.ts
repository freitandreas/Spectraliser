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
]

export const PEAK_PROFILE_MODELS: DescribedOption[] = [
  { id: 'gaussian', label: 'Gaussian', description: 'Symmetric bell shape; fits instrument- and Doppler-broadened bands.' },
  { id: 'lorentzian', label: 'Lorentzian', description: 'Narrow core with heavy tails; fits lifetime-broadened bands.' },
]

export function describeOption(options: DescribedOption[], id: string): string {
  return options.find((option) => option.id === id)?.description ?? ''
}

export const COLOR_PALETTES: Array<{ id: string; name: string; colors: string[] }> = [
  { id: 'default', name: 'Default Blue', colors: ['#4fc1ff', '#8ea0b4', '#8bd17c', '#f2c14e', '#e57373'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0f5e9c', '#1c7ed6', '#3bc9db', '#66d9e8', '#a5f3fc'] },
  { id: 'sunset', name: 'Sunset', colors: ['#ff6b6b', '#ff922b', '#ffd43b', '#f76707', '#e64980'] },
  { id: 'mono', name: 'Monochrome', colors: ['#e6e6e6', '#bfbfbf', '#999999', '#737373', '#4d4d4d'] },
]

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
