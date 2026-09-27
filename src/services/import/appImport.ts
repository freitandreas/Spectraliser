import { projectStore } from '../../state/projectStore'
import { parseDelimitedCollection, parseXlsxCollection, type ImportOptions } from './parsers'
import { validateImportOptions } from './importWizard'

export async function importFileWithOptions(file: File, options: ImportOptions): Promise<string | null> {
  const issues = validateImportOptions(options)
  if (issues.length) return issues.join(' ')

  const collection = file.name.toLowerCase().endsWith('.xlsx')
    ? parseXlsxCollection(await file.arrayBuffer(), options)
    : parseDelimitedCollection(await file.text(), options)
  if (!collection.series.length) return 'No numeric X/Y rows could be parsed with the current import settings.'

  const sourcePath = file.webkitRelativePath?.trim().length ? file.webkitRelativePath : file.name
  const baseLabel = file.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ').trim() || file.name
  const requestedType = options.spectrumType ?? 'auto'
  const parsedSeries = collection.series.map((series) => ({
    ...series,
    spectrumType: requestedType === 'auto' ? series.spectrumType : requestedType,
  }))
  const detectedTypes = [...new Set(parsedSeries.map((series) => series.spectrumType ?? 'uv-vis'))]
  if (detectedTypes.length > 1) {
    return 'The selected file contains multiple spectrum types. Import one spectrum type per project.'
  }

  return projectStore.importDatasets(parsedSeries.map((series, index) => ({
    name: file.name,
    sourcePath,
    label: options.seriesLabelOverrides?.[index]?.trim() || (options.hasHeader ? series.label
      : (collection.series.length > 1 ? `${baseLabel} ${index + 1}` : baseLabel)),
    parsed: {
      abscissa: series.abscissa,
      ordinate: series.ordinate,
      xUnit: series.xUnit,
      yUnit: series.yUnit,
      spectrumType: series.spectrumType,
    },
  })))
}
