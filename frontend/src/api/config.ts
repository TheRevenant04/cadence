/**
 * API endpoint configuration.
 *
 * The backend is served on its own port (FastAPI, default 8000). The base URL
 * can be overridden with the `VITE_API_BASE` env var for other environments.
 */

const DEFAULT_BASE = 'http://localhost:8000'

const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? DEFAULT_BASE

export const API_BASE = base.replace(/\/+$/, '')

export const WS_BASE = API_BASE.replace(/^http/, 'ws')