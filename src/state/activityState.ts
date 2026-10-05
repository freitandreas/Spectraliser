import { derived, writable } from 'svelte/store'

/**
 * Short-lived UI work (plot rendering, report preparation, peak detection) shown in the header
 * progress bar. A null total marks indeterminate work.
 */
export interface Activity {
  id: number
  message: string
  completed: number
  total: number | null
}

export interface ActivityHandle {
  update: (patch: Partial<Pick<Activity, 'message' | 'completed' | 'total'>>) => void
  end: () => void
}

const activities = writable<Activity[]>([])
let nextId = 1

export function beginActivity(message: string, total: number | null = null): ActivityHandle {
  const id = nextId++
  activities.update((list) => [...list, { id, message, completed: 0, total }])
  let ended = false
  return {
    update: (patch) => {
      if (ended) return
      activities.update((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)))
    },
    end: () => {
      if (ended) return
      ended = true
      activities.update((list) => list.filter((item) => item.id !== id))
    },
  }
}

/** Runs `task` while an activity is shown; the activity always ends, even on failure. */
export async function withActivity<T>(message: string, task: (handle: ActivityHandle) => Promise<T>, total: number | null = null): Promise<T> {
  const handle = beginActivity(message, total)
  try {
    return await task(handle)
  } finally {
    handle.end()
  }
}

/** The most recently started activity, plus how many others run alongside it. */
export const currentActivity = derived(activities, (list) =>
  list.length === 0 ? null : { ...list[list.length - 1], others: list.length - 1 },
)

/**
 * Resolves after the browser has painted pending DOM changes, so loading states appear before
 * synchronous heavy work starts. Hidden tabs never fire animation frames, hence the timeout.
 */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      resolve()
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(finish, 0))
    }
    setTimeout(finish, 60)
  })
}
