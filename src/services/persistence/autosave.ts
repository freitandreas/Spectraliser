import { openDB, type IDBPDatabase } from 'idb'
import type { AppState } from '../../types/project'

const DB_NAME = 'spectralab'
const STORE_NAME = 'autosave'
const KEY = 'latest_project'

let database: Promise<IDBPDatabase | null> | null = null

/** One connection for the session; a failed open (e.g. private mode) disables autosave quietly. */
function getDb(): Promise<IDBPDatabase | null> {
  // Deferred so a missing indexedDB global (synchronous throw) also resolves to null.
  database ??= Promise.resolve().then(() => openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    },
  })).catch(() => null)
  return database
}

export async function saveAutosave(state: AppState): Promise<void> {
  const db = await getDb()
  try {
    await db?.put(STORE_NAME, state, KEY)
  } catch (error) {
    // Autosave is best effort (quota, blocked storage); the in-memory project stays authoritative.
    console.warn('Autosave failed:', error)
  }
}

export async function loadAutosave(): Promise<AppState | null> {
  const db = await getDb()
  try {
    return (await db?.get(STORE_NAME, KEY)) ?? null
  } catch {
    return null
  }
}
