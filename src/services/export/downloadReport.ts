import { projectStore } from '../../state/projectStore'
import { generateSelfContainedHtmlReport } from './htmlReport'

export type ExportFormat = 'html' | 'csv' | 'json'

function sanitizeFilename(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'spectraliser_export'
}

function buildCsvReport(state: ReturnType<typeof projectStore.snapshot>): string {
  const rows = state.datasets.map((dataset) => {
    const abscissaValues = dataset.data.abscissa
    const ordinateValues = dataset.data.ordinateModified
    const minX = abscissaValues.length ? Math.min(...abscissaValues) : ''
    const maxX = abscissaValues.length ? Math.max(...abscissaValues) : ''
    const minY = ordinateValues.length ? Math.min(...ordinateValues) : ''
    const maxY = ordinateValues.length ? Math.max(...ordinateValues) : ''

    return [
      dataset.name,
      dataset.style.label,
      dataset.spectrumType,
      dataset.units.x,
      dataset.units.y,
      String(abscissaValues.length),
      String(minX),
      String(maxX),
      String(minY),
      String(maxY),
    ].join(',')
  })

  const header = ['name', 'label', 'spectrumType', 'xUnits', 'yUnits', 'pointCount', 'minX', 'maxX', 'minY', 'maxY'].join(',')
  return [header, ...rows].join('\n')
}

export function downloadReport(format: ExportFormat = 'html'): void {
  const state = projectStore.snapshot()
  const filenameBase = sanitizeFilename(state.projectName)

  let blob: Blob
  let filename: string
  let mimeType: string

  if (format === 'csv') {
    blob = new Blob([buildCsvReport(state)], { type: 'text/csv;charset=utf-8' })
    filename = `${filenameBase}.csv`
    mimeType = 'text/csv;charset=utf-8'
  } else if (format === 'json') {
    blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' })
    filename = `${filenameBase}.json`
    mimeType = 'application/json;charset=utf-8'
  } else {
    blob = new Blob([generateSelfContainedHtmlReport(state)], { type: 'text/html;charset=utf-8' })
    filename = `${filenameBase}.html`
    mimeType = 'text/html;charset=utf-8'
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
