/**
 * SuckLess · ui/lightbox.js — Visor de capturas accesible (§1.4).
 * <dialog> a pantalla completa: foco dentro, Esc cierra (nativo),
 * flechas ←/→ navegan entre capturas y muestra índice; retorno de foco
 * a la miniatura que lo abrió.
 */
export function initLightbox(items = []) {
  const dialog = document.createElement('dialog');
  dialog.className = 'exec-lightbox';
  dialog.setAttribute('aria-label', 'Vista de captura de pantalla');
  const body = document.createElement('div');
  body.className = 'exec-lightbox__body';
  const img = document.createElement('img');
  const bar = document.createElement('div');
  bar.className = 'exec-lightbar';
  body.append(img, bar);
  dialog.appendChild(body);
  document.body.appendChild(dialog);

  let idx = 0;
  let opener = null;
  /** @type {{url: string, checkName: string}[]} */ let _items = items;

  function render() {
    const it = _items[idx];
    if (!it) return;
    img.src = it.url;
    img.alt = `Captura de ${it.checkName ?? 'pantalla'}`;
    bar.replaceChildren(
      Object.assign(document.createElement('span'), { textContent: `${it.checkName ?? 'Captura'} · ${idx + 1}/${items.length}` }),
      Object.assign(document.createElement('span'), { textContent: '←/→ navegar · Esc cerrar' }),
    );
  }

  function open(i, invoker) {
    idx = i;
    opener = invoker;
    render();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    img.focus?.();
  }

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { idx = (idx + 1) % _items.length; e.preventDefault(); render(); }
    if (e.key === 'ArrowLeft') { idx = (idx - 1 + _items.length) % _items.length; e.preventDefault(); render(); }
  });
  dialog.addEventListener('close', () => {
    // retorno de foco a la miniatura que lo abrió
    if (opener && typeof opener.focus === 'function') opener.focus();
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  /** Sustituye el set de capturas (llamado por el Executor con cada snapshot). */
  function setItems(newItems) { _items = newItems ?? []; idx = Math.min(idx, Math.max(_items.length - 1, 0)); }

  return { open, setItems, dialog };
}
