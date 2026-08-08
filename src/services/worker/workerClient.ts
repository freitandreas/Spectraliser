import type { WorkerRequest, WorkerResponse } from '../../worker/messages'

type PendingResolver = {
  resolve: (value: WorkerResponse) => void
  reject: (reason?: unknown) => void
}

interface WorkerEndpoint {
  postMessage: (request: WorkerRequest) => void
  subscribe: (handler: (message: WorkerResponse) => void) => void
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export class WorkerClient {
  private readonly endpoint: WorkerEndpoint
  private readonly pending = new Map<string, PendingResolver>()
  private currentExecutionRequestId: string | null = null

  constructor(endpoint: WorkerEndpoint) {
    this.endpoint = endpoint
    this.endpoint.subscribe((message) => {
      this.handleMessage(message)
    })
  }

  async init(): Promise<WorkerResponse> {
    const requestId = createId('init')
    const request: WorkerRequest = {
      type: 'init',
      requestId,
    }
    return this.send(request)
  }

  async executePipeline(input: {
    spectrumId: string
    abscissa: number[]
    ordinate: number[]
    pipelineCode: string
    preferFloat32: boolean
  }): Promise<WorkerResponse> {
    if (this.currentExecutionRequestId) {
      const cancelRequest: WorkerRequest = {
        type: 'cancel',
        requestId: createId('cancel'),
        targetRequestId: this.currentExecutionRequestId,
      }
      this.endpoint.postMessage(cancelRequest)
    }

    const requestId = createId('exec')
    this.currentExecutionRequestId = requestId

    const request: WorkerRequest = {
      type: 'execute_pipeline',
      requestId,
      spectrumId: input.spectrumId,
      abscissa: input.abscissa,
      ordinate: input.ordinate,
      pipelineCode: input.pipelineCode,
      preferFloat32: input.preferFloat32,
    }

    const response = await this.send(request)

    if (this.currentExecutionRequestId === requestId) {
      this.currentExecutionRequestId = null
    }

    return response
  }

  async executeScript(input: {
    spectrumId: string
    abscissa: number[]
    ordinate: number[]
    metadata: {
      name: string
      sourcePath: string
      spectrumType: string
      pipeline?: Array<{
        id: string
        type: string
        scope: string
        enabled: boolean
        params: Record<string, number | string | boolean>
      }>
      units: {
        x: string
        y: string
      }
      style: {
        label: string
        lineColor: string
        lineWidth: number
        scatterSymbol: string
        visible?: boolean
      }
    }
    scriptCode: string
    preferFloat32: boolean
  }): Promise<WorkerResponse> {
    if (this.currentExecutionRequestId) {
      const cancelRequest: WorkerRequest = {
        type: 'cancel',
        requestId: createId('cancel'),
        targetRequestId: this.currentExecutionRequestId,
      }
      this.endpoint.postMessage(cancelRequest)
    }

    const requestId = createId('exec_script')
    this.currentExecutionRequestId = requestId

    const request: WorkerRequest = {
      type: 'execute_script',
      requestId,
      spectrumId: input.spectrumId,
      abscissa: input.abscissa,
      ordinate: input.ordinate,
      metadata: input.metadata,
      scriptCode: input.scriptCode,
      preferFloat32: input.preferFloat32,
    }

    const response = await this.send(request)

    if (this.currentExecutionRequestId === requestId) {
      this.currentExecutionRequestId = null
    }

    return response
  }

  private send(request: WorkerRequest): Promise<WorkerResponse> {
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(request.requestId, { resolve, reject })
      this.endpoint.postMessage(request)
    })
  }

  private handleMessage(message: WorkerResponse): void {
    const resolver = this.pending.get(message.requestId)

    if (!resolver) {
      return
    }

    if (message.type === 'error') {
      resolver.reject(new Error(message.message))
    } else {
      resolver.resolve(message)
    }

    this.pending.delete(message.requestId)
  }
}

function createDedicatedWorkerEndpoint(): WorkerEndpoint {
  const worker = new Worker(new URL('../../worker/pyodide.worker.ts', import.meta.url), {
    type: 'module',
  })

  return {
    postMessage(request: WorkerRequest) {
      worker.postMessage(request)
    },
    subscribe(handler) {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        handler(event.data)
      }
    },
  }
}

export function createWorkerClient(): WorkerClient {
  const endpoint = createDedicatedWorkerEndpoint()
  return new WorkerClient(endpoint)
}
