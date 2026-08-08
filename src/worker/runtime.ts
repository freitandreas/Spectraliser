import { loadPyodide, type PyodideInterface, version as pyodideVersion } from 'pyodide'
import type { WorkerRequest, WorkerResponse } from './messages'
import { workerRequestSchema } from './messages'

interface RuntimeState {
  pyodide: PyodideInterface | null
  canceledRequests: Set<string>
  packagesLoaded: boolean
}

const state: RuntimeState = {
  pyodide: null,
  canceledRequests: new Set<string>(),
  packagesLoaded: false,
}

const RUNTIME_PACKAGES = ['numpy', 'pandas', 'scipy'] as const

function getPyodideIndexUrl(): string {
  return new URL('/pyodide/', self.location.origin).toString()
}

function getPyodidePackageBaseUrl(): string {
  return `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`
}

async function ensurePyodide(): Promise<PyodideInterface> {
  if (state.pyodide) {
    return state.pyodide
  }

  state.pyodide = await loadPyodide({
    indexURL: getPyodideIndexUrl(),
    packageBaseUrl: getPyodidePackageBaseUrl(),
    packages: [...RUNTIME_PACKAGES],
  })
  return state.pyodide
}

async function ensureRuntimePackages(pyodide: PyodideInterface): Promise<void> {
  if (state.packagesLoaded) {
    return
  }

  const runtime = pyodide as PyodideInterface & {
    loadPackage?: (packages: string[] | string) => Promise<void>
  }

  if (runtime.loadPackage) {
    try {
      await runtime.loadPackage([...RUNTIME_PACKAGES])
    } catch {
      // Some runtimes reject on partial failures; try each package individually.
      const failures: string[] = []

      for (const packageName of RUNTIME_PACKAGES) {
        try {
          await runtime.loadPackage(packageName)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`${packageName}: ${message}`)
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `Failed to load Pyodide runtime packages from ${getPyodidePackageBaseUrl()}: ${failures.join('; ')}`,
        )
      }
    }
  }

  await pyodide.runPythonAsync(`
import numpy
import pandas
import scipy
`)

  state.packagesLoaded = true
}

function toFloatArray(values: number[], preferFloat32: boolean): Float32Array | Float64Array {
  return preferFloat32 ? new Float32Array(values) : new Float64Array(values)
}

function maybeUpgradePrecision(values: Float32Array | Float64Array): {
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

  // Promote when values are too large for stable float32 transforms.
  if (maxAbs > 1e7) {
    return { values: Float64Array.from(values), precision: 'float64' }
  }

  return { values, precision: 'float32' }
}

async function executePipeline(
  request: Extract<WorkerRequest, { type: 'execute_pipeline' }>,
): Promise<WorkerResponse> {
  if (state.canceledRequests.has(request.requestId)) {
    return {
      type: 'cancelled',
      requestId: request.requestId,
    }
  }

  const pyodide = await ensurePyodide()
  await ensureRuntimePackages(pyodide)

  const xArray = toFloatArray(request.abscissa, request.preferFloat32)
  const yArray = toFloatArray(request.ordinate, request.preferFloat32)
  const promoted = maybeUpgradePrecision(yArray)

  const globals = pyodide.toPy({
    abscissa: Array.from(xArray),
    ordinate_original: Array.from(promoted.values),
  })

  try {
    pyodide.setStdout({ batched: () => {} })
    pyodide.setStderr({ batched: () => {} })

    await pyodide.runPythonAsync(`
import pandas as pd
import numpy as np
import scipy.signal as signal

df = pd.DataFrame({
    'abscissa': abscissa,
    'ordinate_original': ordinate_original,
})
${request.pipelineCode}
out = df['ordinate_modified'].tolist()
`, { globals, locals: globals })

    const outProxy = globals.get('out')
    const ordinateModified = outProxy.toJs() as number[]
    outProxy.destroy()

    if (state.canceledRequests.has(request.requestId)) {
      state.canceledRequests.delete(request.requestId)
      return {
        type: 'cancelled',
        requestId: request.requestId,
      }
    }

    return {
      type: 'result',
      requestId: request.requestId,
      spectrumId: request.spectrumId,
      ordinateModified,
      precision: promoted.precision,
    }
  } finally {
    globals.destroy()
  }
}

