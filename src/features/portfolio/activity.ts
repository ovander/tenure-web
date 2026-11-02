// changedFields lists the top-level fields an audit event changed, ignoring
// the bookkeeping ones (version, timestamps).
const ignored = new Set(['version', 'created_at', 'updated_at', 'created_by', 'updated_by'])

export function changedFields(before: unknown, after: unknown): string[] {
  const b = (before ?? {}) as Record<string, unknown>
  const a = (after ?? {}) as Record<string, unknown>
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => !ignored.has(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .sort()
}
