// Elimina secretos antes de guardar logs, trazas o reportes (el historial no debe guardar credenciales).
const RULES = [
  [/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTADO]'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTADO:api-key]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTADO:aws-key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTADO:github-token]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTADO:jwt]'],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, '$1$2:[REDACTADO]@'],
  [
    /\b(password|passwd|pwd|secret|token|api[_-]?key|authorization)(\s*["']?\s*[:=]\s*["']?)([^\s"',;&]+)/gi,
    '$1$2[REDACTADO]',
  ],
];

export function redact(text) {
  if (typeof text !== 'string') return text;
  return RULES.reduce((acc, [re, repl]) => acc.replace(re, repl), text);
}

export function redactDeep(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)]));
  }
  return value;
}
