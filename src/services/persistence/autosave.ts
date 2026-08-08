import { openDB } from 'idb'
import type { AppState } from '../../types/project'

const DB_NAME = 'spectralab'
const STORE_NAME = 'autosave'
const KEY = 'latest_project'

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    },
  })
}

export async function saveAutosave(state: AppState): Promise<void> {
  const db = await getDb()
  await db.put(STORE_NAME, state, KEY)
}

export async function loadAutosave(): Promise<AppState | null> {
  const db = await getDb()
  return (await db.get(STORE_NAME, KEY)) ?? null
}
