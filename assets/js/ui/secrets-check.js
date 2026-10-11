/**
 * SuckLess · ui/secrets-check.js — Detección client-side de secretos (§1.2).
 * Aviso humano antes de enviar: NUNCA bloquea ni interpreta; la persona decide.
 * Advertencia permanente visible junto al formulario (form.css .secret-warning).
 */

const SECRET_PATTERNS = [
  { re: /password\s*[:=]/i, hint: 'password=' },
  { re: /api[_-]?key\s*[:=]/i, hint: 'api_key' },
  { re: /\bsecret\s*[:=]/i, hint: 'secret=' },
  { re: /\btoken\s*[:=]/i, hint: 'token=' },
  { re: /Bearer\s+[A-Za-z0-9._\-]{8,}/, hint: 'Bearer …' },
  { re: /sk-[A-Za-z0-9_-]{16,}/, hint: 'clave tipo sk-… (OpenAI)' },
];

/** Devuelve la primera coincidencia de secreto en un texto, o null. */
export function detectSecret(text) {
  if (typeof text !== 'string') return null;
  for (const p of SECRET_PATTERNS) {
    const pos = text.search(p.re);
    if (pos !== -1) {
      const line = text.slice(0, pos).split(/\r\n|\r|\n/).length;
      return { hint: p.hint, line };
    }
  }
  return null;
}

/**
 * Instala la detección en un <textarea>/<input>. Al detectar un patrón:
 * marca el campo con data-secrets="true" y notifica via callback
 * (el consumidor decide si avisa, interrumpe o continua).
 * @param {HTMLInputElement|HTMLTextAreaElement} field
 * @param {(info: {hint: string, line: number} | null) => void} onDetect
 */
export function attachSecretsCheck(field, onDetect) {
  const handler = () => {
    const found = detectSecret(field.value);
    if (found) field.dataset.secrets = 'true';
    else delete field.dataset.secrets;
    try { onDetect(found); } catch { /* callback seguro */ }
  };
  field.addEventListener('input', handler, { passive: true });
  // No consumimos memoria: el listener vive con el campo.
}
