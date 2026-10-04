import type { SmoothingSuggestion, WorkerRequest, WorkerResponse } from './messages'
import { logInfo, logWarn, logError, ensurePyodideReady } from './runtimeCore'
import peakDetectionSource from '../python/peak_detection.py?raw'
import smoothingTuningSource from '../python/smoothing_tuning.py?raw'

// The tuner imports estimate_noise from peak_detection; inlined, that name is already defined.
const TOOL_SOURCE = `${peakDetectionSource}\n${smoothingTuningSource.replace(/^from peak_detection import .*$/m, '')}`

async function runTool<T>(request: WorkerRequest, inputs: Record<string, unknown>, code: string): Promise<T> {
  const pyodide = await ensurePyodideReady()
  const globals = pyodide.toPy(inputs)
  try {
    pyodide.setStdout({ batched: (text) => logInfo(`[Python stdout]: ${text}`) })
    pyodide.setStderr({ batched: (text) => logWarn(`[Python stderr]: ${text}`) })
    await pyodide.runPythonAsync(`${TOOL_SOURCE}\n${code}`, { globals, locals: globals })
    const proxy = globals.get('tool_result')
    const result = proxy.toJs({ dict_converter: Object.fromEntries }) as T
    proxy.destroy()
    return result
  } catch (error) {
    logError(`Peak tool failed for request ${request.requestId}:`, error)
    throw error
  } finally {
    globals.destroy()
  }
}

export async function detectPeaks(
  request: Extract<WorkerRequest, { type: 'detect_peaks' }>,
): Promise<WorkerResponse> {
  const result = await runTool<{
    index: number[]
    x: number[]
    y: number[]
    prominence: number[]
    settings: { prominence: number; minDistance: number }
  }>(
    request,
    {
      abscissa: request.abscissa,
      ordinate: request.ordinate,
      settings: {
        prominence: request.prominence,
        minDistance: request.minDistance,
        minHeight: request.minHeight,
        mode: request.mode,
        auto: request.auto,
      },
    },
    `
x = np.asarray(abscissa, dtype=float)
y = np.asarray(ordinate, dtype=float)
resolved = resolve_settings(y, settings)
indices, prominences = find_spectral_peaks(y, resolved)
tool_result = {
    'index': indices.tolist(),
    'x': x[indices].tolist(),
    'y': y[indices].tolist(),
    'prominence': prominences.tolist(),
    'settings': {'prominence': float(resolved['prominence']), 'minDistance': int(resolved['minDistance'])},
}
`,
  )

  return {
    type: 'peaks_result',
    requestId: request.requestId,
    spectrumId: request.spectrumId,
    peaks: result.index.map((index, position) => ({
      index,
      x: result.x[position],
      y: result.y[position],
      prominence: result.prominence[position] ?? 0,
    })),
    settings: result.settings,
  }
}

export async function suggestSmoothing(
  request: Extract<WorkerRequest, { type: 'suggest_smoothing' }>,
): Promise<WorkerResponse> {
  const suggestion = await runTool<SmoothingSuggestion>(
    request,
    { ordinate: request.ordinate },
    'tool_result = suggest_savgol(np.asarray(ordinate, dtype=float))\n',
  )
  return { type: 'smoothing_suggestion', requestId: request.requestId, spectrumId: request.spectrumId, suggestion }
}
