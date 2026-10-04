import { writable } from 'svelte/store'
import type { ComputePrecision } from '../services/startupPreferences'

/** Mirrors the saved startup preference so worker requests use the selected precision. */
export const computePrecision = writable<ComputePrecision>('float32')
