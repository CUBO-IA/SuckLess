/**
 * SuckLess · assets/js/modules/history.js — Report History & Export (Etapa 7).
 *
 * Reglas del plan:
 *  - Filtrar (chips multi-selección), buscar, ordenar y paginar SIN recarga.
 *  - Filtros sincronizados con la URL (?type=REVIEW&q=…) via history.replaceState.
 *  - Abrir: detalle en MODAL (suckless-modal + ui/modal.js accesible).
 *  - Exportar: GET /api/history/{id}/export (Markdown crudo) con indicador de
 *    PROGRESO; dispara descarga vía Blob (sin parsear JSON ni usar innerHTML).
 *  - Borrar: DELETE con modal de CONFIRMACIÓN MANDATORIA (§ Etapa 7); la vista
 *    se actualiza SIN recarga, foco accesible post-borrado, sin toast de
 *    "Deshacer" (el contrato no soporta undo §0.2).
 *  - Estados: vacío ("Aún no hay análisis"), sin resultados de filtro,
 *    cargando (skeleton) y error (mensaje + reintento).
 *  - Seguridad §1.2: SOLO textContent/createElement; NUNCA innerHTML con
 *    datos del backend (título, reporte Markdown,Evidence…).
 */
import { api, ApiError } from '../api.js';
import { openModal } from '../ui/modal.js';
import { toastOk, toastError } from '../ui/toast.js';

const el = (sel) => document.querySelector(sel);

function tag(name, className, text) {
  const n = document.createElement(name);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = String(text);
  return n;
}
function setChildren(node, children) { node.replaceChildren(...children); }

// ---------------------------------------------------------------------------
// Constantes de presentación (badge siempre ícono + texto + color §3.4)
// ---------------------------------------------------------------------------

const TYPE_LABEL = { requirements: 'REQUIREMENTS', debug: 'DEBUG', verify: 'VERIFY', explain: 'EXPLAIN', review: 'REVIEW' };
const TYPE_BADGE = { requirements: 'badge--info', debug: 'badge--warn', verify: 'badge--fail', explain: 'badge--idle', review: 'badge--brand' };

/**
 * Mapa visual de ESTADO del ítem de historial (§3.4).
 * La fuente es `status` del backend; la UI no lo interpreta (§1.1) — el color
 * solo distingue familia semántica (PASS/OK/APROBADO verde; FAIL/ERROR rojo;
 * pendientes ámbar; informativos cian/gris).
 */
const STATUS_BADGES = {
  // executor
  PASS:                 { cls: 'badge--ok',     icon: '✓', label: 'PASS' },
  FAIL:                 { cls: 'badge--fail',   icon: '✗', label: 'FAIL' },
  EXECUTOR_ERROR:       { cls: 'badge--fail',   icon: '⚠', label: 'ERROR DEL EJECUTOR' },
  // requirements
  APPROVED:             { cls: 'badge--ok',     icon: '✓', label: 'APROBADO' },
  READY_FOR_REVIEW:     { cls: 'badge--info',   icon: '◎', label: 'LISTO PARA REVISAR' },
  INCOMPLETE:           { cls: 'badge--warn',   icon: '◌', label: 'INCOMPLETO' },
  // debug
  HYPOTHESIS:           { cls: 'badge--warn',   icon: '◌', label: 'HIPÓTESIS · PENDIENTE DE PROBAR' },
  REPRODUCED:           { cls: 'badge--info',   icon: '◈', label: 'REPRODUCIDO' },
  CORRECTION_VERIFIED:  { cls: 'badge--ok',     icon: '✓', label: 'CORRECCIÓN VERIFICADA' },
  // review
  FINDINGS:             { cls: 'badge--warn',   icon: '⚠', label: 'HALLAZGOS' },
  // explain
  OK:                   { cls: 'badge--ok',     icon: '✓', label: 'OK' },
};
function statusBadge(status) {
  const m = STATUS_BADGES[status] ?? { cls: 'badge--idle', icon: '◔', label: status ?? '—' };
  const b = tag('span', `badge ${m.cls}`);
  b.append(tag('span', 'badge__icon', m.icon), document.createTextNode(m.label));
  return b;
}

