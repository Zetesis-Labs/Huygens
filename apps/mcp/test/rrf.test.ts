import { describe, expect, test } from 'bun:test'
import { rrfFuse } from '../src/tools/hybrid-search'

// Pure, DB-free unit tests for the Reciprocal Rank Fusion core.

describe('rrfFuse', () => {
  test('an id ranked in both legs beats one ranked high in only one', () => {
    // "b" is 2nd in dense and 1st in lexical; "a" is 1st in dense only.
    const fused = rrfFuse([
      ['a', 'b', 'c'],
      ['b', 'd', 'a']
    ])
    const ranked = [...fused.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id)
    expect(ranked[0]).toBe('b')
  })

  test('score is the sum of 1/(k+rank) across legs', () => {
    const k = 60
    const fused = rrfFuse(
      [
        ['x', 'y'],
        ['y', 'x']
      ],
      k
    )
    // x: rank 1 in leg A, rank 2 in leg B. y: rank 2 in A, rank 1 in B. Symmetric.
    expect(fused.get('x')).toBeCloseTo(1 / (k + 1) + 1 / (k + 2), 10)
    expect(fused.get('x')).toBeCloseTo(fused.get('y') as number, 10)
  })

  test('a singleton leg degrades to plain 1/(k+rank) ordering', () => {
    const fused = rrfFuse([['a', 'b', 'c']])
    const ranked = [...fused.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id)
    expect(ranked).toEqual(['a', 'b', 'c'])
  })

  test('empty input yields an empty map', () => {
    expect(rrfFuse([]).size).toBe(0)
    expect(rrfFuse([[], []]).size).toBe(0)
  })

  test('a smaller k sharpens the gap between rank 1 and rank 2', () => {
    const gap = (k: number) => 1 / (k + 1) - 1 / (k + 2)
    expect(gap(1)).toBeGreaterThan(gap(60))
  })
})
