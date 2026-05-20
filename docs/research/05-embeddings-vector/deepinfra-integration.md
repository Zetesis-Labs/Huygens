# DeepInfra integration — cómo llamamos a BGE-M3 en runtime

> Documento operativo. Cómo nos conectamos a DeepInfra para producir embeddings con BGE-M3, qué endpoints exponemos, cómo se configura en el devcontainer y qué alternativas tenemos si DeepInfra deja de servir.

## Por qué DeepInfra

- **Hostea BGE-M3 directamente** — el modelo está disponible bajo `BAAI/bge-m3` sin trámites adicionales. No hay que self-hostear ni gestionar GPUs
- **API HTTP simple**: dos endpoints disponibles (uno OpenAI-compatible, uno nativo). Cualquier cliente HTTP funciona
- **Pricing irrelevante para uso personal**: ~$0.01 por 1M tokens. Un año de capturas de Rubén cuesta céntimos (ver cálculo abajo)
- **El usuario ya lo conoce**: usado en ZetesisPortal como proveedor del reranker. Cuenta + API key ya existentes
- **Sin lock-in real**: el modelo es MIT, el formato del payload es estándar. Migrar a TEI self-hosted, Ollama o a un FastAPI propio es cuestión de cambiar la URL base

## Endpoints disponibles

DeepInfra expone dos rutas equivalentes para el mismo modelo. Usamos el **OpenAI-compatible** por compatibilidad con SDKs futuros.

### Endpoint OpenAI-compatible (recomendado)

```
POST https://api.deepinfra.com/v1/openai/embeddings
Authorization: Bearer ${DEEPINFRA_API_KEY}
Content-Type: application/json

{
  "model": "BAAI/bge-m3",
  "input": "texto a embedder"     // string o array<string>
}
```

Response shape:

```json
{
  "data": [
    { "embedding": [0.123, -0.456, ...], "index": 0 }
  ],
  "model": "BAAI/bge-m3",
  "usage": { "prompt_tokens": 7, "total_tokens": 7 }
}
```

Ventajas:
- Soportado por `openai` SDK simplemente cambiando `baseURL`. Si en algún momento el código pasa por una capa de cliente OpenAI, sigue funcionando
- Misma forma que la API oficial de OpenAI → menos sorpresas mentales

### Endpoint nativo

```
POST https://api.deepinfra.com/v1/inference/BAAI/bge-m3
```

Acepta los mismos campos pero con una shape de response ligeramente distinta. **No lo usamos** salvo necesidad puntual (e.g., para acceder a sparse embeddings cuando estén disponibles).

## Configuración en el devcontainer

La API key vive en el entorno del host del usuario (`~/.zshrc` o equivalente). La forwardeamos al contenedor sin persistirla en el repo.

### 1. Forward de la API key

```jsonc
// .devcontainer/devcontainer.json
{
  "containerEnv": {
    "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}",
    "DEEPINFRA_API_KEY": "${localEnv:DEEPINFRA_API_KEY}"
  }
}
```

`${localEnv:NAME}` resuelve contra el entorno del proceso que arranca el devcontainer. Si no existe en el host, el contenedor recibe la variable vacía y los embeddings fallan con 401 — comportamiento deseable (failure ruidosa y temprana).

### 2. Verificación

```bash
docker exec huygens_devcontainer-app-1 env | grep DEEPINFRA_API_KEY
```

Debe imprimir la key. Si imprime vacío, revisar el shell del host.

## Cliente TypeScript

El Huygens MCP necesita dos funciones públicas: `embed(text)` para un único string, `embedBatch(texts)` para chunking masivo.

### Función `embed`

```ts
const EMBEDDING_MODEL = 'BAAI/bge-m3'
const EMBEDDING_DIMS = 1024

export async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPINFRA_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text })
  })
  if (!res.ok) {
    throw new Error(`embed: ${res.status} ${await res.text()}`)
  }
  const { data } = await res.json() as { data: { embedding: number[] }[] }
  return data[0].embedding
}
```

Notas de implementación:

- **Sin SDK** — `fetch` nativo de Bun es suficiente. Añadir el SDK de OpenAI para una sola request es over-engineering
- **Lanza en error** — no devolvemos `null` ni embeddings vacíos. Si DeepInfra falla, la operación entera falla. El caller decide si reintentar
- **El modelo se hardcodea en una constante exportable** — facilita re-embed total cuando se decida migrar

### Función `embedBatch`

DeepInfra acepta `input` como array de strings, devolviendo un embedding por entrada. Es **mucho** más eficiente que llamar N veces:

