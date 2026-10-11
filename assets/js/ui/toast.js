/**
 * SuckLess · ui/toast.js — Notificaciones en vivo (§1.4).
 * Región única aria-live="polite" inyectada al boot; variantes ok/error/info
 * siempre con ícono + color (el color nunca es el único indicador).
 */

let region = null;

function ensureRegion() {
  if (region) return region;
  region = document.createElement('div');
  region.className = 'toast-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  document.body.appendChild(region);
  return region;
}

const ICONS = { ok: '✓', error: '✗', info: 'ⓘ' };

/**
 * @param {'ok'|'error'|'info'} kind
 * @param {string} message — texto plano; NUNCA HTML (contenido no confiable §1.2)
 * @param {{ durationMs?: number }} [opts]
 */
export function toast(kind, message, { durationMs = 4200 } = {}) {
  const container = ensureRegion();
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;

  const icon = document.createElement('span');
  icon.className = 'toast__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = ICONS[kind] ?? 'ⓘ';

  const text = document.createElement('div');
  text.className = 'toast__msg';
  text.textContent = String(message ?? ''); // textContent SIEMPRE

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast__close';
  close.setAttribute('aria-label', 'Cerrar notificación');
  close.textContent = '×';

  const remove = () => el.remove();
  close.addEventListener('click', remove);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') remove(); });

  el.append(icon, text, close);
  if (durationMs > 0) setTimeout(remove, durationMs);

  container.appendChild(el);
  return remove;
}

export const toastOk = (m, o) => toast('ok', m, o);
export const toastError = (m, o) => toast('error', m, o);
export const toastInfo = (m, o) => toast('info', m, o);
