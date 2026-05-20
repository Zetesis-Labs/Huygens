import { describe, expect, test } from 'bun:test'
import { chunkMarkdown } from '../src/chunk'

describe('chunkMarkdown', () => {
  test('empty input → no chunks', () => {
    expect(chunkMarkdown('')).toEqual([])
    expect(chunkMarkdown('   \n\n   ')).toEqual([])
  })

  test('single short paragraph stays in one chunk with empty heading path', () => {
    const out = chunkMarkdown('just a paragraph')
    expect(out).toHaveLength(1)
    expect(out[0]?.heading_path).toEqual([])
    expect(out[0]?.content).toBe('just a paragraph')
  })

  test('heading-only document gets one chunk per heading', () => {
    const out = chunkMarkdown('# A\n\nbody a\n\n## B\n\nbody b')
    expect(out).toHaveLength(2)
    expect(out[0]?.heading_path).toEqual(['A'])
    expect(out[1]?.heading_path).toEqual(['A', 'B'])
  })

  test('oversized section is split by paragraph', () => {
    const para = 'x'.repeat(2000)
    const text = `# Big\n\n${para}\n\n${para}\n\n${para}`
    const out = chunkMarkdown(text, { maxChars: 2500 })
    expect(out.length).toBeGreaterThan(1)
    for (const chunk of out) {
      expect(chunk.content.length).toBeLessThanOrEqual(2500)
      expect(chunk.heading_path).toEqual(['Big'])
    }
  })

  test('nested headings preserve breadcrumb', () => {
    const out = chunkMarkdown('# Top\n\n## Sub\n\ncontent under sub\n\n### Deep\n\ndeep content')
    const deepChunk = out.find(c => c.content.includes('deep content'))
    expect(deepChunk?.heading_path).toEqual(['Top', 'Sub', 'Deep'])
  })
})
