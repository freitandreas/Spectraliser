import type { BatchRequest, WorkerRequest, WorkerResponse } from '../../worker/messages'

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
  private initPromise: Promise<WorkerResponse> | null = null
  private executionQueue: Promise<unknown> = Promise.resolve()

  constructor(endpoint: WorkerEndpoint) {
    this.endpoint = endpoint
    this.endpoint.subscribe((message) => {
      this.handleMessage(message)
    })
  }

  async init(): Promise<WorkerResponse> {
    if (!this.initPromise) {
      const requestId = createId('init')
      const request: WorkerRequest = {
        type: 'init',
        requestId,
      }
      this.initPromise = this.send(request)
    }
    return this.initPromise
  }

  async executeBatch(input: Omit<BatchRequest, 'type' | 'requestId'>): Promise<WorkerResponse> {
    await this.init()
    return this.enqueueRequest({ type: 'execute_batch', requestId: createId('exec_batch'), ...input })
  }

  async detectPeaks(input: {
    spectrumId: string
    abscissa: number[]
    ordinate: number[]
    prominence: number
    minDistance: number
    minHeight: number | null
    mode: 'maxima' | 'minima'
  }): Promise<WorkerResponse> {
    await this.init()

    const request: WorkerRequest = {
      type: 'detect_peaks',
      requestId: createId('detect_peaks'),
      spectrumId: input.spectrumId,
      abscissa: input.abscissa,
      ordinate: input.ordinate,
      prominence: input.prominence,
      minDistance: input.minDistance,
      minHeight: input.minHeight,
      mode: input.mode,
    }

    return this.enqueueRequest(request)
  }

  async computePeakHeatmap(input: {
    spectrumId: string
    abscissa: number[]
    ordinate: number[]
    prominenceValues: number[]
    distanceValues: number[]
    minHeight: number | null
    mode: 'maxima' | 'minima'
  }): Promise<WorkerResponse> {
    await this.init()

    const request: WorkerRequest = {
      type: 'peak_heatmap',
      requestId: createId('peak_heatmap'),
      spectrumId: input.spectrumId,
      abscissa: input.abscissa,
      ordinate: input.ordinate,
      prominenceValues: input.prominenceValues,
      distanceValues: input.distanceValues,
      minHeight: input.minHeight,
      mode: input.mode,
    }

    return this.enqueueRequest(request)
  }

  private enqueueRequest(request: WorkerRequest): Promise<WorkerResponse> {
    const queued = this.executionQueue.then(() => this.send(request), () => this.send(request))
    this.executionQueue = queued.then(() => undefined, () => undefined)
    return queued
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
  if (typeof Worker === 'undefined') {
    return {
      postMessage() {
        // No-op in non-browser test environments. Real browser execution still uses a real worker.
      },
      subscribe() {
        // No-op in non-browser test environments. Real browser execution still uses a real worker.
      },
    }
  }

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
