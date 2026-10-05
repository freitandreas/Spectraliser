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

  it('builds a WebGL surface with labelled scene axes and markup titles', () => {
    const figure = buildPlotFigure({ datasets, plotStyle: style({ plotMode: 'surface3d', axisLabelFormat: 'fraction', seriesUnit: 'min' }) })
    expect(figure.traces[0]).toMatchObject({ type: 'surface', y: [0, 1] })
    expect(figure.usesMath).toBe(false)
    expect(figure.layout.scene).toMatchObject({
      zaxis: { title: { text: 'Absorbance' } },
    })
    const scene = figure.layout.scene as Record<string, { title: { text: string } }>
    expect(scene.xaxis.title.text).toMatch(/^Wavelength<br>─+<br>nm$/)
    expect(scene.yaxis.title.text).toMatch(/^Time<br>─+<br>min$/)
    expect(JSON.stringify(scene)).not.toContain('$')
  })

  it('renders symbol subscripts as markup in WebGL scene titles', () => {
    const figure = buildPlotFigure({ datasets, plotStyle: style({ plotMode: 'surface3d', quantityNotation: 'symbol' }) })
    const scene = figure.layout.scene as Record<string, { title: { text: string } }>
    expect(scene.xaxis.title.text).toBe('<i>λ</i> / nm')
    expect(scene.zaxis.title.text).toContain('<i>')
  })

  it('draws only measured series in the overlay', () => {
    const figure = buildPlotFigure({ datasets, plotStyle: style({ plotMode: 'overlay' }) })
    expect(figure.traces.filter((trace) => trace.type === 'scatter' && trace.legendgroup !== 'peaks')).toHaveLength(datasets.length)
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

  describe('presentation (export) figures', () => {
    const peak = (id: string, index: number, x: number) => ({ id, index, x, y: 1 }) as SpectrumDataset['peaks'][number]
    const withPeaks = [
      { ...datasets[0], peaks: [peak('pa', 1, 450)] },
      { ...datasets[1], peaks: [peak('pb', 1, 450), peak('pc', 2, 500)] },
    ]

    it('draws every series equally even when one is selected or highlighted', () => {
      const figure = buildPlotFigure({ datasets: withPeaks, plotStyle: style({}), selectedSpectrumId: 'a', highlightedDatasetId: 'b', presentation: true, showPeaks: false })
      const lines = figure.traces.slice(0, 2)
      expect(lines.map((trace) => trace.opacity)).toEqual([1, 1])
      expect(lines.map((trace) => (trace.line as { width: number }).width)).toEqual([2, 2])
      expect(figure.traces).toHaveLength(2)
      expect(figure.layout.annotations).toEqual([])
    })

    it('shows the peaks of all series when peaks are enabled', () => {
      const figure = buildPlotFigure({ datasets: withPeaks, plotStyle: style({}), selectedSpectrumId: 'a', presentation: true, showPeaks: true })
      const peakTraces = figure.traces.filter((trace) => trace.name === 'Peaks')
      expect(peakTraces.map((trace) => trace.x)).toEqual([[450], [450, 500]])
      expect(figure.layout.annotations).toHaveLength(3)
    })

    it('marks peaks of all series without a selection guide in the heatmap', () => {
      const figure = buildPlotFigure({ datasets: withPeaks, plotStyle: style({ plotMode: 'heatmap' }), selectedSpectrumId: 'a', presentation: true, showPeaks: true })
      expect(figure.traces.filter((trace) => trace.name === 'Peaks')).toHaveLength(2)
      expect(figure.layout.shapes).toEqual([])
      expect(figure.layout.annotations).toHaveLength(3)
    })
  })
})
