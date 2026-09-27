import type { WorkerResponse } from './messages'
import { workerRequestSchema } from './messages'
import { logInfo, logWarn, logError, state, ensurePyodideReady } from './runtimeCore'
import { executeScript } from './scriptRuntime'
import { detectPeaks, computePeakHeatmap } from './peakRuntime'

export async function handleWorkerRequest(requestRaw: unknown): Promise<WorkerResponse> {
  logInfo('Incoming worker message raw:', requestRaw)

  const parsed = workerRequestSchema.safeParse(requestRaw)
  if (!parsed.success) {
    logError('Worker request schema validation failed:', parsed.error.format())
    return {
      type: 'error',
      requestId: 'unknown',
      message: parsed.error.message,
    }
  }

  const request = parsed.data
  logInfo(`Processing request of type '${request.type}' (ID: ${request.requestId})`)

  if (request.type === 'init') {
    try {
      const pyodide = await ensurePyodideReady()
      logInfo(`Worker ready signal sent for request ID: ${request.requestId}`)
      return {
        type: 'ready',
        requestId: request.requestId,
        pyodideVersion: pyodide.version,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logError(`Initialization request failed (ID: ${request.requestId}):`, message)
      return {
        type: 'error',
        requestId: request.requestId,
        message,
      }
    }
  }

  if (request.type === 'cancel') {
    logWarn(`Registering cancellation for request ID: ${request.targetRequestId}`)
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

    if (request.type === 'detect_peaks') {
      return await detectPeaks(request)
    }

    return await computePeakHeatmap(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error'
    logError(`Execution failed for request ${request.requestId}:`, message)
    return {
      type: 'error',
      requestId: request.requestId,
      message,
    }
  }
}