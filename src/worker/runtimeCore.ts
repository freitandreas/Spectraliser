import { loadPyodide, type PyodideInterface, version as pyodideVersion } from 'pyodide'

const LOG_PREFIX = '[Pyodide Worker]'

export function logInfo(message: string, ...data: unknown[]) {
  console.log(`${LOG_PREFIX} ${message}`, ...data)
}

export function logWarn(message: string, ...data: unknown[]) {
  console.warn(`${LOG_PREFIX} ${message}`, ...data)
}

export function logError(message: string, ...data: unknown[]) {
  console.error(`${LOG_PREFIX} ${message}`, ...data)
}

interface RuntimeState {
  pyodide: PyodideInterface | null
  initPromise: Promise<PyodideInterface> | null
  canceledRequests: Set<string>
}

export const state: RuntimeState = {
  pyodide: null,
  initPromise: null,
  canceledRequests: new Set<string>(),
}

const RUNTIME_PACKAGES = ['numpy', 'pandas', 'scipy'] as const

function getPyodideCdnUrl(): string {
  const ver = pyodideVersion || '0.26.2'
  return `https://cdn.jsdelivr.net/pyodide/v${ver}/full/`
}

export async function ensurePyodideReady(): Promise<PyodideInterface> {
  if (state.pyodide) {
    return state.pyodide
  }

  if (!state.initPromise) {
    const startTime = performance.now()
    logInfo('Initialization started...')

    state.initPromise = (async () => {
      const cdnUrl = getPyodideCdnUrl()
      logInfo(`Loading core runtime from CDN: ${cdnUrl}`)

      // 1. Initialize Pyodide with CDN as indexURL
      const pyodide = await loadPyodide({
        indexURL: cdnUrl,
      })
      logInfo(`Pyodide core v${pyodide.version} loaded successfully.`)

      // 2. Load explicit core packages from CDN
      logInfo(`Fetching and installing packages: [${RUNTIME_PACKAGES.join(', ')}]...`)
      const pkgStart = performance.now()
      await pyodide.loadPackage([...RUNTIME_PACKAGES])
      logInfo(`Packages installed in ${(performance.now() - pkgStart).toFixed(2)}ms.`)

      // 3. Load micropip for fallback package management
      logInfo('Loading micropip module...')
      await pyodide.loadPackage('micropip')

      // 4. Verify imports inside Python environment
      logInfo('Verifying Python package imports (numpy, pandas, scipy)...')
      await pyodide.runPythonAsync(`
import numpy as np
import pandas as pd
import scipy.signal as signal
`)
      const totalTime = (performance.now() - startTime).toFixed(2)
      logInfo(`Pyodide runtime fully initialized in ${totalTime}ms.`)

      state.pyodide = pyodide
      return pyodide
    })().catch((error) => {
      logError('Pyodide initialization failed:', error)
      state.initPromise = null
      state.pyodide = null
      throw new Error(`Pyodide initialization failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  } else {
    logInfo('Initialization already in progress, awaiting promise...')
  }

  return state.initPromise
}

export function toFloatArray(values: number[], preferFloat32: boolean): Float32Array | Float64Array {
  return preferFloat32 ? new Float32Array(values) : new Float64Array(values)
}

export function maybeUpgradePrecision(values: Float32Array | Float64Array): {
  values: Float32Array | Float64Array
  precision: 'float32' | 'float64'
} {
  if (values instanceof Float64Array) {
    return { values, precision: 'float64' }
  }

  let maxAbs = 0
  for (const value of values) {
    const abs = Math.abs(value)
    if (abs > maxAbs) {
      maxAbs = abs
    }
  }

  if (maxAbs > 1e7) {
    logInfo(`Upgrading precision from float32 to float64 (max absolute value: ${maxAbs})`)
    return { values: Float64Array.from(values), precision: 'float64' }
  }

  return { values, precision: 'float32' }
}

