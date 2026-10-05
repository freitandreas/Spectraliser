import { describe, expect, it } from 'vitest'
import { dataTableRows, excelSheets, latexReport, latexTables, reportHtml } from '../src/services/export/exportData'
import { buildReportContent } from '../src/services/export/reportContent'
import { DEFAULT_EXPORT_SETTINGS } from '../src/services/export/exportSettings'
import { addPngResolution } from '../src/services/export/pngResolution'
import type { AppState } from '../src/types/project'
import { deriveGeneralSettings } from '../src/services/generalSettings'
import { buildDataset } from './fixtures'

function state(): AppState {
  const dataset = buildDataset({
    name: 'Sample & one.csv',
    style: { lineColor: '#fff', lineWidth: 2, scatterSymbol: 'circle', label: 'Sample & one' },
    units: { x: 'nm', y: 'Absorbance', xQuantity: 'Wavelength', yQuantity: 'Absorbance' },
  })
  return {
    version: '1.0.0',
    projectName: 'Export test',
    createdAt: '',
    updatedAt: '',
    datasets: [dataset],
    viewState: { zoomRangeX: null, zoomRangeY: null, activeTab: 'sample_view', selectedSpectrumId: dataset.id },
    scriptSyncEnabled: true,
    syncMode: 'gui_synchronized',
    generatedScript: '',
    userScriptOverride: null,
    autosaveEnabled: false,
  }
}

describe('export data formats', () => {
  it('exports row-wise data with original and processed ordinates', () => {
    expect(dataTableRows(state().datasets)).toEqual([
      ['Sample & one', '200', '0.1', '0.1'],
      ['Sample & one', '201', '0.2', '0.2'],
    ])
  })

  it('renders the processing, sample metadata, and peak sections in HTML and LaTeX reports', () => {
    const project = state()
    const [sample] = project.datasets
    project.generalSettings = { ...deriveGeneralSettings([sample], null), pipeline: sample.pipeline.map((step) => ({ ...step, params: { ...step.params } })) }
    const settings = { ...DEFAULT_EXPORT_SETTINGS, fontFamily: 'Times New Roman', widthCm: 8.5 }
    const content = buildReportContent(project)
    const html = reportHtml(content, 'data:image/png;base64,AA==', settings)
    expect(html).toContain('<h2>Measurement and processing</h2>')
    expect(html).not.toContain('Processing deviating')
    expect(html).toContain('<p class="caption">Peaks of Sample &amp; one.')
    expect(html).toContain('Sample &amp; one')
    expect(html).toContain('Times New Roman')
    expect(html).toContain('style="width:8.5cm"')
    expect(html).not.toContain('max-height')
    const latex = latexReport(content, settings)
    expect(latex).toContain('\\section{Measurement and processing}')
    expect(latex).not.toContain('Processing deviating')
    expect(latex).toContain('\\captionof{table}{Peaks of Sample \\& one.')
    expect(latex).toContain('\\usepackage{caption}')
    expect(latex).toContain('\\subsection{Sample \\& one}')
    expect(latex).toContain('\\setmainfont{Times New Roman}')
    expect(latex).toContain('\\includegraphics[width=8.5cm,max width=\\linewidth]{plot.png}')
  })

  it('escapes LaTeX special characters in the tables export', () => {
    const project = state()
    project.datasets[0].style.label = 'Sample \\ & {one}'
    const tables = latexTables(buildReportContent(project))
    expect(tables).toContain('Sample \\textbackslash{} \\& \\{one\\}')
    expect(tables).toContain('\\toprule')
  })

  it('builds Excel sheets for every report section plus the spectral data', () => {
    const project = state()
    const sheets = excelSheets(buildReportContent(project), project.datasets)
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Measurement and processing', 'Sample metadata', 'Sample processing', 'Peaks', 'Spectral data'])
    expect(sheets[4].rows[1]).toEqual(['Sample & one', '200', '0.1', '0.1'])
  })

  it('writes the selected physical resolution into the exported PNG', () => {
    const raw = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/2ioAAAAASUVORK5CYII='), (value) => value.charCodeAt(0))
    const output = addPngResolution(raw, 300)
    let offset = 8
    let phys: DataView | null = null
    let physCount = 0
    while (offset + 12 <= output.length) {
      const view = new DataView(output.buffer, output.byteOffset + offset)
      const size = view.getUint32(0, false)
      const type = String.fromCharCode(...output.subarray(offset + 4, offset + 8))
      if (type === 'pHYs') {
        phys = new DataView(output.buffer, output.byteOffset + offset + 8, size)
        physCount += 1
      }
      offset += size + 12
      if (type === 'IEND') break
    }
    expect(physCount).toBe(1)
    expect(phys?.getUint32(0, false)).toBe(Math.round(300 / 0.0254))
    expect(phys?.getUint32(4, false)).toBe(Math.round(300 / 0.0254))
    expect(phys?.getUint8(8)).toBe(1)
  })
})