function typeBadge(type) {
  const label = TYPE_LABEL[type] ?? String(type).toUpperCase();
  const b = tag('span', `badge badge--idle hist-type-badge ${TYPE_BADGE[type] ?? ''}`);
  b.textContent = label;
  return b;
}

// ---------------------------------------------------------------------------
// Estado local del módulo
// ---------------------------------------------------------------------------

let allItems = [];         // lista completa del endpoint GET /api/history
let detailCache = new Map(); // id -> detail (GET /api/history/{id})
let pendingDeleteId = null;
let prevFocus = null;      // foco a devolver tras borrar (§1.4)

const PAGE_SIZE = 10;
let page = 1;

// ---------------------------------------------------------------------------
// Filtros (lectura única de la UI; sincronizados con la URL)
// ---------------------------------------------------------------------------

const selectedTypes = () => [...document.querySelectorAll('#hist-filter input[name="type"]:checked')].map((c) => c.value);
const queryText = () => el('#hist-q')?.value.trim().toLowerCase() ?? '';

/** Invalida la caché de detalle si cambiaron los filtros (el backend aplicaría) */
function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('type');
  for (const t of selectedTypes()) url.searchParams.append('type', String(t).toUpperCase());
  const q = el('#hist-q')?.value.trim() ?? '';
  if (q) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url);
}

/** Restaura filtros desde la URL (?type=REVIEW&id=…). Idempotente. */
function restoreFromUrl() {
  const url = new URL(location.href);
  const types = url.searchParams.getAll('type').map((s) => s.toLowerCase());
  for (const c of document.querySelectorAll('#hist-filter input[name="type"]')) {
    c.checked = types.length === 0 || types.includes(c.value);
  }
  if (types.length > 0) {
    for (const c of document.querySelectorAll('#hist-filter input[name="type"]')) {
      c.checked = types.includes(c.value);
    }
  }
  const q = url.searchParams.get('q');
  if (q && el('#hist-q')) el('#hist-q').value = q;
}

// ---------------------------------------------------------------------------
// Carga inicial
// ---------------------------------------------------------------------------

async function loadHistory() {
  const tbody = el('#hist-rows');
  const errorBox = el('#hist-error');
  const emptyBox = el('#hist-empty');
  try {
    setChildren(tbody, [skeletonRow(5)]);
    errorBox.hidden = true;
    const { data } = await api('/api/history');
    allItems = Array.isArray(data) ? [...data].sort(sortByDateDesc) : [];
    if (allItems.length === 0) {
      showEmptyBox(true, 'Aún no hay análisis', 'Los análisis de Two Doors, Executor y Code Review aparecerán aquí automáticamente.');
      el('#hist-count').textContent = '';
      el('#hist-page-label').textContent = '';
    } else {
      page = 1;
      render();
    }
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : (e?.message ?? 'Error inesperado');
    showEmptyBox(false); // oculta el empty: "sin datos" ≠ "falló"
    errorBox.hidden = false;
    el('#hist-error-msg').textContent = msg;
    toastError(msg);
  }
}

function showEmptyBox(show, title, hint) {
  const box = el('#hist-empty');
  box.hidden = !show;
  if (show) {
    if (title) el('#hist-empty-title').textContent = title;
    if (hint) box.querySelector('.empty-state__hint').textContent = hint;
    const rows = el('#hist-rows');
    if (rows) setChildren(rows, []);
  }
}

