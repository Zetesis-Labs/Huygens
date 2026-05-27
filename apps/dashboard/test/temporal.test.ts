import { describe, expect, test } from 'bun:test'
import type { Proposal } from '../src/lib/surreal'
import { commitAnchor } from '../src/lib/temporal'

function makeProposal(rest: Partial<Proposal> = {}): Proposal {
  return {
    id: 'proposal:test',
    status: 'draft',
    payload: {
      raw_ids: [],
      narrative_blocks: [],
      note_creates: [],
      note_updates: [],
      edges: []
    },
    ...rest
  }
}

describe('commitAnchor', () => {
  test('committed proposal with versionstamp + committed_at → anchor', () => {
    const p = makeProposal({
      status: 'committed',
      result: { versionstamp: '12345', committed_at: '2026-05-27T10:00:00Z' }
    })
    expect(commitAnchor(p)).toEqual({ versionstamp: '12345', committedAt: '2026-05-27T10:00:00Z' })
  })

  test('coerces a numeric/bigint-like versionstamp to string', () => {
    const p = makeProposal({
      status: 'committed',
      result: { versionstamp: 99 as unknown as string, committed_at: '2026-05-27T10:00:00Z' }
    })
    expect(commitAnchor(p)?.versionstamp).toBe('99')
  })

  test('committed_at as Date → ISO string', () => {
    const date = new Date('2026-05-27T10:00:00.000Z')
    const p = makeProposal({
      status: 'committed',
      result: { versionstamp: '1', committed_at: date }
    })
    expect(commitAnchor(p)?.committedAt).toBe('2026-05-27T10:00:00.000Z')
  })

  test('committed_at as string is passed through verbatim', () => {
    const p = makeProposal({
      status: 'committed',
      result: { versionstamp: '1', committed_at: '2026-05-27T10:00:00Z' }
    })
    expect(commitAnchor(p)?.committedAt).toBe('2026-05-27T10:00:00Z')
  })

  test('draft proposal → null (live view is correct)', () => {
    expect(commitAnchor(makeProposal({ status: 'draft' }))).toBeNull()
  })

  test('non-committed status (e.g. discarded) → null', () => {
    expect(commitAnchor(makeProposal({ status: 'discarded' }))).toBeNull()
  })

  test('committed but no result → null', () => {
    expect(commitAnchor(makeProposal({ status: 'committed' }))).toBeNull()
  })

  test('committed with result but missing versionstamp → null (pre-migration commit)', () => {
    const p = makeProposal({ status: 'committed', result: { committed_at: '2026-05-27T10:00:00Z' } })
    expect(commitAnchor(p)).toBeNull()
  })

  test('committed with versionstamp but missing committed_at → null', () => {
    const p = makeProposal({ status: 'committed', result: { versionstamp: '12345' } })
    expect(commitAnchor(p)).toBeNull()
  })

  test('null versionstamp → null', () => {
    const p = makeProposal({
      status: 'committed',
      result: { versionstamp: null, committed_at: '2026-05-27T10:00:00Z' }
    })
    expect(commitAnchor(p)).toBeNull()
  })
})
