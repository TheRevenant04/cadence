/**
 * API errors.
 *
 * The backend returns every failure as `{ "status": <int>, "message": <string> }`
 * and this client surfaces it as an `ApiError` with the same fields — the same
 * shape the UI already expects (it reads `err.status` and `err.message`).
 */

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}