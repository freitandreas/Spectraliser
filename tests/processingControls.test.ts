import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'
import PipelineEditor from '../src/lib/workbench/PipelineEditor.svelte'
import ReferenceValues from '../src/lib/workbench/ReferenceValues.svelte'
import { buildPipeline } from '../src/state/pipelineBlueprint'
import { combineSmoothingSuggestions } from '../src/services/smoothingAdvice'
import { processingDiagnosticsSchema, workerResponseSchema } from '../src/worker/messages'
import { buildDataset } from './fixtures'

afterEach(cleanup)

describe('processing controls and diagnostics', () => {
  it('selects AsLS and edits its three reproducible parameters', async () => {
    const pipeline = buildPipeline([1000, 2000]).map((step) => ({ ...step, enabled: step.type === 'baseline' }))
    const onParams = vi.fn()
    const view = render(PipelineEditor, { pipeline, onParams, onEnabled: vi.fn() })
    await fireEvent.change(view.getByLabelText('Method'), { target: { value: 'asls' } })
    expect(onParams).toHaveBeenLastCalledWith('baseline-1', { method: 'asls' })
    await view.rerender({ pipeline: pipeline.map((step) => ({ ...step, params: { ...step.params, method: 'asls' } })) })
    await fireEvent.change(view.getByLabelText('Lambda'), { target: { value: '200000' } })
    expect(onParams).toHaveBeenLastCalledWith('baseline-1', { lam: 200000 })
    await fireEvent.change(view.getByRole('spinbutton', { name: /Asymmetry p/ }), { target: { value: '.99' } })
    expect(onParams).toHaveBeenLastCalledWith('baseline-1', { p: .99 })
    await fireEvent.change(view.getByLabelText('Iterations'), { target: { value: '20' } })
    expect(onParams).toHaveBeenLastCalledWith('baseline-1', { n_iter: 20 })
    expect(view.queryByLabelText('Polynomial order')).toBeNull()
  })

  it('edits reference center, window and zero guard in axis units', async () => {
    const pipeline = buildPipeline([1000, 2000]).map((step) => ({ ...step,
      enabled: step.type === 'normalization', params: { ...step.params, mode: 'reference' } }))
    const onParams = vi.fn()
    const view = render(PipelineEditor, { pipeline, xUnit: 'cm^-1', onParams, onEnabled: vi.fn() })
    await fireEvent.change(view.getByLabelText('Reference center (cm^-1)'), { target: { value: '1182' } })
    expect(onParams).toHaveBeenLastCalledWith('normalize-1', { reference_x: 1182 })
    await fireEvent.change(view.getByLabelText('Window half-width (cm^-1)'), { target: { value: '6' } })
    expect(onParams).toHaveBeenLastCalledWith('normalize-1', { reference_half_width: 6 })
    await fireEvent.change(view.getByRole('spinbutton', { name: /Minimum \|mean\|/ }), { target: { value: '.001' } })
    expect(onParams).toHaveBeenLastCalledWith('normalize-1', { reference_min_abs: .001 })
  })

  it('shows each sample reference value, window and point count', () => {
    const datasets = [1, 1 / 3].map((value, index) => buildDataset({ id: `ref-${index}`,
      processingDiagnostics: { referenceNormalization: { value, center: 1182, halfWidth: 4,
        pointCount: 5, minimumAbs: 1e-8, xUnit: 'cm^-1', yUnit: '' } } }))
    const view = render(ReferenceValues, { datasets })
    expect(view.getAllByRole('row')).toHaveLength(3)
    expect(view.getByText('1.00000')).toBeTruthy()
    expect(view.getByText('0.333333')).toBeTruthy()
    expect(view.getAllByText('1182 +/- 4 cm^-1')).toHaveLength(2)
  })

  it('keeps noise warnings through worker validation and smoothing advice', () => {
    const noise = { lagEstimates: { lag1: .1, lag2: .15, lag4: .21 }, correlated: true,
      warning: 'Correlated noise: automatic peak threshold too low.' }
    expect(processingDiagnosticsSchema.parse({ noise }).noise).toEqual(noise)
    const response = workerResponseSchema.parse({ type: 'peaks_result', requestId: 'r', spectrumId: 's',
      peaks: [], settings: { prominence: .2, minDistance: 1 }, noiseDiagnostics: noise })
    expect(response).toHaveProperty('noiseDiagnostics', noise)
    const advice = combineSmoothingSuggestions([{ windowLength: 9, polyorder: 2, noise: .1,
      snr: 10, fwhmPoints: 12, status: 'ok', noiseDiagnostics: noise }])
    expect(advice.message).toContain(noise.warning)
  })
})