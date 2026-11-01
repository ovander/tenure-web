// cspNonce reads the per-response nonce tenure writes into index.html
// (<meta name="csp-nonce">). Outside tenure (vite dev) the placeholder is left
// as is and no nonce is used.
export function cspNonce(doc: Document = document): string | undefined {
  const v = doc.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content
  return v && v !== '__CSP_NONCE__' && /^[A-Za-z0-9+/=_-]{16,}$/.test(v) ? v : undefined
}
