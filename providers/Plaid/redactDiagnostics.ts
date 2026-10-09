// Exact credential keys, including SDK header and application camelCase forms.
// Do not redact similarly named diagnostic fields such as token expiration/count.
const sensitiveKeys = new Set([
  'accesstoken', 'publictoken', 'linktoken', 'processortoken', 'refreshtoken',
  'usertoken', 'identityverificationtoken', 'clientid', 'secret', 'clientsecret',
  'sandboxsecret', 'productionsecret', 'authorization', 'proxyauthorization',
  'plaidclientid', 'plaidsecret', 'apikey',
])

/** Sanitize JSON-shaped Plaid diagnostics without modifying functional responses. */
export default function redactDiagnostics(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(redactDiagnostics)
    return items.every((item, index) => item === value[index]) ? value : items
  }
  if (value === null || typeof value !== 'object') return value
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return value

  let changed = false
  const entries = Object.entries(value).map(([key, item]) => {
    const sanitized = sensitiveKeys.has(key.replace(/[-_]/g, '').toLowerCase())
      ? '[REDACTED]' : redactDiagnostics(item)
    changed ||= sanitized !== item
    return [key, sanitized]
  })
  return changed ? Object.fromEntries(entries) : value
}
