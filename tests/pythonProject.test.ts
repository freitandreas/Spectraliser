import { describe, expect, it } from 'vitest'
import { crc32, createZip } from '../src/services/export/zipArchive'
import { pythonProjectEntries, sampleCsv } from '../src/services/export/pythonProject'
import type { AppState } from '../src/types/project'
import { buildDataset } from './fixtures'
import { DEFAULT_STARTUP_PREFERENCES, type PlotMode } from '../src/services/startupPreferences'

const plot = { plotStyle: DEFAULT_STARTUP_PREFERENCES.plotStyle, camera: null }

describe('zip archive', () => {
  it('computes standard CRC-32 and writes a valid stored archive', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const zip = createZip([{ path: 'a.txt', content: 'hello' }, { path: 'data/b.csv', content: 'x,y\n' }])
    const view = new DataView(zip.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    expect(createZip([{ path: 'a', content: 'b' }])).toEqual(createZip([{ path: 'a', content: 'b' }]))
  })
})

describe('python project export', () => {
  it('exports the current editor scripts, samples.json and imported measurements', () => {
    const dataset = buildDataset({ units: { x: 'nm', y: '', xQuantity: 'Wavelength', yQuantity: 'Absorbance' } })
    const state = {
      datasets: [dataset, buildDataset({ id: 'sample-2' })],
      generatedScript: 'generated',
      userScriptOverride: 'edited main',
      pythonFileOverrides: { 'main.py': 'edited main', 'processing.py': '# edited processing' },
    } as unknown as AppState
    const entries = Object.fromEntries(pythonProjectEntries(state, plot).map((entry) => [entry.path, entry.content]))
    expect(entries['main.py']).toBe("edited main\n\nif __name__ == '__main__':\n    from plot_project import show_project_plot\n    show_project_plot()\n")
    expect(entries['processing.py']).toBe('# edited processing')
    const samples = JSON.parse(entries['samples.json'] as string)
    expect(samples.map((sample: { dataFile: string }) => sample.dataFile)).toEqual([
      'data/Sample_01_Processed_.csv',
      'data/Sample_01_Processed__2.csv',
    ])
    expect(entries['data/Sample_01_Processed_.csv']).toBe(sampleCsv(dataset))
    expect(sampleCsv(dataset)).toBe('Wavelength / nm,Absorbance\n200,0.1\n201,0.2\n')
    expect(entries['README.md']).toContain('python3 -m venv .venv')
    expect(entries['README.md']).toContain('.\\.venv\\Scripts\\python.exe main.py')
    expect(entries['requirements.txt']).toBe('numpy\npandas\nscipy\nplotly>=6,<7\n')
    expect(entries['plot_project.py']).toContain('auto_open=True')
    expect(entries['README.md']).toContain('current processed figure at export time')
  })

  it.each<PlotMode>(['overlay', 'heatmap', 'surface3d'])('preserves the %s figure, visibility and metadata axes', (plotMode) => {
    const first = buildDataset({
      units: { x: 'nm', y: '', xQuantity: 'Wavelength', yQuantity: 'Absorbance' },
      experimentMetadata: { Time: '0 s' },
      data: { abscissa: [200, 201], ordinateOriginal: [0, 0], ordinateModified: [1, 2], precision: 'float64' },
    })
    const second = buildDataset({ id: 'second', experimentMetadata: { Time: '2 s' } })
    const hidden = buildDataset({ id: 'hidden', style: { ...first.style, visible: false } })
    const state = {
      datasets: [first, second, hidden], generatedScript: 'print("processed")',
      userScriptOverride: null, pythonFileOverrides: {},
    } as unknown as AppState
    const camera = { eye: { x: 2, y: 1, z: 3 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } }
    const entries = Object.fromEntries(pythonProjectEntries(state, {
      plotStyle: { ...plot.plotStyle, plotMode, seriesMode: 'markers', axisLabelFormat: 'in' },
      camera,
    }).map((entry) => [entry.path, entry.content]))
    const figure = JSON.parse(entries['plot.json'] as string)
    expect(figure.data[0].type).toBe(plotMode === 'overlay' ? 'scatter' : plotMode === 'heatmap' ? 'heatmap' : 'surface')
    if (plotMode === 'overlay') {
      expect(figure.data).toHaveLength(2)
      expect(figure.data[0]).toMatchObject({ mode: 'markers', y: [1, 2], opacity: 1 })
      expect(figure.layout.xaxis.title.text).toBe('Wavelength in nm')
    } else {
      expect(figure.data[0].y).toEqual([0, 2])
      expect(figure.data[0].z).toHaveLength(2)
    }
    if (plotMode === 'surface3d') expect(figure.layout.scene.camera).toEqual(camera)
    expect(JSON.parse(entries['samples.json'] as string)).toHaveLength(3)
  })
})
