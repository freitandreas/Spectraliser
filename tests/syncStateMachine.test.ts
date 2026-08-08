import { describe, expect, it } from 'vitest'
import { transitionSyncState } from '../src/services/script/syncStateMachine'

describe('transitionSyncState', () => {
  it('enters desync mode on manual script edit', () => {
    const next = transitionSyncState(
      { mode: 'gui_synchronized', scriptSyncEnabled: true },
      { type: 'SCRIPT_MANUAL_EDIT' },
    )

    expect(next.mode).toBe('desync_active')
    expect(next.scriptSyncEnabled).toBe(false)
  })

  it('returns to sync mode on revert', () => {
    const next = transitionSyncState(
      { mode: 'desync_active', scriptSyncEnabled: false },
      { type: 'REVERT_TO_GUI' },
    )

    expect(next.mode).toBe('gui_synchronized')
    expect(next.scriptSyncEnabled).toBe(true)
  })

  it('returns to sync mode on overwrite confirm', () => {
    const next = transitionSyncState(
      { mode: 'desync_active', scriptSyncEnabled: false },
      { type: 'CONFIRM_OVERWRITE' },
    )

    expect(next.mode).toBe('gui_synchronized')
    expect(next.scriptSyncEnabled).toBe(true)
  })
})
