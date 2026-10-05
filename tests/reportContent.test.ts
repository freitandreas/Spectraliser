import { describe, expect, it } from 'vitest'
import { buildReportContent } from '../src/services/export/reportContent'
import { deriveGeneralSettings } from '../src/services/generalSettings'
import type { AppState, SpectrumDataset } from '../src/types/project'
import { buildDataset } from './fixtures'

function peakDataset(overrides: Partial<SpectrumDataset> = {}): SpectrumDataset {
  return buildDataset({
    data: {
      abscissa: [400, 401, 402, 403, 404, 405, 406],
      ordinateOriginal: [0, 0.1, 0.5, 1, 0.5, 0.1, 0],
      ordinateModified: [0, 0.1, 0.5, 1, 0.5, 0.1, 0],
      precision: 'float32',
    },
    units: { x: 'nm', y: 'A', xQuantity: 'Wavelength', yQuantity: 'Absorbance' },
    experimentMetadata: { Solvent: 'MeCN', Empty: null },
    peaks: [
      { id: 'p1', index: 3, x: 403, y: 1, label: 'band', source: 'auto', enabled: true },
      { id: 'p2', index: 1, x: 401, y: 0.1, label: 'off', source: 'manual', enabled: false },
    ],
    ...overrides,
  })
}

function project(datasets: SpectrumDataset[]): AppState {
  return {
    version: '1.0.0',
    projectName: 'Report',
    createdAt: '',
    updatedAt: '',
    datasets,
    viewState: { zoomRangeX: null, zoomRangeY: null, activeTab: 'sample_view', selectedSpectrumId: null },
    scriptSyncEnabled: true,
    syncMode: 'gui_synchronized',
    generatedScript: '',
    userScriptOverride: null,
    autosaveEnabled: false,
  }
}

describe('report content', () => {
  it('lists metadata and only enabled peaks with their shape metrics', () => {
    const [sample] = buildReportContent(project([peakDataset()])).samples
    expect(sample.metadata).toContainEqual(['Solvent', 'MeCN'])
    expect(sample.metadata.some(([field]) => field === 'Empty')).toBe(false)
    expect(sample.peaks.headers.slice(0, 2)).toEqual(['Wavelength / nm', 'Absorbance / A'])
    expect(sample.peaks.rows).toHaveLength(1)
    expect(sample.peaks.headers).toEqual(['Wavelength / nm', 'Absorbance / A', 'Assignment'])
    expect(sample.peaks.rows[0]).toEqual(['403.000', '1.000', 'band'])
  })

  it('shows only the selected peak columns in canonical order, without confidence or source', () => {
    const [sample] = buildReportContent(project([peakDataset()]), { peakColumns: ['assignment', 'fwhm', 'position'] }).samples
    expect(sample.peaks.headers).toHaveLength(3)
    expect(sample.peaks.headers[0]).toBe('Wavelength / nm')
    expect(sample.peaks.headers[2]).toBe('Assignment')
    expect(sample.peaks.headers.join(' ')).not.toMatch(/confidence|source/i)
    expect(sample.peaks.rows[0][1]).toBe('2.000')
  })

  it('captions peak tables with detection parameters and manual edits', () => {
    const dataset = peakDataset({
      peakDetection: { mode: 'maxima', prominence: 0.05, minDistance: 3, minHeight: null, auto: true },
      removedPeakCount: 2,
      peaks: [
        { id: 'p1', index: 3, x: 403, y: 1, label: 'band', source: 'auto', enabled: true },
        { id: 'p2', index: 1, x: 401, y: 0.1, label: 'manual', source: 'manual', enabled: true },
      ],
    })
    const caption = buildReportContent(project([dataset])).samples[0].peaks.caption
    expect(caption).toContain('Automatic detection of maxima')
    expect(caption).toContain('prominence 0.05')
    expect(caption).toContain('minimum distance 3 points')
    expect(caption).toContain('1 peak added manually')
    expect(caption).toContain('2 detected peaks removed manually')
    expect(buildReportContent(project([peakDataset({ peaks: [] })])).samples[0].peaks.caption).not.toContain('manually')
  })

  it('states a shared spectrum type once in the overview instead of per sample', () => {
    const content = buildReportContent(project([peakDataset({ id: 'a' }), peakDataset({ id: 'b' })]))
    expect(content.overview.find(([field]) => field === 'Spectrum type')?.[1]).toBeTruthy()
    expect(content.overview).toContainEqual(['Samples', '2'])
    expect(content.samples[0].metadata.some(([field]) => field === 'Spectrum type')).toBe(false)
  })

  it('reports only the pipeline steps that differ from the general settings', () => {
    const first = peakDataset({ id: 'a' })
    const second = peakDataset({ id: 'b', style: { ...first.style, label: 'Second' } })
    const state = project([first, second])
    state.generalSettings = { ...deriveGeneralSettings([first], null), pipeline: first.pipeline.map((step) => ({ ...step, params: { ...step.params } })) }
    second.pipeline = second.pipeline.map((step) => ({ ...step, params: { ...step.params, window_length: 21 } }))
    const content = buildReportContent(state)
    expect(content.processing.map((row) => row.step)).toContain('Peak detection')
    expect(content.samples[0].differences).toEqual([])
    expect(content.samples[1].differences).toHaveLength(1)
    expect(content.samples[1].differences[0].parameters).toContain('window length: 21')
  })
})