```ts
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPINFRA_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts })
  })
  if (!res.ok) {
    throw new Error(`embedBatch: ${res.status} ${await res.text()}`)
  }
  const { data } = await res.json() as { data: { embedding: number[], index: number }[] }
  return data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding)
}
```

Notas:

- **El sort por `index` es defensivo** — la API devuelve los embeddings en orden, pero confiar en eso sin verificar es un footgun. Una corrupción silenciosa de la correspondencia chunk→embedding es de los bugs peores de detectar
- **Batch size razonable: 32-64 strings por request**. DeepInfra no documenta un cap fijo, pero requests gigantes (1000+ chunks) suben latencia y riesgo de timeout
- **El caller chunkea**: si tienes 500 chunks que indexar, llama a `embedBatch` en lotes de 32, no en uno solo

## Rate limiting y retries

DeepInfra tiene rate limits generosos para uso personal, pero para batch jobs (reindexado masivo tras cambio de modelo, importación inicial) conviene blindar:

- **Retry con backoff exponencial** en 429 y 5xx. Implementación mínima: 3 reintentos, `delay = 500ms * 2^attempt`
- **Control de concurrencia**: `p-queue` o equivalente, con `concurrency: 4-8` para reembedding masivo. Más no aporta y aumenta el riesgo de throttling
- **Circuit breaker** no es necesario para uso personal. Sería útil si esto fuese multi-tenant productivo

```ts
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)))
      }
    }
  }
  throw lastError
}
```

## Alternativas a DeepInfra

Si DeepInfra desaparece, sube precios o degrada calidad, hay tres caminos de migración. Todos preservan el modelo (BGE-M3) — solo cambia el "dónde se ejecuta".

### HuggingFace Text Embeddings Inference (TEI) — self-hosted

Container oficial maintenido por HuggingFace:

```yaml
# docker-compose.yml
embeddings:
  image: ghcr.io/huggingface/text-embeddings-inference:cpu-latest
  command: --model-id BAAI/bge-m3
  ports:
    - "8080:80"
```

Para GPU: `cuda-latest` y un `deploy.resources.reservations.devices` configurado.

**Pro**: cero dependencia externa, latencia local, control total
**Contra**: el modelo (2.3 GB) vive en el contenedor; CPU es lento (decenas de docs/s vs cientos en GPU)

API expuesta: la misma shape OpenAI-compatible si se arranca con `--otlp-endpoint` y flags adecuadas. Cambio en el código: solo la URL base.

### Ollama

Versiones recientes de Ollama soportan BGE-M3:

```bash
ollama pull bge-m3
```

API:
```
POST http://localhost:11434/api/embeddings
{ "model": "bge-m3", "prompt": "texto" }
```

**Pro**: ridículamente simple si ya corres Ollama para LLM local
**Contra**: peor throughput que TEI, no es production-grade, single-threaded por defecto

### Servicio Python propio (FastAPI + sentence-transformers)

El path más customizable y el más mantenimiento. Útil si necesitas:
- Procesar dense + sparse + ColBERT simultáneamente
- Caching propio por texto
- Métricas custom

No la usamos hoy. Es la opción si BGE-M3 deja de ser suficiente y queremos pipelines híbridos serios.

## Decisión actual

**DeepInfra**. Razones:

1. Tiempo-cero de setup
2. Coste personal irrelevante
3. Si duele en el futuro, migración a TEI/Ollama es localized a una función (`embed`/`embedBatch`)

No hay decisión que tomar todavía sobre auto-hosting. Esperar señales reales (rate limits, coste mensurable, latencia que duela).

## Coste estimado para uso personal

Cálculo grueso, peor caso:

| Métrica | Valor |
|---|---|
| Tokens promedio por nota | 500 |
| Notas por año (estimación generosa) | 5,000 |
| Tokens/año solo por nota completa | 2.5M |
| Multiplicador por chunking (~3x) | × 3 |
| Tokens/año total embedded | **7.5M** |
| Pricing DeepInfra | $0.01 / 1M tokens |
| **Coste anual estimado** | **$0.075** |

Si Rubén dispara su volumen 10x (50K notas/año), el coste sigue siendo **$0.75/año**. Incluso reembedding completo cada 6 meses (cambio de modelo) duplica el coste a $1.50/año.

**Conclusión**: el coste de embeddings es ruido de fondo. No es un factor de decisión.

## Cross-references

- [`./bge-m3.md`](./bge-m3.md) — qué es exactamente el modelo
- [`./vector-search-strategy.md`](./vector-search-strategy.md) — cómo se usa el embedding una vez generado
- [`../02-architecture/mcp-three-layer-architecture.md`](../02-architecture/mcp-three-layer-architecture.md) — el Huygens MCP es la capa que expone `embed` como tool
