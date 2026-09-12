/**
 * Mock real-time layer.
 *
 * In the real app this would be a WebSocket/SSE connection. The mock uses the
 * BroadcastChannel API (falling back to a window event) so multiple browser
 * tabs stay in sync, and since the mock database persists to localStorage,
 * every tab genuinely sees updates from the others — a believable stand-in for
 * server push.
 */

export interface RealtimeEvent {
  kind: 'global' | 'board'
  boardId?: string
  op: string
  at: number
}

type Listener = (event: RealtimeEvent) => void

const CHANNEL_NAME = 'cadence:sync'
const LOCAL_EVENT = 'cadence:sync:local'

let bus: BroadcastChannel | null = null
if (typeof BroadcastChannel !== 'undefined') {
  try {
    bus = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    bus = null
  }
}

export function publish(event: RealtimeEvent): void {
  try {
    bus?.postMessage(event)
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<RealtimeEvent>(LOCAL_EVENT, { detail: event }))
  }
}

export function subscribe(listener: Listener): () => void {
  if (typeof window === 'undefined') return () => undefined

  const fromChannel = (ev: MessageEvent) => {
    listener(ev.data as RealtimeEvent)
  }
  const fromLocal = (ev: Event) => {
    listener((ev as CustomEvent<RealtimeEvent>).detail)
  }

  bus?.addEventListener('message', fromChannel)
  window.addEventListener(LOCAL_EVENT, fromLocal)
  window.addEventListener('storage', fromLocal as unknown as EventListener)

  return () => {
    bus?.removeEventListener('message', fromChannel)
    window.removeEventListener(LOCAL_EVENT, fromLocal)
    window.removeEventListener('storage', fromLocal as unknown as EventListener)
  }
}