import { processingDiagnosticsSchema, type BatchRequest, type BatchSampleResult, type WorkerResponse } from './messages'
import { logInfo, logWarn, logError, state, ensurePyodideReady, toFloatArray, maybeUpgradePrecision } from './runtimeCore'
import selectiveRunSource from '../python/selective_run.py?raw'
import { RUNNER_DIRECTORY } from '../services/script/runScript'

const RUNNER_FILES: Record<string, string> = { 'selective_run.py': selectiveRunSource }
const writtenFiles = new Map<string, string>()

/**
 * Pyodide has one virtual filesystem. Files are rewritten only when their content
 * changed. Modules import each other, so any change reloads every project module;
 * otherwise the imported modules are reused as they are.
 */
function syncScriptFiles(pyodide: Awaited<ReturnType<typeof ensurePyodideReady>>, files: Record<string, string>): string[] {
  pyodide.FS.mkdirTree(RUNNER_DIRECTORY)
  let changed = false
  for (const [name, source] of Object.entries({ ...files, ...RUNNER_FILES })) {
    if (!/^[a-z_]+\.py$/.test(name) || writtenFiles.get(name) === source) continue
    pyodide.FS.writeFile(`${RUNNER_DIRECTORY}/${name}`, source)
    writtenFiles.set(name, source)
    changed = true
  }
  return changed ? [...writtenFiles.keys()].map((name) => name.slice(0, -3)) : []
}

function cancelled(requestId: string): boolean {
  if (!state.canceledRequests.has(requestId)) return false
  state.canceledRequests.delete(requestId)
  return true
}

export async function executeBatch(request: BatchRequest): Promise<WorkerResponse> {
  if (cancelled(request.requestId)) return { type: 'cancelled', requestId: request.requestId }

  const pyodide = await ensurePyodideReady()
  const changedModules = syncScriptFiles(pyodide, request.scriptFiles)

  const precisions = new Map<string, 'float32' | 'float64'>()
  const samples = request.samples.map((sample) => {
    const ordinate = maybeUpgradePrecision(toFloatArray(sample.ordinate, request.preferFloat32))
    precisions.set(sample.id, ordinate.precision)
    // Typed arrays reach Python as buffers (memoryview); the runner reads them with np.asarray.
    const abscissa = toFloatArray(sample.abscissa, ordinate.precision === 'float32')
    return { id: sample.id, abscissa, ordinate: ordinate.values, metadata: sample.metadata }
  })

  const globals = pyodide.toPy({ runner_samples: samples, changed_modules: changedModules })
  const prelude = [
    'import importlib',
    'import sys',
    'sys.dont_write_bytecode = True',
    'for _module_name in changed_modules:',
    '    sys.modules.pop(_module_name, None)',
    'importlib.invalidate_caches()',
    '',
  ].join('\n')

  try {
    pyodide.setStdout({ batched: (text) => logInfo(`[Python stdout]: ${text}`) })
    pyodide.setStderr({ batched: (text) => logWarn(`[Python stderr]: ${text}`) })
    await pyodide.loadPackagesFromImports(Object.values(request.scriptFiles).join('\n'))
    await pyodide.runPythonAsync(prelude + request.runScript, { globals, locals: globals })

    const resultsProxy = globals.get('run_results')
    const raw = resultsProxy.toJs({ dict_converter: Object.fromEntries }) as Array<Record<string, unknown>>
    resultsProxy.destroy()

    if (cancelled(request.requestId)) return { type: 'cancelled', requestId: request.requestId }

    const results: BatchSampleResult[] = raw.map((item) => {
      const id = String(item.id)
      if (typeof item.error === 'string') return { id, error: item.error }
      return {
        id,
        ordinateModified: Array.from(item.ordinate_modified as ArrayLike<number>),
        peaks: (item.peaks ?? []) as Extract<BatchSampleResult, { peaks: unknown }>['peaks'],
        precision: precisions.get(id) ?? (request.preferFloat32 ? 'float32' : 'float64'),
        processingDiagnostics: processingDiagnosticsSchema.parse(item.processingDiagnostics ?? {}),
      }
    })
    return { type: 'batch_result', requestId: request.requestId, results }
  } catch (error) {
    logError(`Runner request ${request.requestId} failed:`, error)
    // A failed import can leave a half-initialised module behind; force a clean reload next time.
    writtenFiles.clear()
    throw error
  } finally {
    globals.destroy()
  }
}
