/**
 * JSON-safe replacer for SurrealQL result values.
 *
 * The SurrealDB SDK's value classes (RecordId, DateTime, Duration, Decimal,
 * Uuid, Geometry…) all extend `Value` and implement `toJSON()` — so
 * `JSON.stringify` handles them automatically. The one type that needs help
 * is `bigint`, which JSON.stringify throws on. We coerce it to a string to
 * preserve precision (numbers above 2^53 would otherwise round-trip wrong).
 */
export function surrealJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  return value
}

export function stringifySurrealResult(value: unknown, space: number | string = 2): string {
  return JSON.stringify(value, surrealJsonReplacer, space)
}
