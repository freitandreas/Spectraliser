import { describe, expect, it } from 'vitest'
import { migrateProjectState } from '../src/state/migrations'
import { APP_SCHEMA_VERSION, type AppState } from '../src/types/project'

function legacyProject(): AppState & Record<string, unknown> {
  return {
    version: '1.0.0',
    projectName: 'Legacy',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    datasets: [
      {
        id: 'a',
        name: 'a.csv',
        sourcePath: 'a.csv',
        spectrumType: 'ir',
        units: { x: 'cm⁻¹', y: '%' } as AppState['datasets'][number]['units'],
        data: {
          abscissa: [400, 500, 600],
          ordinateOriginal: [1, 2, 3],
          ordinateModified: [1, 2, 3],
          precision: 'float32',
        },
        pipeline: [
          { id: 'smooth-1', type: 'smoothing', scope: 'individual', enabled: true, params: { window_length: 9, polyorder: 2 } },
          { id: 'derivative-1', type: 'derivative' as never, scope: 'individual', enabled: true, params: { order: 1 } },
        ],
        style: { lineColor: '#4fc1ff', lineWidth: 2, scatterSymbol: 'circle', label: 'A' },
        peaks: undefined as never,
      },
    ],
    viewState: { zoomRangeX: null, zoomRangeY: null, activeTab: 'sample_view', selectedSpectrumId: 'a' },
    scriptSyncEnabled: true,
    syncMode: 'gui_synchronized',
    generatedScript: '',
    userScriptOverride: null,
    workerBusy: true,
    workerLastError: 'stale error',
    scriptOutput: undefined as never,
    scriptProgress: { active: true, completed: 2, total: 4, message: 'stale' },
    autosaveEnabled: true,
  }
}

describe('project migrations', () => {
  it('upgrades legacy projects to the current schema', () => {
    const migrated = migrateProjectState(legacyProject())

    expect(migrated.version).toBe(APP_SCHEMA_VERSION)
    expect(migrated.projectSpectrumType).toBe('ir')
    for (const runtimeField of ['workerBusy', 'workerLastError', 'scriptOutput', 'scriptProgress']) {
      expect(migrated).not.toHaveProperty(runtimeField)
    }
  })

  it('completes the pipeline and drops steps outside the blueprint', () => {
    const [dataset] = migrateProjectState(legacyProject()).datasets

    expect(dataset.pipeline.map((step) => step.type)).toEqual([
      'crop',
      'baseline',
      'smoothing',
      'inversion',
      'normalization',
      'peak_localisation',
    ])
    expect(dataset.pipeline.find((step) => step.type === 'smoothing')?.params.window_length).toBe(9)
    expect(dataset.pipeline.find((step) => step.id === 'crop-1')?.params).toMatchObject({ x_min: 400, x_max: 600 })
  })

  it('backfills peaks, detection settings, and axis quantities', () => {
    const [dataset] = migrateProjectState(legacyProject()).datasets

    expect(dataset.peaks).toEqual([])
    expect(dataset.experimentMetadata).toEqual({})
    expect(dataset.peakDetection).toMatchObject({ prominence: 0.01, mode: 'maxima' })
    expect(dataset.units.xQuantity).toBe('Abscissa')
    expect(dataset.units.yQuantity).toBe('Ordinate')
  })

  it('preserves valid linked metadata and explicit missing values', () => {
    const saved = legacyProject()
    saved.datasets[0]!.experimentMetadata = { operator: 'A. Chemist', temperature: null }

    expect(migrateProjectState(saved).datasets[0]?.experimentMetadata).toEqual({
      operator: 'A. Chemist',
      temperature: null,
    })
  })

  it('moves a legacy manual series time into Time metadata without overriding linked times', () => {
    const saved = legacyProject()
    Object.assign(saved.datasets[0]!, { seriesCoordinate: { value: 2.5, unit: 'min' }, experimentMetadata: { operator: 'A' } })
    const migrated = migrateProjectState(saved).datasets[0]!
    expect(migrated.experimentMetadata).toEqual({ Time: '2.5 min', operator: 'A' })
    expect('seriesCoordinate' in migrated).toBe(false)

    const linked = legacyProject()
    Object.assign(linked.datasets[0]!, { seriesCoordinate: { value: 1, unit: 's' }, experimentMetadata: { 'Time / s': '9' } })
    expect(migrateProjectState(linked).datasets[0]!.experimentMetadata).toEqual({ 'Time / s': '9' })
  })

  it('drops original-data peaks and keeps saved detection settings manual', () => {
    const project = legacyProject()
    const peak = { index: 1, x: 500, y: 2, label: '500', enabled: true }
    project.datasets[0].peaks = [
      { ...peak, id: 'p', source: 'auto', dataOrigin: 'processed' },
      { ...peak, id: 'o', source: 'auto', dataOrigin: 'original' },
    ] as never
    project.datasets[0].peakDetection = { prominence: 2, minDistance: 3, minHeight: null, mode: 'minima' }
    const [dataset] = migrateProjectState(project).datasets
    expect(dataset.peaks.map((item) => item.id)).toEqual(['p'])
    expect('dataOrigin' in dataset.peaks[0]).toBe(false)
    expect(dataset.peakDetection).toEqual({ prominence: 2, minDistance: 3, minHeight: null, mode: 'minima' })
  })
})
