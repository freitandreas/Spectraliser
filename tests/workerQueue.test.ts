import { describe, expect, it, vi } from 'vitest'
import { WorkerClient } from '../src/services/worker/workerClient'
import type { WorkerRequest, WorkerResponse } from '../src/worker/messages'

function createFakeEndpoint() {
  let handler: ((message: WorkerResponse) => void) | null = null
  const posted: WorkerRequest[] = []

  return {
    endpoint: {
      postMessage(request: WorkerRequest) {
        posted.push(request)
      },
      subscribe(next: (message: WorkerResponse) => void) {
        handler = next
      },
    },
    posted,
    emit(message: WorkerResponse) {
      handler?.(message)
    },
  }
}

describe('WorkerClient execution queue', () => {
  const batchInput = {
    runScript: 'run_results = []',
    scriptFiles: { 'processing.py': 'x = 1' },
    samples: [{
      id: 's1',
      abscissa: [1],
      ordinate: [1],
      metadata: {
        spectrumType: 'uv-vis',
        units: { x: 'nm', y: '' },
        pipeline: [],
        peakDetection: { prominence: 0.01, minDistance: 1, minHeight: null, mode: 'maxima' as const },
      },
    }],
    preferFloat32: true,
  }

  it('serializes follow-up executions without canceling the in-flight request', async () => {
    const fake = createFakeEndpoint()
    const client = new WorkerClient(fake.endpoint)

    const first = client.executeBatch(batchInput)

    const second = client.executeBatch(batchInput)

    const initRequest = fake.posted.find(msg => msg.type === 'init')
    if (!initRequest) throw new Error('Initialization request missing')
    fake.emit({ type: 'ready', requestId: initRequest.requestId, pyodideVersion: 'test' })
    await new Promise(resolve => setTimeout(resolve, 0))

    const executeMessages = fake.posted.filter((msg) => msg.type === 'execute_batch')
    const cancelMessage = fake.posted.find((msg) => msg.type === 'cancel')

    expect(executeMessages).toHaveLength(1)
    expect(cancelMessage).toBeUndefined()

    const firstExec = executeMessages[0]
    if (!firstExec) {
      throw new Error('First execution message missing')
    }

    fake.emit({
      type: 'batch_result',
      requestId: firstExec.requestId,
      results: [{ id: 's1', ordinateModified: [1], peaks: [], precision: 'float32' }],
    })

    await expect(first).resolves.toMatchObject({ type: 'batch_result' })
    await new Promise(resolve => setTimeout(resolve, 0))

    const queuedMessages = fake.posted.filter((msg) => msg.type === 'execute_batch')
    expect(queuedMessages).toHaveLength(2)

    const secondExec = queuedMessages[1]
    if (!secondExec) {
      throw new Error('Queued execution message missing')
    }

    fake.emit({
      type: 'batch_result',
      requestId: secondExec.requestId,
      results: [{ id: 's1', ordinateModified: [2], peaks: [], precision: 'float32' }],
    })

    await expect(second).resolves.toMatchObject({ type: 'batch_result' })
  })
})