function sortByDateDesc(a, b) {
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function skeletonRow(nCols) {
  const tr = document.createElement('tr');
  for (let i = 0; i < nCols; i++) {
    const td = document.createElement('td');
    td.append(tag('div', 'skeleton skeleton--kpi'));
    tr.append(td);
  }
  return tr;
}

// ---------------------------------------------------------------------------
// Render de la tabla (filas con textContent; sección §3.4 tabla)
// ---------------------------------------------------------------------------

function currentFiltered() {
  const types = selectedTypes();
  const q = queryText();
  let rows = allItems;
  if (types.length > 0 && types.length < 5)  rows = [...rows].filter((r) => types.includes(r.type));
  if (q) {
    rows = [...rows].filter((r) =>
      (r.title ?? '').toLowerCase().includes(q) ||
      (r.status ?? '').toLowerCase().includes(q) ||
      (r.type ?? '').toLowerCase().includes(q));
  }
  const dir = el('#hist-order')?.value ?? 'desc';
  // copia: nunca mutamos allItems (rows puede ser el propio array base)
  return [...rows].sort((a, b) => dir === 'asc' ? sortByDateAsc(a, b) : sortByDateDesc(a, b));
}
function sortByDateAsc(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); }
function render() {
  const tbody = el('#hist-rows');
  const rows = currentFiltered();
  const total = rows.length;
  const aux = el('#hist-count');

  // estado vacío del backend ≠ sin resultados del filtro (se distinguen)
  if (allItems.length === 0) {
    el('#hist-empty').hidden = false;
    el('#hist-empty-title').textContent = 'Aún no hay análisis';
    el('#hist-empty').querySelector('.empty-state__hint').textContent
      = 'Los análisis de Two Doors, Executor y Code Review aparecerán aquí automáticamente.';
    setChildren(tbody, []);
    aux.textContent = '';
    el('#hist-page-label').textContent = '';
    return;
  }
  el('#hist-empty').hidden = true;
  el('#hist-error').hidden = true;
  if (total === 0) {
    el('#hist-empty').hidden = false;
    el('#hist-empty-title').textContent = 'Sin resultados';
    el('#hist-empty').querySelector('.empty-state__hint').textContent
      = 'Ningún análisis coincide con el filtro o la búsqueda. Prueba a quitar algún filtro.';
    setChildren(tbody, []);
    aux.textContent = '0 resultados con los filtros actuales.';
    el('#hist-page-label').textContent = '';
    return;
  }

  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > maxPage) page = maxPage;
  const start = (page - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);

  const trs = slice.map((item) => {
    const tr = document.createElement('tr');
    tr.dataset.id = item.id;

    // Tipo
    const tdType = document.createElement('td');
    tdType.dataset.label = 'Tipo';
    tdType.append(typeBadge(item.type));
    tr.append(tdType);

    // Título
    const tdTitle = document.createElement('td');
    tdTitle.dataset.label = 'Título';
    const open = tag('button', 'hist-open', item.title || '(sin título)');
    open.type = 'button';
    open.setAttribute('aria-label', `Abrir detalle de: ${item.title || 'análisis'}`);
    open.addEventListener('click', () => openDetail(item.id, open));
    tdTitle.append(open);
    tr.append(tdTitle);

    // Estado
    const tdStatus = document.createElement('td');
    tdStatus.dataset.label = 'Estado';
    tdStatus.append(statusBadge(item.status));
    tr.append(tdStatus);

    // Fecha (mono §3.3)
    const tdDate = document.createElement('td');
    tdDate.dataset.label = 'Fecha';
    tdDate.className = 'num';
    tdDate.append(tag('span', 'mono-label', formatDate(item.createdAt)));
    tr.append(tdDate);

    // Acciones: Exportar + Borrar (objetivo táctil amenities ≥44px vía CSS)
    const tdActions = document.createElement('td');
    tdActions.dataset.label = 'Acciones';
    const exportBtn = tag('button', 'btn btn--ghost btn--sm hist-row-export');
    exportBtn.type = 'button';
    exportBtn.textContent = 'Exportar';
    exportBtn.setAttribute('aria-label', `Exportar Markdown de ${item.title || item.id}`);
    exportBtn.addEventListener('click', () => exportReport(item.id, exportBtn));
    const delBtn = tag('button', 'btn btn--ghost btn--sm hist-row-delete');
    delBtn.type = 'button';
    delBtn.textContent = 'Borrar';
    delBtn.setAttribute('aria-label', `Borrar ${item.title || item.id}`);
    delBtn.addEventListener('click', () => openDeleteModal(item, delBtn));
    tdActions.append(exportBtn, delBtn);
    tr.append(tdActions);

    return tr;
  });
  setChildren(tbody, trs);

  aux.textContent = `${total} análisis · mostrando ${start + 1}–${Math.min(start + PAGE_SIZE, total)}`;
  renderPager(total, start);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // fecha + hora en mono (formato técnico legible, zona local)
  return d.toLocaleString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Paginación simple
