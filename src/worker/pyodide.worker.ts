import type { WorkerResponse } from './messages'
import { handleWorkerRequest } from './runtime'

self.onmessage = async (event: MessageEvent<unknown>) => {
  const response: WorkerResponse = await handleWorkerRequest(event.data)
  self.postMessage(response)
}
