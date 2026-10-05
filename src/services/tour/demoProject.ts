import type { AppState, SpectrumDataset } from '../../types/project'
import { DEFAULT_PEAK_DETECTION, DEFAULT_STYLE } from '../../types/project'
import { buildPipeline } from '../../state/pipelineBlueprint'
import { deriveGeneralSettings } from '../generalSettings'
import { generatePythonScript } from '../script/scriptGenerator'
import { axisDefaultsFor } from '../spectrumPresets'

const COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626']

export function createDemoDatasets(): SpectrumDataset[] {
  return COLORS.map((lineColor, series) => {
    const abscissa = Array.from({ length: 501 }, (_, index) => 250 + index)
    const centers = [330 + series * 9, 520 - series * 7]
    const ordinate = abscissa.map((x) =>
      (0.55 + series * 0.12) * Math.exp(-0.5 * ((x - centers[0]!) / 24) ** 2)
      + (0.85 - series * 0.1) * Math.exp(-0.5 * ((x - centers[1]!) / 38) ** 2),
    )
    const id = `tour-spectrum-${series + 1}`
    return {
      id,
      name: `Demo_${series + 1}.csv`,
      sourcePath: `synthetic/Demo_${series + 1}.csv`,
      spectrumType: 'uv-vis',
      units: { ...axisDefaultsFor('uv-vis') },
      data: {
        abscissa,
        ordinateOriginal: ordinate,
        ordinateModified: [...ordinate],
        precision: 'float64',
      },
      pipeline: buildPipeline(abscissa).map((step) => ({ ...step, enabled: false })),
      style: { ...DEFAULT_STYLE, lineColor, visible: true, label: `Demo ${series + 1} (synthetic)` },
      experimentMetadata: { Time: `${series * 30} s`, Concentration: `${(series + 1) / 5} mM`, Origin: 'Synthetic tour example; not a measurement' },
      peakDetection: { ...DEFAULT_PEAK_DETECTION, auto: false },
      peaks: centers.map((center, band) => {
        const index = center - abscissa[0]!
        return {
          id: `${id}-peak-${band + 1}`, index, x: center, y: ordinate[index]!,
          label: `Demo band ${band + 1}`, source: 'manual', enabled: true,
        }
      }),
    }
  })
}

export function createDemoProject(original: AppState): AppState {
  const datasets = createDemoDatasets()
  return {
    ...original,
    projectName: 'Guided tour (synthetic data)',
    datasets,
    projectSpectrumType: 'uv-vis',
    generalSettings: deriveGeneralSettings(datasets, 'uv-vis'),
    viewState: {
      zoomRangeX: null, zoomRangeY: null, activeTab: 'script_view',
      selectedSpectrumId: datasets[0]!.id,
    },
    scriptSyncEnabled: true,
    syncMode: 'gui_synchronized',
    generatedScript: generatePythonScript(datasets),
    userScriptOverride: null,
    pythonFileOverrides: {},
    autosaveEnabled: false,
  }
}
