import Editor from '@monaco-editor/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type Composer as ComposerFns,
  coerceValues,
  DEFAULT_SCRIPT,
  type Field,
  loadComposer,
  schemaFields
} from '../lib/composer'
import type { SavedQuery } from '../lib/queries'

type Props = { saved: SavedQuery[] }

// Minimal ambient so the editor doesn't flag `import { z } from 'zod'`.
const ZOD_AMBIENT = `declare module 'zod' {
  export const z: any
  export namespace z { type infer<T> = any }
}`

export default function Composer({ saved }: Props) {
  const [script, setScript] = useState(DEFAULT_SCRIPT)
  const [fields, setFields] = useState<Field[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [sql, setSql] = useState('')
  const [buildError, setBuildError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [list, setList] = useState<SavedQuery[]>(saved)
  const composer = useRef<ComposerFns | null>(null)

  // Parse the script (debounced) → fields + build fn.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const c = loadComposer(script)
        composer.current = c
        const f = schemaFields(c.inputs)
        setFields(f)
        setParseError(null)
        // seed defaults for any new fields
        setValues(prev => {
          const next = { ...prev }
          for (const fd of f)
            if (!(fd.name in next) && fd.default !== undefined) next[fd.name] = fd.default as string | boolean
          return next
        })
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e))
      }
    }, 350)
    return () => clearTimeout(t)
  }, [script])

  const generate = () => {
    setBuildError(null)
    try {
      const c = composer.current ?? loadComposer(script)
      const params = coerceValues(fields, values)
      const parsed = c.inputs.safeParse(params)
      if (!parsed.success) throw new Error(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
      setSql(c.build(parsed.data as Record<string, unknown>))
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e))
      setSql('')
    }
  }

  const run = () => {
    if (sql) window.location.href = `/explorer?q=${encodeURIComponent(sql)}`
  }

  const save = async () => {
    if (!name.trim()) {
      setSaveMsg('pon un nombre')
      return
    }
    setSaveMsg('guardando…')
    try {
      const res = await fetch('/api/save-script', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), script, pinned: false })
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSaveMsg(`guardado → ${data.id}`)
      setList(prev => [
        { id: data.id as string, name: name.trim(), query: null, script, pinned: false, updated_at: null },
        ...prev.filter(s => s.id !== data.id)
      ])
    } catch (e) {
      setSaveMsg(`error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const onMount = useMemo(
    () =>
      (
        _editor: unknown,
        monaco: { languages: { typescript: { typescriptDefaults: { addExtraLib: (c: string, p: string) => void } } } }
      ) => {
        monaco.languages.typescript.typescriptDefaults.addExtraLib(ZOD_AMBIENT, 'file:///zod-ambient.d.ts')
      },
    []
  )

  return (
    <div className="composer">
      <aside className="cside">
        <h2>Composers</h2>
        {list.length === 0 ? (
          <p className="muted">Ninguno.</p>
        ) : (
          <ul>
            {list.map(s => (
              <li key={s.id}>
                <button type="button" className="linkish" title={s.id} onClick={() => s.script && setScript(s.script)}>
                  {s.pinned ? '★ ' : ''}
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="savebox">
          <input type="text" placeholder="Nombre…" value={name} onChange={e => setName(e.target.value)} />
          <button type="button" onClick={save}>
            Guardar script
          </button>
          {saveMsg && <span className="muted">{saveMsg}</span>}
        </div>
      </aside>

      <div className="cmain">
        <div className="editor">
          <Editor
            height="100%"
            defaultLanguage="typescript"
            theme="vs-dark"
            value={script}
            onChange={v => setScript(v ?? '')}
            onMount={onMount}
            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, tabSize: 2 }}
          />
        </div>

        <div className="cpanel">
          {parseError ? (
            <pre className="err">⚠ {parseError}</pre>
          ) : (
            <>
              <h3>Parámetros</h3>
              <div className="form">
                {fields.length === 0 && <p className="muted">El script no expone campos.</p>}
                {fields.map(f => (
                  <label key={f.name} htmlFor={f.name} title={f.description}>
                    <span>{f.name}</span>
                    {f.type === 'boolean' ? (
                      <input
                        id={f.name}
                        type="checkbox"
                        checked={Boolean(values[f.name])}
                        onChange={e => setValues(v => ({ ...v, [f.name]: e.target.checked }))}
                      />
                    ) : f.type === 'enum' ? (
                      <select
                        id={f.name}
                        value={String(values[f.name] ?? '')}
                        onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                      >
                        <option value="">—</option>
                        {f.options?.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={f.name}
                        type={f.type === 'number' ? 'number' : 'text'}
                        value={String(values[f.name] ?? '')}
                        placeholder={f.default !== undefined ? String(f.default) : ''}
                        onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="actions">
                <button type="button" onClick={generate}>
                  Generar SQL
                </button>
                <button type="button" className="ghost" disabled={!sql} onClick={run}>
                  Ejecutar en explorer →
                </button>
              </div>
              {buildError && <pre className="err">⚠ {buildError}</pre>}
              {sql && <pre className="sql">{sql}</pre>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
