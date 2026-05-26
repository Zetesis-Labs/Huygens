import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type RenderedD2 = { base64: string; mimeType: string }
export type D2Format = 'svg' | 'png' | 'jpeg'

/** Run a CLI tool, surfacing stderr on failure. */
async function run(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, { stdout: 'ignore', stderr: 'pipe' })
  const code = await proc.exited
  if (code !== 0) {
    const err = await new Response(proc.stderr).text()
    throw new Error(`${cmd[0]} failed (exit ${code}): ${err.slice(0, 300).trim()}`)
  }
}

/**
 * Render a D2 source string to an image, using the toolchain bundled in the MCP
 * container: `d2` → SVG, `rsvg-convert` → PNG (good embedded-font fidelity),
 * ImageMagick `convert` → JPEG (from the PNG). All work on temp files inside the
 * container; nothing leaks to the host. Returns base64 + mime for MCP image content.
 *
 * Layout: ELK ("Layered" algorithm) over the default dagre — its orthogonal
 * routing keeps the change graph readable with fewer edge crossings.
 */
export async function renderD2(d2: string, format: D2Format): Promise<RenderedD2> {
  const dir = await mkdtemp(join(tmpdir(), 'huygens-d2-'))
  try {
    const d2Path = join(dir, 'diagram.d2')
    const svgPath = join(dir, 'diagram.svg')
    await Bun.write(d2Path, d2)
    await run(['d2', '--layout', 'elk', '--pad', '30', d2Path, svgPath])

    if (format === 'svg') {
      const svg = await Bun.file(svgPath).text()
      return { base64: Buffer.from(svg).toString('base64'), mimeType: 'image/svg+xml' }
    }

    const pngPath = join(dir, 'diagram.png')
    await run(['rsvg-convert', '-f', 'png', '-o', pngPath, svgPath])
    if (format === 'png') {
      const buf = Buffer.from(await Bun.file(pngPath).arrayBuffer())
      return { base64: buf.toString('base64'), mimeType: 'image/png' }
    }

    const jpgPath = join(dir, 'diagram.jpg')
    await run(['convert', pngPath, '-background', 'white', '-flatten', jpgPath])
    const buf = Buffer.from(await Bun.file(jpgPath).arrayBuffer())
    return { base64: buf.toString('base64'), mimeType: 'image/jpeg' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
