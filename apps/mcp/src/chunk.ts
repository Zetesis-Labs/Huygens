const DEFAULT_MAX_CHARS = 4000

export type Chunk = {
  content: string
  heading_path: string[]
}

type Section = { headingPath: string[]; lines: string[] }

function splitIntoSections(text: string): Section[] {
  const sections: Section[] = [{ headingPath: [], lines: [] }]
  const stack: string[] = []
  for (const line of text.split('\n')) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!m) {
      const current = sections[sections.length - 1]
      if (current) current.lines.push(line)
      continue
    }
    const level = m[1]?.length ?? 1
    const title = m[2]?.trim() ?? ''
    stack.splice(level - 1)
    stack[level - 1] = title
    sections.push({ headingPath: stack.filter(Boolean), lines: [line] })
  }
  return sections
}

function splitOversizedSection(content: string, headingPath: string[], maxChars: number): Chunk[] {
  const paragraphs = content.split(/\n{2,}/)
  const chunks: Chunk[] = []
  let buffer = ''
  for (const p of paragraphs) {
    const candidate = buffer.length === 0 ? p : `${buffer}\n\n${p}`
    if (candidate.length > maxChars && buffer.length > 0) {
      chunks.push({ content: buffer, heading_path: headingPath })
      buffer = p
    } else {
      buffer = candidate
    }
  }
  if (buffer.length > 0) chunks.push({ content: buffer, heading_path: headingPath })
  return chunks
}

export function chunkMarkdown(text: string, opts: { maxChars?: number } = {}): Chunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS
  const out: Chunk[] = []
  for (const section of splitIntoSections(text)) {
    const content = section.lines.join('\n').trim()
    if (!content) continue
    if (content.length <= maxChars) {
      out.push({ content, heading_path: section.headingPath })
    } else {
      out.push(...splitOversizedSection(content, section.headingPath, maxChars))
    }
  }
  return out
}
