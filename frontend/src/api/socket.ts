/**
 * Real-time layer backed by the backend WebSocket endpoint.
 *
 * Protocol (mirrors the backend `routes/realtime.py`):
 *   1. Connect to `<ws-base>/realtime`.
 *   2. Send `{"type": "auth", "token": "<session token>"}` — server replies
 *      `{"type": "authed", "ok": true}` (closes 4401 on failure).
 *   3. Send `{"type": "subscribe", "board_id": "<id>"}` per board — server
 *      replies `{"type": "subscribed", "board_id": "<id>"}`.
 *   4. Broadcasts arrive as `{"kind": "board", "board_id": ..., "op": ..., "at": ..}`
 *      or `{"kind": "global", "op": ...}`. They are notifications only; callers
 *      refetch the affected query.
 *
 * The socket auto-connects whenever a session token exists, re-subscribes on
 * reconnect, and stops when the user signs out.
 */

import { WS_BASE } from './config'
import { getToken } from './token'

type Listener = () => void

const boardListeners = new Map<string, Set<Listener>>()
const globalListeners = new Set<Listener>()
const subscribedBoards = new Set<string>()

let socket: WebSocket | null = null
let alive = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function socketUrl(): string {
  return `${WS_BASE}/realtime`
}

export function startRealtime(): void {
  alive = true
  openIfNeeded()
}

export function stopRealtime(): void {
  alive = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    socket.onclose = null
    socket.close()
  }
  socket = null
}

export function subscribeBoard(boardId: string, cb: Listener): () => void {
  let listeners = boardListeners.get(boardId)
  if (!listeners) {
    listeners = new Set()
    boardListeners.set(boardId, listeners)
  }
  listeners.add(cb)
  subscribedBoards.add(boardId)
  openIfNeeded()
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0) {
      boardListeners.delete(boardId)
      subscribedBoards.delete(boardId)
    }
  }
}

export function subscribeGlobal(cb: Listener): () => void {
  globalListeners.add(cb)
  openIfNeeded()
  return () => {
    globalListeners.delete(cb)
  }
}

function openIfNeeded(): void {
  alive = true
  const token = getToken()
  if (!token) return
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  connect(token)
}

function connect(token: string): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  let ws: WebSocket
  try {
    ws = new WebSocket(socketUrl())
  } catch {
    return
  }
  socket = ws
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token }))
  }
  ws.onmessage = (ev: MessageEvent) => {
    handleMessage(ev)
  }
  ws.onclose = () => {
    if (socket === ws) socket = null
    if (!alive || !getToken()) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      openIfNeeded()
    }, 3000)
  }
  ws.onerror = () => {
    // onclose follows and schedules the reconnect
  }
}

function handleMessage(ev: MessageEvent): void {
  let msg: unknown
  try {
    msg = JSON.parse(String(ev.data))
  } catch {
    return
  }
  if (!msg || typeof msg !== 'object') return
  const m = msg as Record<string, unknown>

  if (m.type === 'authed' && m.ok) {
    for (const boardId of subscribedBoards) {
      socket?.send(JSON.stringify({ type: 'subscribe', board_id: boardId }))
    }
    return
  }
  if (m.type === 'subscribed') return

  if (m.kind === 'board') {
    const boardId = m.board_id as string | undefined
    const listeners = boardId ? boardListeners.get(boardId) : undefined
    if (listeners) for (const cb of [...listeners]) cb()
    return
  }
  if (m.kind === 'global') {
    for (const cb of [...globalListeners]) cb()
  }
}