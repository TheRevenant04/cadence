/**
 * Sparse, lexorank-style string ranks for task ordering.
 *
 * Ranks are fixed-width decimal strings (e.g. "0000102400") so plain string
 * comparison matches numeric order. New ranks are the midpoint of their
 * neighbours; when there is no room between them the caller rebalances the
 * column (frontend falls back to `midRank` only when it can fit, otherwise the
 * mock backend rebalances and assigns a fresh rank).
 */

const WIDTH = 10

export function padRank(n: number): string {
  return String(n).padStart(WIDTH, '0')
}

export function rankToNumber(rank: string): number {
  return Number(rank || 0)
}

export function compareRank(a: string | null | undefined, b: string | null | undefined): number {
  return rankToNumber(a ?? '') - rankToNumber(b ?? '')
}

/**
 * Returns a rank strictly between `prev` and `next` (both optional), or null if
 * there is no integer room between them.
 */
export function midRank(prev: string | null | undefined, next: string | null | undefined): string | null {
  const lo = prev == null || prev === '' ? 0 : rankToNumber(prev)
  const hi = next == null || next === '' ? 0 : rankToNumber(next)

  // Both empty → very first rank.
  if ((prev == null || prev === '') && (next == null || next === '')) return padRank(1024)

  // Insert before the first task → midpoint of 0..hi.
  if (prev == null || prev === '') {
    const mid = Math.floor(hi / 2)
    if (mid <= 0 || mid >= hi) return null
    return padRank(mid)
  }

  // Append after the last task → double the last rank.
  if (next == null || next === '') return padRank(lo * 2 + 1024)

  const mid = Math.floor((lo + hi) / 2)
  if (mid <= lo || mid >= hi) return null
  return padRank(mid)
}

/** Produces a uniform set of ranks for a whole column (rebalance). */
export function rebalanceRanks(count: number, base = 100_000_000): string[] {
  if (count === 0) return []
  const step = Math.max(1, Math.floor(base / count))
  if (count <= 2) return [padRank(step), padRank(step * 2)].slice(0, count)
  // Keep margins at each end so future inserts still have room.
  const usable = base - step * 2
  const unit = Math.floor(usable / count)
  return Array.from({ length: count }, (_, i) => padRank(step + unit * (i + 1)))
}

export function sortByRank<T>(items: T[], getRank: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareRank(getRank(a), getRank(b)))
}