// ---------------------------------------------------------------------------

function renderPager(total, start) {
  const prev = el('#hist-prev');
  const next = el('#hist-next');
  const label = el('#hist-page-label');
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  prev.hidden = page <= 1;
  next.hidden = page >= maxPage;
  label.textContent = `Página ${page} de ${maxPage}`;
}

// ---------------------------------------------------------------------------
// Estados vacío / error
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Detalle en modal (§ Etapa 7: panel del registro + hallazgos + evidencia)
// ---------------------------------------------------------------------------

async function openDetail(id, invoker) {
  const dialog = el('#hist-detail-modal');
  openModal(dialog, { invoker });
  const body = el('#hist-detail-body');
  const meta = el('#hist-detail-meta');
  meta.textContent = 'Cargando detalle…';
  setChildren(body, []);

  try {
    let detail = detailCache.get(id);
    if (!detail) {
      const { data } = await api(`/api/history/${encodeURIComponent(id)}`);
      detail = data;
      detailCache.set(id, detail);
    }
    meta.textContent = `${detail.type?.toUpperCase() ?? ''} · ${statusText(detail)} · ${formatDate(detail.createdAt)}`;
    el('#hist-detail-title').textContent = detail.title || 'Detalle del análisis';

    // El backend entrega `report` en Markdown como texto plano (contenido NO
    // confiable §1.2): se muestra en <pre> con textContent, nunca como HTML.
    const pre = tag('pre', 'hist-report');
    pre.textContent = detail.report ?? '(sin reporte)';
    setChildren(body, [pre]);

    const exp = el('#hist-detail-export');
    exp.hidden = false;
    exp.href = `/api/history/${encodeURIComponent(id)}/export`;
    exp.setAttribute('download', `${id}.md`);
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : 'Error al cargar el detalle';
    setChildren(body, []); // limpiar: solo el error
    const errBox = tag('p', 'modal-text', msg);
    body.append(errBox);
    el('#hist-detail-export').hidden = true;
    toastError(msg);
  }
}

function statusText(d) {
  const m = STATUS_BADGES[d?.status];
  return m ? m.label : (d?.status ?? '—');
}

// ---------------------------------------------------------------------------
// Export con progreso (§ Etapa 7)
// ---------------------------------------------------------------------------

/** Barra de progreso indeterminada → valores simulados mientras dura el fetch */
function setProgress(p) {
  const bar = el('#hist-export-progress');
  bar.setAttribute('aria-valuenow', String(Math.round(p)));
  el('#hist-export-bar').style.width = `${Math.min(100, Math.max(0, p))}%`;
}

async function exportReport(id, invoker) {
  const modal = el('#hist-export-modal');
  const statusLine = el('#hist-export-status');
  el('#hist-export-id').textContent = id;
  setProgress(6);
  statusLine.textContent = 'Preparando descarga…';
  openModal(modal, { invoker });

  try {
    // Simular avance LOCAL del modal (latencia del mock); el backend real
    // devolverá el archivo completo: la barra es indicador de actividad.
    let fake = 6;
    const tick = setInterval(() => {
      fake = Math.min(90, fake + 6 + Math.random() * 12);
      setProgress(fake);
      statusLine.textContent = 'Descargando reporte…';
    }, 220);

    const { text, status } = await api(`/api/history/${encodeURIComponent(id)}/export`);
    clearInterval(tick);
    setProgress(100);

    if (!text) throw new ApiError('EMPTY_RESPONSE', 'El servidor devolvió un reporte vacío.');
    // Disparar descarga con Blob: el contenido Markdown es texto crudo.
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);

    statusLine.textContent = 'Listo ✓ reporte descargado.';
    toastOk(`Reporte exportado: ${id}.md`);
    setTimeout(() => { try { modal.close(); } catch { /* ya cerrado */ } }, 700);
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : 'Error inesperado al exportar';
    setProgress(0);
    statusLine.textContent = msg;
    toastError(msg);
  }
}

