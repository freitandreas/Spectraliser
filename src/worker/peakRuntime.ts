import type { WorkerRequest, WorkerResponse } from './messages'
import { logInfo, logWarn, logError, ensurePyodideReady } from './runtimeCore'
import peakDetectionSource from '../python/peak_detection.py?raw'

export async function detectPeaks(
  request: Extract<WorkerRequest, { type: 'detect_peaks' }>,
): Promise<WorkerResponse> {
  const startTime = performance.now()
  logInfo(`Detecting peaks for request ID: ${request.requestId} (Spectrum: ${request.spectrumId})`)

  const pyodide = await ensurePyodideReady()

  const globals = pyodide.toPy({
    abscissa: request.abscissa,
    ordinate: request.ordinate,
    prominence: request.prominence,
    min_distance: request.minDistance,
    min_height: request.minHeight,
    mode: request.mode,
  })

  const code = `
${peakDetectionSource}

x = np.asarray(abscissa, dtype=float)
y = np.asarray(ordinate, dtype=float)

settings = {
    'prominence': prominence,
    'minDistance': min_distance,
    'minHeight': min_height,
    'mode': mode,
}

indices, prominences = find_spectral_peaks(y, settings)

peak_index = indices.tolist()
peak_x = x[indices].tolist()
peak_y = y[indices].tolist()
peak_prominence = prominences.tolist()
`

  try {
    pyodide.setStdout({
      batched: (text) => logInfo(`[Python stdout]: ${text}`),
    })
    pyodide.setStderr({
      batched: (text) => logWarn(`[Python stderr]: ${text}`),
    })

    await pyodide.runPythonAsync(code, { globals, locals: globals })

    const indexProxy = globals.get('peak_index')
    const peakIndex = indexProxy.toJs() as number[]
    indexProxy.destroy()

    const xProxy = globals.get('peak_x')
    const peakX = xProxy.toJs() as number[]
    xProxy.destroy()

    const yProxy = globals.get('peak_y')
    const peakY = yProxy.toJs() as number[]
    yProxy.destroy()

    const prominenceProxy = globals.get('peak_prominence')
    const peakProminence = prominenceProxy.toJs() as number[]
    prominenceProxy.destroy()

    logInfo(`Peak detection request ${request.requestId} found ${peakIndex.length} peaks in ${(performance.now() - startTime).toFixed(2)}ms.`)

    return {
      type: 'peaks_result',
      requestId: request.requestId,
      spectrumId: request.spectrumId,
      peaks: peakIndex.map((index, position) => ({
        index,
        x: peakX[position],
        y: peakY[position],
        prominence: peakProminence[position] ?? 0,
      })),
    }
  } catch (error) {
    logError(`Error detecting peaks for request ${request.requestId}:`, error)
    throw error
  } finally {
    globals.destroy()
  }
}

export async function computePeakHeatmap(
  request: Extract<WorkerRequest, { type: 'peak_heatmap' }>,
): Promise<WorkerResponse> {
  const startTime = performance.now()
  logInfo(`Computing peak heatmap for request ID: ${request.requestId} (Spectrum: ${request.spectrumId})`)

  const pyodide = await ensurePyodideReady()

  const globals = pyodide.toPy({
    abscissa: request.abscissa,
    ordinate: request.ordinate,
    prominence_values: request.prominenceValues,
    distance_values: request.distanceValues,
    min_height: request.minHeight,
    mode: request.mode,
  })

  const code = `
${peakDetectionSource}

y = np.asarray(ordinate, dtype=float)

counts = []
for prom in prominence_values:
    row = []
    for dist in distance_values:
        indices, _ = find_spectral_peaks(y, {
            'prominence': prom,
            'minDistance': dist,
            'minHeight': min_height,
            'mode': mode,
        })
        row.append(int(len(indices)))
    counts.append(row)
`

  try {
    pyodide.setStdout({
      batched: (text) => logInfo(`[Python stdout]: ${text}`),
    })
    pyodide.setStderr({
      batched: (text) => logWarn(`[Python stderr]: ${text}`),
    })

    await pyodide.runPythonAsync(code, { globals, locals: globals })

    const countsProxy = globals.get('counts')
    const counts = countsProxy.toJs() as number[][]
    countsProxy.destroy()

    logInfo(`Peak heatmap request ${request.requestId} computed ${counts.length}x${counts[0]?.length ?? 0} grid in ${(performance.now() - startTime).toFixed(2)}ms.`)

    return {
      type: 'peaks_heatmap_result',
      requestId: request.requestId,
      spectrumId: request.spectrumId,
      prominenceValues: request.prominenceValues,
      distanceValues: request.distanceValues,
      counts,
    }
  } catch (error) {
    logError(`Error computing peak heatmap for request ${request.requestId}:`, error)
    throw error
  } finally {
    globals.destroy()
  }
}

