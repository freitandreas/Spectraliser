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
  const scriptInput = {
    spectrumId: 's1',
    abscissa: [1],
    ordinate: [1],
    metadata: {
      name: 'sample',
      sourcePath: 'sample.csv',
      spectrumType: 'uv-vis',
      units: { x: 'nm', y: '' },
      style: { label: 'Sample', lineColor: '#4fc1ff', lineWidth: 2, scatterSymbol: 'circle' },
    },
    scriptCode: "df['ordinate_modified']=df['ordinate_original']",
    preferFloat32: true,
  }

  it('serializes follow-up executions without canceling the in-flight request', async () => {
    const fake = createFakeEndpoint()
    const client = new WorkerClient(fake.endpoint)

    const first = client.executeScript(scriptInput)

    const second = client.executeScript(scriptInput)

    const initRequest = fake.posted.find(msg => msg.type === 'init')
    if (!initRequest) throw new Error('Initialization request missing')
    fake.emit({ type: 'ready', requestId: initRequest.requestId, pyodideVersion: 'test' })
    await new Promise(resolve => setTimeout(resolve, 0))

    const executeMessages = fake.posted.filter((msg) => msg.type === 'execute_script')
    const cancelMessage = fake.posted.find((msg) => msg.type === 'cancel')

    expect(executeMessages).toHaveLength(1)
    expect(cancelMessage).toBeUndefined()

    const firstExec = executeMessages[0]
    if (!firstExec) {
      throw new Error('First execution message missing')
    }

    fake.emit({
      type: 'result',
      requestId: firstExec.requestId,
      spectrumId: 's1',
      ordinateModified: [1],
      precision: 'float32',
    })

    await expect(first).resolves.toMatchObject({ type: 'result' })
    await new Promise(resolve => setTimeout(resolve, 0))

    const queuedMessages = fake.posted.filter((msg) => msg.type === 'execute_script')
    expect(queuedMessages).toHaveLength(2)

    const secondExec = queuedMessages[1]
    if (!secondExec) {
      throw new Error('Queued execution message missing')
    }

    fake.emit({
      type: 'result',
      requestId: secondExec.requestId,
      spectrumId: 's1',
      ordinateModified: [2],
      precision: 'float32',
    })

    await expect(second).resolves.toMatchObject({ type: 'result' })
  })
})
