/**
 * ============================================================================
 * Central API client — the ONLY module the UI imports for backend calls.
 * ============================================================================
 *
 * Everything the frontend needs from the server goes through `api`. The
 * handlers talk to the FastAPI backend (`api/`) over HTTP + WebSocket: session
 * tokens are stored in localStorage and sent as `Authorization: Bearer`,
 * realtime updates arrive over a WebSocket connection. The method signatures
 * match the original localStorage mock exactly, so the UI code does not change.
 *
 * To run against the backend: `uvicorn app.app:app --port 8000` from `api/`.
 * The backend base URL can be overridden with the `VITE_API_BASE` env var.
 */

export { ApiError } from './errors'
export { api } from './client'
export type { ApiClient, AdminBoardSummary, UserSearchResult } from './client'
export type { ApiMock } from './mock'

export type Api = import('./client').ApiClient