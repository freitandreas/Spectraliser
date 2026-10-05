import type { SpectrumDataset } from '../../types/project'
import type { PlotStylePreferences } from '../../services/startupPreferences'

export interface PlotView {
  datasets: SpectrumDataset[]
  plotStyle: PlotStylePreferences
  selectedSpectrumId: string | null
}

/**
 * Reduces any plot mode to a plain 2D spectrum of one series (with its peaks), independent of
 * the series' visibility.
 */
export function singleSeriesView(dataset: SpectrumDataset, plotStyle: PlotStylePreferences): PlotView {
  return {
    datasets: [dataset],
    plotStyle: { ...plotStyle, plotMode: 'overlay' },
    selectedSpectrumId: dataset.id,
  }
}
