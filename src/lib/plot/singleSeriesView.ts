import type { SpectrumDataset } from '../../types/project'
import type { PlotStylePreferences } from '../../services/startupPreferences'

export interface PlotView {
  datasets: SpectrumDataset[]
  plotStyle: PlotStylePreferences
  selectedSpectrumId: string | null
}

/**
 * Reduces any plot mode to a plain 2D spectrum of one series (with its peaks), independent of
 * the series' visibility. Interpolation is switched off because a single series has no neighbours.
 */
export function singleSeriesView(dataset: SpectrumDataset, plotStyle: PlotStylePreferences): PlotView {
  return {
    datasets: [dataset],
    plotStyle: {
      ...plotStyle,
      plotMode: 'overlay',
      seriesInterpolation: { ...plotStyle.seriesInterpolation, enabled: false },
    },
    selectedSpectrumId: dataset.id,
  }
}
