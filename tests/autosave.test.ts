import { describe, expect, it, vi } from 'vitest'

vi.mock('idb', () => {
  const store = new Map<string, unknown>()

  return {
    openDB: async () => ({
      put: async (_storeName: string, value: unknown, key: string) => {
        store.set(key, value)
      },
      get: async (_storeName: string, key: string) => {
        return store.get(key)
      },
    }),
  }
})

import { loadAutosave, saveAutosave } from '../src/services/persistence/autosave'
import type { AppState } from '../src/types/project'

describe('autosave', () => {
  it('saves and restores app state', async () => {
    const state = {
      version: '1.0.0',
      projectName: 'Test',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      datasets: [],
      viewState: {
        zoomRangeX: null,
        zoomRangeY: null,
        activeTab: 'sample_view',
        selectedSpectrumId: null,
      },
      scriptSyncEnabled: true,
      syncMode: 'gui_synchronized',
      generatedScript: '',
      userScriptOverride: null,
      workerBusy: false,
      workerLastError: null,
      autosaveEnabled: true,
    } satisfies AppState

    await saveAutosave(state)
    await expect(loadAutosave()).resolves.toEqual(state)
  })
})
