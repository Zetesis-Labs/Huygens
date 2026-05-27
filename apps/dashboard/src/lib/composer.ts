import { transform } from 'sucrase'
import * as zod from 'zod'

// ─────────────────────────────────────────────────────────────────────────
// Query composer: the saved unit is a TS *script* (not the generated SQL). The
// script exports `inputs` (a Zod schema) and `build(params): string`. We
// transpile it (sucrase) and eval it in the browser — the function is pure
// (params → SurrealQL string), so there's nothing to sandbox; the generated
// SurrealQL is run later by the read-only MCP.
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_SCRIPT = `import { z } from 'zod'

// Campos de entrada (generan el formulario):
export const inputs = z.object({
  area: z.string().describe('record id del área, p.ej. note:159yz12k3mocht8hmssy'),
  depth: z.number().int().min(1).max(6).default(4).describe('profundidad part_of'),
})

// Lógica → devuelve SurrealQL (read-only):
export function build(p: z.infer<typeof inputs>): string {
  const chain = (n: number) => Array.from({ length: n }, (_, i) =>
    '->part_of->note'.repeat(i + 1) + \` CONTAINS \${p.area}\`).join('\\n   OR ')
  return \`SELECT id, title, type.slug AS type, state, ->part_of->note AS part_of
FROM note
WHERE id = \${p.area}
   OR \${chain(p.depth)}
ORDER BY type, title\`
}
`

export interface Composer {
  inputs: zod.ZodTypeAny
  build: (params: Record<string, unknown>) => string
}

/** Transpile a TS composer script and eval it to extract `inputs` + `build`.
 * `import { z } from 'zod'` is resolved to the bundled zod; no other imports. */
export function loadComposer(scriptTS: string): Composer {
  const { code } = transform(scriptTS, { transforms: ['typescript', 'imports'], production: true })
  const mod: { exports: Record<string, unknown> } = { exports: {} }
  const require = (m: string): unknown => {
    if (m === 'zod') return zod
    throw new Error(`import no permitido: "${m}" (solo 'zod')`)
  }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(require, mod, mod.exports)
  const inputs = mod.exports.inputs as zod.ZodTypeAny | undefined
  const build = mod.exports.build as Composer['build'] | undefined
  if (!inputs || typeof (inputs as { safeParse?: unknown }).safeParse !== 'function') {
    throw new Error('el script debe exportar `inputs` (un esquema Zod)')
  }
  if (typeof build !== 'function') throw new Error('el script debe exportar `build(params): string`')
  return { inputs, build }
}

export type Field = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum'
  required: boolean
  default?: unknown
  options?: string[]
  description?: string
}

/** Derive form fields from the composer's Zod `inputs` via JSON Schema (zod v4). */
export function schemaFields(inputs: zod.ZodTypeAny): Field[] {
  const js = zod.z.toJSONSchema(inputs) as {
    properties?: Record<string, { type?: string; enum?: string[]; default?: unknown; description?: string }>
    required?: string[]
  }
  const required = new Set(js.required ?? [])
  return Object.entries(js.properties ?? {}).map(([name, s]) => {
    let type: Field['type'] = 'string'
    if (s.enum) type = 'enum'
    else if (s.type === 'number' || s.type === 'integer') type = 'number'
    else if (s.type === 'boolean') type = 'boolean'
    return { name, type, required: required.has(name), default: s.default, options: s.enum, description: s.description }
  })
}

/** Coerce raw form values to the field types before calling build/validate. */
export function coerceValues(fields: Field[], raw: Record<string, string | boolean>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = raw[f.name]
    if (v === undefined || v === '') {
      if (f.default !== undefined) out[f.name] = f.default
      continue
    }
    if (f.type === 'number') out[f.name] = Number(v)
    else if (f.type === 'boolean') out[f.name] = v === true || v === 'true'
    else out[f.name] = v
  }
  return out
}
