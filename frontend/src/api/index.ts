/**
 * ============================================================================
 * Central API client — the ONLY module the UI imports for backend calls.
 * ============================================================================
 *
 * Everything the frontend needs from the server goes through `api`. Today the
 * handlers are backed by an in-memory/localStorage mock (`./mock.ts`) so the
 * whole product is interactive without a server.
 *
 * When the real backend is ready, replace the mock handlers with `fetch()`
 * calls (or a generated client) — the method signatures stay identical, so the
 * UI code does not have to change.
 *
 * Example swap for boards.list():
 *   async list() {
 *     const res = await fetch('/api/boards', { credentials: 'include' })
 *     if (!res.ok) throw await toApiError(res)
 *     return res.json()
 *   }
 */

import { apiMock } from './mock'

export { ApiError } from './mock'
export type { ApiMock } from './mock'

export const api = apiMock

export type Api = typeof api