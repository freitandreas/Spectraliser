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

describe('WorkerClient queue cancellation', () => {
  it('sends cancel for previous execution', async () => {
    const fake = createFakeEndpoint()
    const client = new WorkerClient(fake.endpoint)

    const first = client.executePipeline({
      spectrumId: 's1',
      abscissa: [1],
      ordinate: [1],
      pipelineCode: "df['ordinate_modified']=df['ordinate_original']",
      preferFloat32: true,
    })

    const second = client.executePipeline({
      spectrumId: 's1',
      abscissa: [1],
      ordinate: [1],
      pipelineCode: "df['ordinate_modified']=df['ordinate_original']",
      preferFloat32: true,
    })

    const executeMessages = fake.posted.filter((msg) => msg.type === 'execute_pipeline')
    const cancelMessage = fake.posted.find((msg) => msg.type === 'cancel')

    expect(executeMessages).toHaveLength(2)
    expect(cancelMessage).toBeDefined()

    const firstExec = executeMessages[0]
    const secondExec = executeMessages[1]

    if (!firstExec || !secondExec || !cancelMessage || cancelMessage.type !== 'cancel') {
      throw new Error('Messages missing')
    }

    fake.emit({ type: 'cancelled', requestId: cancelMessage.requestId })
    fake.emit({
      type: 'result',
      requestId: firstExec.requestId,
      spectrumId: 's1',
      ordinateModified: [1],
      precision: 'float32',
    })
    fake.emit({
      type: 'result',
      requestId: secondExec.requestId,
      spectrumId: 's1',
      ordinateModified: [2],
      precision: 'float32',
    })

    await expect(first).resolves.toMatchObject({ type: 'result' })
    await expect(second).resolves.toMatchObject({ type: 'result' })
  })
})
