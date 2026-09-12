import { describe, expect, it } from 'vitest'
import { compareRank, midRank, padRank, rankToNumber, rebalanceRanks, sortByRank } from './rank'

describe('rank basics', () => {
  it('pads numbers to a fixed width and round-trips', () => {
    expect(padRank(1024)).toBe('0000001024')
    expect(rankToNumber('0000001024')).toBe(1024)
  })

  it('compares ranks numerically in string order', () => {
    expect(compareRank('0000001024', '0000002048')).toBeLessThan(0)
  })
})

describe('midRank', () => {
  it('returns the very first rank for an empty column', () => {
    expect(midRank(null, null)).toBe('0000001024')
  })

  it('inserts at the midpoint between neighbours', () => {
    expect(midRank('0000000100', '0000000300')).toBe('0000000200')
  })

  it('inserts before the first task by halving the floor', () => {
    expect(midRank(null, '0000000200')).toBe('0000000100')
  })

  it('appends after the last task with room to spare', () => {
    expect(midRank('0000000100', null)).toBe('0000001224')
  })

  it('returns null when there is no integer room', () => {
    expect(midRank('0000000100', '0000000101')).toBeNull()
  })
})

describe('rebalanceRanks', () => {
  it('produces a strictly increasing sorted set', () => {
    const ranks = rebalanceRanks(6)
    expect(ranks).toHaveLength(6)
    const sorted = [...ranks].sort()
    expect(ranks).toEqual(sorted)
    for (let i = 1; i < ranks.length; i++) {
      expect(compareRank(ranks[i - 1]!, ranks[i]!)).toBeLessThan(0)
    }
  })

  it('returns an empty array for no tasks', () => {
    expect(rebalanceRanks(0)).toEqual([])
  })
})

describe('sortByRank', () => {
  it('sorts items by their rank field', () => {
    const items = [
      { id: 'a', rank: '0000002048' },
      { id: 'b', rank: '0000000001' },
      { id: 'c', rank: '0000000100' },
    ]
    expect(sortByRank(items, (t) => t.rank).map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })
})