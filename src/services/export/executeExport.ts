import * as XLSX from 'xlsx'
import type { AppState } from '../../types/project'
import { createZip } from './zipArchive'
import { createPythonProjectArchive } from './pythonProject'
import { excelSheets, latexReport, latexTables, reportHtml } from './exportData'
import { buildReportContent } from './reportContent'
import { exportPixelSize, type ExportSettings } from './exportSettings'
import { downloadReport } from './downloadReport'
import { addPngResolution } from './pngResolution'

function filename(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'spectraliser_export'
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function pngBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const encoded = dataUrl.match(/^data:image\/png;base64,(.+)$/)?.[1]
  if (!encoded) throw new Error('The plot renderer did not return a PNG image.')
  const binary = atob(encoded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function startPrintDocument(target: Window, html: string): void {
  target.document.open()
  target.document.write(html.replace('</body>', '<script>window.addEventListener("load",()=>window.print())</script></body>'))
  target.document.close()
}

export function executeExport(
  state: AppState,
  settings: ExportSettings,
  plotDataUrl: string | null,
  pdfWindow: Window | null = null,
): void {
  const base = filename(state.projectName)
  const { format } = settings
  const report = () => buildReportContent(state, { peakColumns: settings.peakColumns })

  if (format === 'python') {
    download(new Blob([createPythonProjectArchive(state)], { type: 'application/zip' }), `${base}_python.zip`)
    return
  }
  if (format === 'plot-image') {
    if (!plotDataUrl) throw new Error('The plot preview is not ready yet.')
    const { width, height } = exportPixelSize(settings)
    download(new Blob([addPngResolution(pngBytes(plotDataUrl), settings.dpi)], { type: 'image/png' }), `${base}_${width}x${height}.png`)
    return
  }
  if (format === 'excel-table') {
    const workbook = XLSX.utils.book_new()
    for (const sheet of excelSheets(report(), state.datasets)) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name)
    }
    const contents = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    download(new Blob([contents], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}_tables.xlsx`)
    return
  }
  if (format === 'latex-table') {
    download(new Blob([latexTables(report())], { type: 'application/x-tex;charset=utf-8' }), `${base}_tables.tex`)
    return
  }
  if (format === 'pdf-report') {
    if (!pdfWindow) throw new Error('The PDF print window was blocked. Allow pop-ups and try again.')
    startPrintDocument(pdfWindow, reportHtml(report(), plotDataUrl, settings))
    return
  }
  if (format === 'html') {
    download(new Blob([reportHtml(report(), plotDataUrl, settings)], { type: 'text/html;charset=utf-8' }), `${base}.html`)
    return
  }
  if (format === 'latex-report') {
    if (!plotDataUrl) throw new Error('The plot preview is not ready yet.')
    const entries = [
      { path: 'report.tex', content: latexReport(report(), settings) },
      { path: 'plot.png', content: addPngResolution(pngBytes(plotDataUrl), settings.dpi) },
    ]
    download(new Blob([createZip(entries)], { type: 'application/zip' }), `${base}_latex.zip`)
    return
  }

  downloadReport(format)
}
