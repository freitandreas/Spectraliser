import { projectStore } from '../../state/projectStore'
import { parseDelimitedCollection, parseXlsxCollection, type ImportOptions } from './parsers'
import { validateImportOptions } from './importWizard'
import { axisDefaultsFor } from '../spectrumPresets'
import { normalizeImportedSeries } from './normalize'

type DatasetImportInput = Parameters<typeof projectStore.importDatasets>[0][number]

async function prepareFile(
  file: File,
  options: ImportOptions,
  fileIndex: number,
): Promise<{ datasets: DatasetImportInput[]; error: null } | { datasets: []; error: string }> {
  const issues = validateImportOptions(options)
  if (issues.length) return { datasets: [], error: issues.join(' ') }

  try {
    const collection = file.name.toLowerCase().endsWith('.xlsx')
      ? parseXlsxCollection(await file.arrayBuffer(), options)
      : parseDelimitedCollection(await file.text(), options)
    if (!collection.series.length) {
      return { datasets: [], error: `No numeric X/Y rows could be parsed from ${file.name} with the current import settings.` }
    }

    const sourcePath = file.webkitRelativePath?.trim().length ? file.webkitRelativePath : file.name
    const baseLabel = file.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ').trim() || file.name
    const parsedSeries = collection.series.map((series) => ({
      ...series,
      spectrumType: options.spectrumType ?? series.spectrumType,
    }))
    const detectedTypes = [...new Set(parsedSeries.map((series) => series.spectrumType ?? 'uv-vis'))]
    if (detectedTypes.length > 1) {
      return { datasets: [], error: `${file.name} contains multiple spectrum types. Import one spectrum type per project.` }
    }

    const datasets = parsedSeries.map((series, index) => {
      const spectrumType = series.spectrumType ?? detectedTypes[0] ?? 'uv-vis'
      const defaults = axisDefaultsFor(spectrumType)
      const metadata = options.axisMetadata ?? {
        xQuantity: series.xQuantity ?? defaults.xQuantity,
        xUnit: series.xUnit ?? defaults.x,
        yQuantity: series.yQuantity ?? defaults.yQuantity,
        yUnit: series.yUnit ?? defaults.y,
      }
      const overrides = options.seriesLabelOverridesByFile?.[fileIndex] ?? options.seriesLabelOverrides
      const override = overrides?.[index]?.trim()
      const fallbackLabel = parsedSeries.length > 1 ? `${baseLabel} — ${index + 1}` : baseLabel
      const label = override || (options.hasHeader && series.label.trim() ? series.label : fallbackLabel)

      return {
        name: file.name,
        sourcePath,
        label,
        parsed: normalizeImportedSeries(series, spectrumType, metadata),
      }
    })

    return { datasets, error: null }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Could not normalize imported spectrum values.'
    return { datasets: [], error: `${file.name}: ${reason}` }
  }
}

export async function importFilesWithOptions(files: File[], options: ImportOptions): Promise<string | null> {
  const allDatasets: DatasetImportInput[] = []
  for (const [fileIndex, file] of files.entries()) {
    const prepared = await prepareFile(file, options, fileIndex)
    if (prepared.error) return prepared.error
    allDatasets.push(...prepared.datasets)
  }
  return projectStore.importDatasets(allDatasets)
}

export async function importFileWithOptions(file: File, options: ImportOptions): Promise<string | null> {
  return importFilesWithOptions([file], options)
}
