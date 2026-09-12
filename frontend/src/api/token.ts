/**
 * Session token persistence.
 *
 * The backend authenticates via opaque bearer tokens returned by login/signup;
 * they are stored here and attached as `Authorization: Bearer <token>`.
 */

const TOKEN_KEY = 'cadence.token.v1'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null
}

export function setToken(token: string): void {
  storage()?.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  storage()?.removeItem(TOKEN_KEY)
}