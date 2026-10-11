/**
 * SuckLess · ui/modal.js — Diálogos accesibles (§1.4).
 * Envuelve <dialog> nativo: focus trap, cierre con Esc (nativo) y
 * retorno del foco al elemento invocador.
 */

/**
 * Abre un <dialog>. Retorna una función close().
 * @param {HTMLDialogElement} dialog
 * @param {{ invoker?: Element|null }} [opts]
 */
export function openModal(dialog, { invoker = null } = {}) {
  if (!dialog || dialog.tagName !== 'DIALOG') {
    throw new TypeError('openModal requiere un elemento <dialog>');
  }
  const prevFocus = invoker ?? document.activeElement;

  const focusFirst = () => {
    // Primer focusable dentro del modal [autofocus] o el primero que exista.
    const target =
      dialog.querySelector('[autofocus]') ||
      firstFocusable(dialog) ||
      dialog;
    target.focus();
  };

  const onKeydown = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = modalFocusables(dialog);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  dialog.addEventListener('keydown', onKeydown);
  const onClose = () => {
    dialog.removeEventListener('keydown', onKeydown);
    if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
  };
  dialog.addEventListener('close', onClose, { once: true });

  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', ''); // fallback sin showModal (SSR sin JS-avanzado)
  focusFirst();

  return () => { try { dialog.close(); } catch { dialog.removeAttribute('open'); } };
}

function modalFocusables(root) {
  const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll(sel)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function firstFocusable(root) {
  return modalFocusables(root)[0] ?? null;
}