async function executeScript(
  request: Extract<WorkerRequest, { type: 'execute_script' }>,
): Promise<WorkerResponse> {
  if (state.canceledRequests.has(request.requestId)) {
    return {
      type: 'cancelled',
      requestId: request.requestId,
    }
  }

  const pyodide = await ensurePyodide()
  await ensureRuntimePackages(pyodide)

  const xArray = toFloatArray(request.abscissa, request.preferFloat32)
  const yArray = toFloatArray(request.ordinate, request.preferFloat32)
  const promoted = maybeUpgradePrecision(yArray)

  const globals = pyodide.toPy({
    abscissa: Array.from(xArray),
    ordinate_original: Array.from(promoted.values),
    metadata: request.metadata,
  })

  const scriptBody = [
    'import inspect',
    'import pandas as pd',
    'import numpy as np',
    'import scipy.signal as signal',
    '',
    'df = pd.DataFrame({',
    "    'abscissa': abscissa,",
    "    'ordinate_original': ordinate_original,",
    '})',
    '',
    'meta = dict(metadata)',
    '',
    request.scriptCode,
    '',
    "if 'process_spectrum' in globals() and callable(process_spectrum):",
    '    signature = inspect.signature(process_spectrum)',
    '    param_count = len(signature.parameters)',
    '    if param_count >= 2:',
    '        result = process_spectrum(df.copy(), dict(meta))',
    '    else:',
    '        result = process_spectrum(df.copy())',
    'else:',
    '    result = df.copy()',
    '',
    'out_df = df.copy()',
    'out_meta = dict(meta)',
    '',
    'if isinstance(result, tuple):',
    '    if len(result) > 0 and result[0] is not None:',
    '        out_df = result[0]',
    '    if len(result) > 1 and isinstance(result[1], dict):',
    '        out_meta = result[1]',
    'elif isinstance(result, dict):',
    "    candidate_df = result.get('df')",
    "    candidate_meta = result.get('meta')",
    '    if candidate_df is not None:',
    '        out_df = candidate_df',
    '    if isinstance(candidate_meta, dict):',
    '        out_meta = candidate_meta',
    'elif result is not None:',
    '    out_df = result',
    '',
    'if not isinstance(out_df, pd.DataFrame):',
    '    out_df = pd.DataFrame(out_df)',
    '',
    'if not isinstance(out_meta, dict):',
    '    out_meta = dict(meta)',
    '',
    "meta_units = out_meta.get('units', {}) if isinstance(out_meta.get('units', {}), dict) else {}",
    "meta_style = out_meta.get('style', {}) if isinstance(out_meta.get('style', {}), dict) else {}",
    '',
    'out_meta = {',
    "    'name': str(out_meta.get('name', meta.get('name', ''))),",
    "    'sourcePath': str(out_meta.get('sourcePath', meta.get('sourcePath', ''))),",
    "    'spectrumType': str(out_meta.get('spectrumType', meta.get('spectrumType', 'uv-vis'))),",
    "    'units': {",
    "        'x': str(meta_units.get('x', meta.get('units', {}).get('x', ''))),",
    "        'y': str(meta_units.get('y', meta.get('units', {}).get('y', ''))),",
    '    },',
    "    'style': {",
    "        'label': str(meta_style.get('label', meta.get('style', {}).get('label', ''))),",
    "        'lineColor': str(meta_style.get('lineColor', meta.get('style', {}).get('lineColor', '#4fc1ff'))),",
    "        'lineWidth': float(meta_style.get('lineWidth', meta.get('style', {}).get('lineWidth', 2.0))),",
    "        'scatterSymbol': str(meta_style.get('scatterSymbol', meta.get('style', {}).get('scatterSymbol', 'circle'))),",
    "        'visible': bool(meta_style.get('visible', meta.get('style', {}).get('visible', True))),",
    '    },',
    '}',
    '',
    "if 'abscissa' not in out_df.columns:",
    "    out_df['abscissa'] = df['abscissa']",
    '',
    "if 'ordinate_original' not in out_df.columns:",
    "    out_df['ordinate_original'] = df['ordinate_original']",
    '',
    "if 'ordinate_modified' not in out_df.columns:",
    "    out_df['ordinate_modified'] = out_df['ordinate_original']",
    '',
    "out_abscissa = out_df['abscissa'].tolist()",
    "out_original = out_df['ordinate_original'].tolist()",
    "out = out_df['ordinate_modified'].tolist()",
  ].join('\n')

  try {
    pyodide.setStdout({ batched: () => {} })
    pyodide.setStderr({ batched: () => {} })

    try {
      await pyodide.runPythonAsync(scriptBody, { globals, locals: globals })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("No module named 'pandas'") || message.includes("No module named 'scipy'")) {
        state.packagesLoaded = false
        await ensureRuntimePackages(pyodide)
        await pyodide.runPythonAsync(scriptBody, { globals, locals: globals })
      } else {
        throw error
      }
    }

    const abscissaProxy = globals.get('out_abscissa')
    const abscissa = abscissaProxy.toJs() as number[]
    abscissaProxy.destroy()

    const originalProxy = globals.get('out_original')
    const ordinateOriginal = originalProxy.toJs() as number[]
    originalProxy.destroy()

    const outProxy = globals.get('out')
    const ordinateModified = outProxy.toJs() as number[]
    outProxy.destroy()

    const metadataProxy = globals.get('out_meta')
    const metadata = metadataProxy.toJs() as {
      name?: string
      sourcePath?: string
      spectrumType?: string
      units?: { x: string; y: string }
      style?: {
        label: string
        lineColor: string
        lineWidth: number
        scatterSymbol: string
        visible?: boolean
      }
    }
    metadataProxy.destroy()

    if (state.canceledRequests.has(request.requestId)) {
      state.canceledRequests.delete(request.requestId)
      return {
        type: 'cancelled',
        requestId: request.requestId,
      }
    }

    return {
      type: 'result',
      requestId: request.requestId,
      spectrumId: request.spectrumId,
      abscissa,
      ordinateOriginal,
      ordinateModified,
      metadata,
      precision: promoted.precision,
    }
  } finally {
    globals.destroy()
  }
}

export async function handleWorkerRequest(requestRaw: unknown): Promise<WorkerResponse> {
  const parsed = workerRequestSchema.safeParse(requestRaw)
  if (!parsed.success) {
    return {
      type: 'error',
      requestId: 'unknown',
      message: parsed.error.message,
    }
  }

  const request = parsed.data

  if (request.type === 'init') {
    const pyodide = await ensurePyodide()
    return {
      type: 'ready',
      requestId: request.requestId,
      pyodideVersion: pyodide.version,
    }
  }

  if (request.type === 'cancel') {
    state.canceledRequests.add(request.targetRequestId)
    return {
      type: 'cancelled',
      requestId: request.requestId,
    }
  }

  try {
    if (request.type === 'execute_script') {
      return await executeScript(request)
    }

    return await executePipeline(request)
  } catch (error) {
    return {
      type: 'error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : 'Unknown worker error',
    }
  }
}
