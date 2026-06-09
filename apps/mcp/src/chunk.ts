const DEFAULT_MAX_CHARS = 4000

export type Chunk = {
  content: string
  heading_path: string[]
}

type Section = { headingPath: string[]; lines: string[] }

type SectionParseState = { sections: Section[]; stack: string[] }

function parseLine(state: SectionParseState, line: string): SectionParseState {
  const heading = /^(#{1,6})\s+(.+)$/.exec(line)
  if (!heading) {
    const current = state.sections[state.sections.length - 1]
    if (current) current.lines.push(line)
    return state
  }
  const level = heading[1]?.length ?? 1
  const title = heading[2]?.trim() ?? ''
  // stack indexa headings por nivel: truncar a niveles superiores y fijar el actual
  const stack = [...state.stack.slice(0, level - 1), title]
  return {
    sections: [...state.sections, { headingPath: stack.filter(Boolean), lines: [line] }],
    stack
  }
}

function splitIntoSections(text: string): Section[] {
  const initial: SectionParseState = { sections: [{ headingPath: [], lines: [] }], stack: [] }
  return text.split('\n').reduce(parseLine, initial).sections
}

function splitOversizedSection(content: string, headingPath: string[], maxChars: number): Chunk[] {
  type GreedyState = { chunks: Chunk[]; buffer: string }
  const initial: GreedyState = { chunks: [], buffer: '' }
  const { chunks, buffer } = content.split(/\n{2,}/).reduce<GreedyState>((state, paragraph) => {
    const candidate = state.buffer.length === 0 ? paragraph : `${state.buffer}\n\n${paragraph}`
    if (candidate.length > maxChars && state.buffer.length > 0) {
      return {
        chunks: [...state.chunks, { content: state.buffer, heading_path: headingPath }],
        buffer: paragraph
      }
    }
    return { chunks: state.chunks, buffer: candidate }
  }, initial)
  return buffer.length > 0 ? [...chunks, { content: buffer, heading_path: headingPath }] : chunks
}

export function chunkMarkdown(text: string, opts: { maxChars?: number } = {}): Chunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS
  return splitIntoSections(text).flatMap(section => {
    const content = section.lines.join('\n').trim()
    if (!content) return []
    if (content.length <= maxChars) return [{ content, heading_path: section.headingPath }]
    return splitOversizedSection(content, section.headingPath, maxChars)
  })
}
