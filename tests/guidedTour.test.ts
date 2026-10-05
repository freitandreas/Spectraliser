import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'
import { get } from 'svelte/store'
import GuidedTour from '../src/lib/workbench/GuidedTour.svelte'
import { appState } from '../src/state/projectContext'
import { tourActive } from '../src/state/tourState'
import { runtimeState } from '../src/state/runtimeState'
import { beginActivity } from '../src/state/activityState'
import { createDemoDatasets, createDemoProject } from '../src/services/tour/demoProject'
import { TOUR_STEPS } from '../src/services/tour/tourSteps'
import { APP_SCHEMA_VERSION, type AppState } from '../src/types/project'

const readiness = vi.hoisted(() => ({ promise: Promise.resolve() }))

vi.mock('../src/state/projectContext', async () => {
  const { writable } = await import('svelte/store')
  return { appState: writable(), get projectReady() { return readiness.promise } }
})

function originalProject(): AppState {
  return {
    version: APP_SCHEMA_VERSION,
    projectName: 'My measurements',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    datasets: [{ ...createDemoDatasets()[0]!, id: 'user-sample', spectrumType: 'ir' }],
    projectSpectrumType: 'ir',
    viewState: { zoomRangeX: [300, 600], zoomRangeY: [0, 1], activeTab: 'peak_table', selectedSpectrumId: 'user-sample' },
    scriptSyncEnabled: false,
    syncMode: 'desync_active',
    generatedScript: 'original generated code',
    userScriptOverride: 'my custom script',
    pythonFileOverrides: { 'processing.py': 'my processing module' },
    autosaveEnabled: true,
  }
}

