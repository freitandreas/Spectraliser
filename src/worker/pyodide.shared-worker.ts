import type { WorkerResponse } from './messages'
import { handleWorkerRequest } from './runtime'

type SharedWorkerScope = {
  onconnect: ((event: MessageEvent) => void) | null
}

const sharedScope = self as unknown as SharedWorkerScope

sharedScope.onconnect = (event: MessageEvent) => {
  const [port] = event.ports

  port.onmessage = async (messageEvent: MessageEvent<unknown>) => {
    const response: WorkerResponse = await handleWorkerRequest(messageEvent.data)
    port.postMessage(response)
  }

  port.start()
}
