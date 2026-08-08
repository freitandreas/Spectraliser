import type { SyncMode } from '../../types/project'

export interface SyncStateContext {
  mode: SyncMode
  scriptSyncEnabled: boolean
}

export type SyncEvent =
  | { type: 'GUI_EDIT' }
  | { type: 'SCRIPT_MANUAL_EDIT' }
  | { type: 'REVERT_TO_GUI' }
  | { type: 'CONFIRM_OVERWRITE' }

export function transitionSyncState(
  state: SyncStateContext,
  event: SyncEvent,
): SyncStateContext {
  if (event.type === 'SCRIPT_MANUAL_EDIT') {
    return {
      mode: 'desync_active',
      scriptSyncEnabled: false,
    }
  }

  if (event.type === 'REVERT_TO_GUI' || event.type === 'CONFIRM_OVERWRITE') {
    return {
      mode: 'gui_synchronized',
      scriptSyncEnabled: true,
    }
  }

  if (event.type === 'GUI_EDIT' && state.mode === 'gui_synchronized') {
    return state
  }

  return state
}
