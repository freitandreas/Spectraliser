import { writable } from 'svelte/store'
import type { QuantityNotation } from '../services/quantityNotation'

/** Mirrors the plot-style notation so tables label quantities like the plot axes. */
export const quantityNotation = writable<QuantityNotation>('name')

/** Peak panel toggle: plot only the active sample as a 2D spectrum, whatever the plot mode. */
export const peakSingleSeriesView = writable(false)
