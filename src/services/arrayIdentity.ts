const ids = new WeakMap<readonly number[], number>()
let nextId = 1

/**
 * Stable id per array instance. Project data is immutable (edits replace arrays), so the id
 * stands in for the content without serialising or hashing whole spectra.
 */
export function arrayId(values: readonly number[]): number {
  let id = ids.get(values)
  if (id === undefined) {
    id = nextId++
    ids.set(values, id)
  }
  return id
}