// ---------------------------------------------------------------------------
// Borrado: modal de confirmación MANDATORIO + DELETE + re-render sin recarga
// ---------------------------------------------------------------------------

function openDeleteModal(item, invoker) {
  pendingDeleteId = item.id;
  prevFocus = invoker ?? document.activeElement;
  el('#hist-del-id').textContent = `${item.title || item.id} (${item.id})`;
  openModal(el('#hist-delete-modal'), { invoker });
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  const dialog = el('#hist-delete-modal');
  const confirmBtn = el('#hist-del-confirm');
  confirmBtn.disabled = true;

  try {
    // DELETE: el contrato permite { deleted: true } o 404 idempotente
    await api(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
    // Actualización SIN recarga (criterio de aceptación)
    allItems = allItems.filter((r) => r.id !== id);
    detailCache.delete(id);
    try { dialog.close(); } catch { dialog.removeAttribute('open'); }
    // foco accesible tras borrar (§1.4): el botón invocador solía desaparecer
    // con el re-render; si ya no está en el DOM, devolvemos el foco a la tabla
    // (focusable via tabindex="-1" en la vista).
    const focusTarget = prevFocus && document.body.contains(prevFocus) ? prevFocus : el('#hist-table');
    if (focusTarget?.focus) focusTarget.focus();
  if (allItems.length === 0) {
    el('#hist-empty').hidden = false;
    el('#hist-empty-title').textContent = 'Aún no hay análisis';
    el('#hist-empty').querySelector('.empty-state__hint').textContent
      = 'Los análisis de Two Doors, Executor y Code Review aparecerán aquí automáticamente.';
    setChildren(el('#hist-rows'), []);
    el('#hist-count').textContent = '';
    el('#hist-page-label').textContent = '';
  } else {
    render();
  }
  toastOk(`Análisis eliminado: ${id}`);
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : 'Error al borrar';
    toastError(msg); // sin toast de undo: el backend no lo soporta (§ Etapa 7)
  } finally {
    confirmBtn.disabled = false;
    pendingDeleteId = null;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

export function bootHistory() {
  if (!el('#hist-rows')) return; // no es la vista Historial
  restoreFromUrl();

  // Filtros: re-render local (sin recarga)
  // chips + búsqueda (en vivo) + orden: re-render local SIN recarga
  for (const c of document.querySelectorAll('#hist-filter input, #hist-filter select')) {
    const onChange = () => { page = 1; syncUrl(); render(); };
    c.addEventListener('change', onChange);
    if (c.type === 'search') c.addEventListener('input', onChange);
  }

  //Paginación
  el('#hist-prev').addEventListener('click', () => { if (page > 1) page--; render(); });
  el('#hist-next').addEventListener('click', () => { page++; render(); });

  // Borrado: confirmar / cancelar (modal ya conectado en DOM)
  el('#hist-del-confirm').addEventListener('click', confirmDelete);
  el('#hist-del-cancel').addEventListener('click', () => { try { el('#hist-delete-modal').close(); } catch { /* noop */ } });

  // Export modal: cerrar
  el('#hist-export-close').addEventListener('click', () => { try { el('#hist-export-modal').close(); } catch { /* noop */ } });
  el('#hist-detail-close').addEventListener('click', () => { try { el('#hist-detail-modal').close(); } catch { /* noop */ } });

  // Reintentar la carga
  el('#hist-retry').addEventListener('click', loadHistory);

  loadHistory();
}