beforeEach(() => {
  readiness.promise = Promise.resolve()
  appState.set(originalProject())
  runtimeState.update((state) => ({ ...state, workerBusy: false }))
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('synthetic tour project', () => {
  it('creates exactly five deterministic, distinct, finite and aligned series', () => {
    const datasets = createDemoDatasets()
    expect(datasets).toEqual(createDemoDatasets())
    expect(datasets).toHaveLength(5)
    expect(new Set(datasets.map((dataset) => dataset.id)).size).toBe(5)
    expect(new Set(datasets.map((dataset) => dataset.style.lineColor)).size).toBe(5)
    expect(new Set(datasets.map((dataset) => JSON.stringify(dataset.data.ordinateOriginal))).size).toBe(5)
    for (const [index, dataset] of datasets.entries()) {
      expect(dataset.data.abscissa).toHaveLength(501)
      expect(dataset.data.ordinateOriginal).toHaveLength(501)
      expect(dataset.data.ordinateModified).toEqual(dataset.data.ordinateOriginal)
      expect(dataset.data.ordinateModified).not.toBe(dataset.data.ordinateOriginal)
      expect(dataset.data.ordinateOriginal.every(Number.isFinite)).toBe(true)
      expect(dataset.data.abscissa.every((x, i, xs) => i === 0 || x > xs[i - 1]!)).toBe(true)
      expect(dataset.experimentMetadata?.Time).toBe(`${index * 30} s`)
      expect(dataset.pipeline.every((step) => !step.enabled)).toBe(true)
      expect(dataset.peaks).toHaveLength(2)
      for (const peak of dataset.peaks) {
        expect(peak.source).toBe('manual')
        expect(peak.x).toBe(dataset.data.abscissa[peak.index])
        expect(peak.y).toBe(dataset.data.ordinateModified[peak.index])
      }
    }
  })

  it('isolates demo data, metadata and scripts without mutating the original', () => {
    const original = originalProject()
    const before = structuredClone(original)
    const demo = createDemoProject(original)
    expect(original).toEqual(before)
    expect(demo.autosaveEnabled).toBe(false)
    expect(demo.projectSpectrumType).toBe('uv-vis')
    expect(demo.syncMode).toBe('gui_synchronized')
    expect(demo.userScriptOverride).toBeNull()
    expect(demo.pythonFileOverrides).toEqual({})
    expect(demo.generatedScript).not.toBe(original.generatedScript)
    expect(demo.datasets).toHaveLength(5)
  })
})

describe('guided walkthrough', () => {
  it('waits for autosave restoration before taking the project snapshot', async () => {
    let resolveReady: () => void = () => {}
    readiness.promise = new Promise<void>((resolve) => { resolveReady = resolve })
    const view = render(GuidedTour, { onPrepare: () => vi.fn(), onView: vi.fn() })
    const starting = view.component.start()
    expect(view.queryByRole('dialog')).toBeNull()
    const restoredAutosave = { ...originalProject(), projectName: 'Restored autosave' }
    appState.set(restoredAutosave)
    resolveReady()
    await starting
    expect(get(appState).datasets).toHaveLength(5)
    await fireEvent.click(view.getByRole('button', { name: 'Exit tour' }))
    expect(get(appState)).toBe(restoredAutosave)
  })

  it('visits every feature and restores the exact original project and layout on Finish', async () => {
    const original = get(appState)
    const restore = vi.fn()
    const onView = vi.fn()
    const onPrepare = vi.fn(() => restore)
    const view = render(GuidedTour, { onPrepare, onView })
    await view.component.start()
    expect(get(tourActive)).toBe(true)
    expect(get(appState).datasets).toHaveLength(5)
    expect(get(appState).autosaveEnabled).toBe(false)
    expect(view.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true)
    for (const [index, step] of TOUR_STEPS.entries()) {
      expect(view.getByRole('dialog').getAttribute('aria-labelledby')).toBe('tour-title')
      expect(view.getByRole('heading', { name: step.title })).toBeTruthy()
      expect(onView).toHaveBeenLastCalledWith(step.view, 'tour-spectrum-1')
      if (index < TOUR_STEPS.length - 1) await fireEvent.click(view.getByRole('button', { name: 'Next' }))
    }
    await fireEvent.click(view.getByRole('button', { name: 'Finish' }))
    expect(get(appState)).toBe(original)
    expect(get(tourActive)).toBe(false)
    expect(restore).toHaveBeenCalledOnce()
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it.each(['exit', 'escape', 'unmount'] as const)('restores on %s and supports backwards navigation', async (method) => {
    const original = get(appState)
    const restore = vi.fn()
    const view = render(GuidedTour, { onPrepare: () => restore, onView: vi.fn() })
    await view.component.start()
    await fireEvent.click(view.getByRole('button', { name: 'Next' }))
    await fireEvent.click(view.getByRole('button', { name: 'Back' }))
    expect(view.getByRole('heading', { name: TOUR_STEPS[0].title })).toBeTruthy()
    if (method === 'exit') await fireEvent.click(view.getByRole('button', { name: 'Exit tour' }))
    if (method === 'escape') await fireEvent.keyDown(window, { key: 'Escape' })
    if (method === 'unmount') view.unmount()
    expect(get(appState)).toBe(original)
    expect(get(tourActive)).toBe(false)
    expect(restore).toHaveBeenCalledOnce()
  })

  it('can be repeated without accumulating demo series', async () => {
    const original = get(appState)
    const view = render(GuidedTour, { onPrepare: () => vi.fn(), onView: vi.fn() })
    for (let run = 0; run < 2; run++) {
      await view.component.start()
      expect(get(appState).datasets).toHaveLength(5)
      await fireEvent.click(view.getByRole('button', { name: 'Exit tour' }))
      expect(get(appState)).toBe(original)
    }
  })

  it('reports ongoing analysis rather than replacing the project', async () => {
    const original = get(appState)
    runtimeState.update((state) => ({ ...state, workerBusy: true }))
    const prepare = vi.fn(() => vi.fn())
    const view = render(GuidedTour, { onPrepare: prepare, onView: vi.fn() })
    await view.component.start()
    expect(view.getByRole('alert').textContent).toContain('Wait for the current analysis')
    expect(prepare).not.toHaveBeenCalled()
    expect(get(appState)).toBe(original)
    expect(get(tourActive)).toBe(false)
  })

  it('does not interrupt background import peak detection', async () => {
    const original = get(appState)
    const activity = beginActivity('Detecting peaks')
    try {
      const view = render(GuidedTour, { onPrepare: () => vi.fn(), onView: vi.fn() })
      await view.component.start()
      expect(view.getByRole('alert').textContent).toContain('Wait for the current analysis')
      expect(get(appState)).toBe(original)
    } finally {
      activity.end()
    }
  })

  it('traps keyboard focus in the tour controls', async () => {
    const view = render(GuidedTour, { onPrepare: () => vi.fn(), onView: vi.fn() })
    await view.component.start()
    const dialog = view.getByRole('dialog')
    expect(document.activeElement).toBe(dialog)
    await fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(view.getByRole('button', { name: 'Next' }))
    await fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(view.getByRole('button', { name: 'Exit tour' }))
  })

  it('restores the project and reports setup failures', async () => {
    const original = get(appState)
    const restore = vi.fn()
    const view = render(GuidedTour, {
      onPrepare: () => restore,
      onView: () => { throw new Error('Unable to display tour') },
    })
    await view.component.start()
    expect(view.getByRole('alert').textContent).toContain('Unable to display tour')
    expect(get(appState)).toBe(original)
    expect(restore).toHaveBeenCalledOnce()
    expect(get(tourActive)).toBe(false)
  })
})
