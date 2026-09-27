import { describe, expect, it } from 'vitest'
import { migrateProjectState } from '../src/state/migrations'
import { APP_SCHEMA_VERSION, type AppState } from '../src/types/project'

function legacyProject(): AppState {
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
    expect(migrated.workerBusy).toBe(false)
    expect(migrated.workerLastError).toBeNull()
    expect(migrated.scriptProgress.active).toBe(false)
    expect(migrated.scriptOutput).toEqual([])
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
    expect(dataset.peakDetection).toMatchObject({ prominence: 0.01, mode: 'maxima' })
    expect(dataset.units.xQuantity).toBe('Abscissa')
    expect(dataset.units.yQuantity).toBe('Ordinate')
  })
})
