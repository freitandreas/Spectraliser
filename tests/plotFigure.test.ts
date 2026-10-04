import { describe, expect, it } from 'vitest'
import type { SpectrumDataset } from '../src/types/project'
import { buildPlotFigure } from '../src/lib/plot/plotFigure'
import { DEFAULT_STARTUP_PREFERENCES, type PlotStylePreferences } from '../src/services/startupPreferences'

function dataset(id: string, label: string, scale: number): SpectrumDataset {
  return {
    id,
    name: `${id}.csv`,
    sourcePath: `${id}.csv`,
    spectrumType: 'uv-vis',
    units: { x: 'nm', y: '', xQuantity: 'Wavelength', yQuantity: 'Absorbance' },
    data: { abscissa: [400, 450, 500], ordinateOriginal: [0, scale, 0], ordinateModified: [0, scale, 0], precision: 'float64' },
    pipeline: [],
    style: { lineColor: '#ffffff', lineWidth: 2, scatterSymbol: 'circle', label },
    peaks: [],
  }
}

const datasets = [dataset('a', 't = 0 s', 1), dataset('b', 't = 1 min', 2)]
const style = (patch: Partial<PlotStylePreferences>): PlotStylePreferences => ({ ...DEFAULT_STARTUP_PREFERENCES.plotStyle, ...patch })

describe('plot figure', () => {
  it('labels overlay axes with Plotly title objects in the selected format', () => {
    const figure = buildPlotFigure({ datasets, plotStyle: style({ axisLabelFormat: 'in' }) })
    expect(figure.mode).toBe('overlay')
    expect(figure.layout.xaxis).toMatchObject({ title: { text: 'Wavelength in nm' } })
    expect(figure.layout.yaxis).toMatchObject({ title: { text: 'Absorbance' } })
    expect(figure.traces.filter((trace) => trace.type === 'scatter')).toHaveLength(2)
  })

  it('uses TeX fractions only when requested', () => {
    const figure = buildPlotFigure({ datasets, plotStyle: style({ axisLabelFormat: 'fraction' }) })
    expect(figure.usesMath).toBe(true)
    expect((figure.layout.xaxis as { title: { text: string } }).title.text).toContain('\\frac')
  })

  it('builds a heatmap with abscissa, time and colour-coded ordinate', () => {
    const figure = buildPlotFigure({ datasets, plotStyle: style({ plotMode: 'heatmap' }) })
    expect(figure.mode).toBe('heatmap')
    expect(figure.traces[0]).toMatchObject({ type: 'heatmap', x: [400, 450, 500], y: [0, 60] })
    expect(figure.layout.yaxis).toMatchObject({ title: { text: 'Time / s' } })
  })

  it('orders heatmap series by concentration metadata in the chosen unit', () => {
    const withConcentration = [
      { ...datasets[0], experimentMetadata: { Concentration: '2 mM' } },
      { ...datasets[1], experimentMetadata: { 'c / µM': '500' } },
    ]
    const figure = buildPlotFigure({ datasets: withConcentration, plotStyle: style({ plotMode: 'heatmap', seriesField: 'concentration', seriesUnit: 'µM' }) })
    expect(figure.traces[0]).toMatchObject({ type: 'heatmap', y: [500, 2000] })
    expect(figure.layout.yaxis).toMatchObject({ title: { text: 'Concentration / µM' } })
  })

  it('falls back to series order with a notice when the third-axis value is missing', () => {
    const figure = buildPlotFigure({ datasets, plotStyle: style({ plotMode: 'heatmap', seriesField: 'concentration', seriesUnit: 'mM' }) })
    expect(figure.layout.yaxis).toMatchObject({ title: { text: 'Series number' } })
    expect(figure.notices.join(' ')).toMatch(/No concentration found for t = 0 s, t = 1 min/)
  })

  it('builds a WebGL surface with labelled scene axes and plain titles', () => {
    const figure = buildPlotFigure({ datasets, plotStyle: style({ plotMode: 'surface3d', axisLabelFormat: 'fraction', seriesUnit: 'min' }) })
    expect(figure.traces[0]).toMatchObject({ type: 'surface', y: [0, 1] })
    expect(figure.usesMath).toBe(false)
    expect(figure.layout.scene).toMatchObject({
      xaxis: { title: { text: 'Wavelength / nm' } },
      yaxis: { title: { text: 'Time / min' } },
      zaxis: { title: { text: 'Absorbance' } },
    })
  })

  it('adds clearly labelled interpolated series without changing the measured traces', () => {
    const before = structuredClone(datasets)
    const figure = buildPlotFigure({ datasets, plotStyle: style({ seriesInterpolation: { enabled: true, steps: 2 } }) })
    expect(figure.generatedSeries).toBe(2)
    expect(figure.traces.filter((trace) => trace.legendgroup === 'interpolated')).toHaveLength(2)
    expect(datasets).toEqual(before)
  })

  it('falls back to overlay with a notice for a single series', () => {
    const figure = buildPlotFigure({ datasets: [datasets[0]], plotStyle: style({ plotMode: 'heatmap' }) })
    expect(figure.mode).toBe('overlay')
    expect(figure.notices.join(' ')).toMatch(/at least two/)
  })

  it('subscripts the ordinate with "norm" only when every plotted series is normalised', () => {
    const normalised = (item: SpectrumDataset): SpectrumDataset => ({
      ...item,
      pipeline: [{ id: 'n', type: 'normalization', scope: 'individual', enabled: true, params: { mode: 'minmax' } }],
    })
    const all = buildPlotFigure({ datasets: datasets.map(normalised), plotStyle: style({}) })
    expect(all.layout.yaxis).toMatchObject({ title: { text: 'Absorbance<sub>norm</sub>' } })
    const mixed = buildPlotFigure({ datasets: [normalised(datasets[0]), datasets[1]], plotStyle: style({}) })
    expect(mixed.layout.yaxis).toMatchObject({ title: { text: 'Absorbance' } })
    expect(mixed.notices.join(' ')).toMatch(/Normalisation is enabled for 1 of 2/)
  })
})
