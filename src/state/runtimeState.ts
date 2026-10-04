import { writable } from 'svelte/store'

/**
 * Worker and execution status. It changes many times per script run, so it lives outside the
 * project store: subscribers of project data (plot, tables) are not re-run, and it is never saved.
 */
export interface RuntimeState {
  workerBusy: boolean
  workerLastError: string | null
  scriptOutput: string[]
  scriptProgress: { active: boolean; completed: number; total: number; message: string }
}

const OUTPUT_LIMIT = 300

function initialRuntime(): RuntimeState {
  return {
    workerBusy: false,
    workerLastError: null,
    scriptOutput: [],
    scriptProgress: { active: false, completed: 0, total: 0, message: '' },
  }
}

export const runtimeState = writable<RuntimeState>(initialRuntime())

export function patchRuntime(patch: Partial<RuntimeState> | ((current: RuntimeState) => Partial<RuntimeState>)): void {
  runtimeState.update((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }))
}

export function appendScriptOutput(message: string): void {
  patchRuntime((current) => ({
    scriptOutput: [...current.scriptOutput, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-OUTPUT_LIMIT),
  }))
}

export function resetRuntime(): void {
  runtimeState.set(initialRuntime())
}
