import type { AppState, SpectrumDataset } from '../../types/project'
import { effectivePythonFiles, generateSamplesJson, SAMPLES_FILE_NAME } from '../script/scriptGenerator'
import { axisLabel } from '../spectrumPresets'
import { createZip, type ZipEntry } from './zipArchive'
import { buildPlotFigure } from '../../lib/plot/plotFigure'
import type { SceneCamera } from '../../lib/plot/sceneCamera'
import type { PlotStylePreferences } from '../startupPreferences'
import plotSource from '../../python/plot_project.py?raw'
import { PYTHON_PROJECT_README, PYTHON_PROJECT_REQUIREMENTS } from './pythonReadme'

export interface PythonProjectPlot {
  plotStyle: PlotStylePreferences
  camera: SceneCamera | null
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function axisHeader(quantity: string | undefined, unit: string, fallback: string): string {
  return axisLabel(quantity || fallback, unit, 'slash')
}

/** The imported (unprocessed) measurement, so the exported script reproduces the app pipeline. */
export function sampleCsv(dataset: SpectrumDataset): string {
  const header = [
    csvField(axisHeader(dataset.units.xQuantity, dataset.units.x, 'Abscissa')),
    csvField(axisHeader(dataset.units.yQuantity, dataset.units.y, 'Ordinate')),
  ].join(',')
  const rows = dataset.data.abscissa.map((x, index) => `${x},${dataset.data.ordinateOriginal[index]}`)
  return `${[header, ...rows].join('\n')}\n`
}

function uniqueDataPaths(datasets: SpectrumDataset[]): Record<string, string> {
  const used = new Set<string>()
  const paths: Record<string, string> = {}
  for (const dataset of datasets) {
    const stem = (dataset.style.label || dataset.name).trim().replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '_') || 'sample'
    let candidate = `data/${stem}.csv`
    for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `data/${stem}_${suffix}.csv`
    used.add(candidate)
    paths[dataset.id] = candidate
  }
  return paths
}

/** Current editor files (including unsaved-to-GUI overrides), samples.json and sample data. */
export function pythonProjectEntries(state: AppState, plot: PythonProjectPlot): ZipEntry[] {
  const files = effectivePythonFiles(state.datasets, state.generatedScript, {
    ...state.pythonFileOverrides,
    ...(state.userScriptOverride !== null ? { 'main.py': state.userScriptOverride } : {}),
  })
  const dataPaths = uniqueDataPaths(state.datasets)
  const figure = buildPlotFigure({
    datasets: state.datasets.filter((dataset) => dataset.style.visible !== false),
    plotStyle: plot.plotStyle,
    presentation: true,
    showPeaks: true,
  })
  const scene = figure.layout.scene
  const layout = scene && typeof scene === 'object' && plot.camera
    ? { ...figure.layout, scene: { ...scene, camera: plot.camera } }
    : figure.layout
  return [
    ...Object.entries(files)
      .filter(([name]) => name !== SAMPLES_FILE_NAME)
      .map(([path, content]) => ({
        path,
        content: path === 'main.py'
          ? `${content}\n\nif __name__ == '__main__':\n    from plot_project import show_project_plot\n    show_project_plot()\n`
          : content,
      })),
    { path: 'README.md', content: PYTHON_PROJECT_README },
    { path: 'requirements.txt', content: PYTHON_PROJECT_REQUIREMENTS },
    { path: 'plot_project.py', content: plotSource },
    { path: 'plot.json', content: `${JSON.stringify({
      data: figure.traces, layout, notices: figure.notices, usesMath: figure.usesMath,
    }, null, 2)}\n` },
    { path: SAMPLES_FILE_NAME, content: generateSamplesJson(state.datasets, dataPaths) },
    ...state.datasets.map((dataset) => ({ path: dataPaths[dataset.id], content: sampleCsv(dataset) })),
  ]
}

export function createPythonProjectArchive(state: AppState, plot: PythonProjectPlot): Uint8Array<ArrayBuffer> {
  return createZip(pythonProjectEntries(state, plot))
}
