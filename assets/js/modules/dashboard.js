/**
 * SuckLess · assets/js/modules/dashboard.js — Panel principal (Etapa 2).
 *
 * SSR entrega el panel completo SIN JS (criterio de aceptación): este módulo
 * solo refresca las tarjetas con datos del backend vía api.js. Cada tarjeta es
 * independiente: si una falla, muestra su propio error con botón "Reintentar"
 * y las demás siguen funcionando (§ Etapa 2: "una tarjeta caída no tumba el panel").
 *
 * Solo usa textContent y createElement SIEMPRE (§1.2): nunca innerHTML con
 * datos del backend, de IA o de la persona.
 */
import { api, wrap, isEmptyList, ApiError } from '../api.js';
import { toastError } from '../ui/toast.js';

const el = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// Utilidades DOM seguras (solo textContent / createElement)
// ---------------------------------------------------------------------------

function tag(name, className, text) {
  const n = document.createElement(name);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = String(text);
  return n;
}

/** Reemplaza el contenido de un contenedor con nodos creados de forma segura. */
function setChildren(node, children) {
  node.replaceChildren(...children);
}

/** Quita el skeleton de un contenedor, si existe. */
function clearSkeleton(container) {
  container.querySelector('.skeleton')?.remove();
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

/** Pinta un <div data-kpi=...> con los números grandes (§ Etapa 2). */
function renderKpi(container, { value, label, variant = '' }) {
  clearSkeleton(container);
  const card = tag('div', 'kpi' + (variant ? ` kpi--${variant}` : ''));
  card.append(
    tag('span', 'kpi__value', value),
    tag('span', 'kpi__label', label),
    tag('span', 'provenance provenance--mock', 'Dato de ejemplo'), // §1.1: en mock SIEMPRE la etiqueta
  );
  setChildren(container, [card]);
}

/** Estado de error dentro de la propia tarjeta, con reintento. */
function renderCardError(container, title, retry) {
  clearSkeleton(container);
  const box = tag('div', 'kpi summary--error');
  box.setAttribute('role', 'status');
  const label = tag('span', 'summary__error', title);
  const btn = tag('button', 'summary__retry', 'Reintentar');
  btn.type = 'button';
  btn.setAttribute('aria-label', `Reintentar ${title.toLowerCase()}`);
  btn.addEventListener('click', () => {
    box.replaceChildren(tag('div', 'skeleton skeleton--kpi'));
    retry();
  });
  box.append(label, btn);
  setChildren(container, [box]);
}

function renderCardNotice(container, message) {
  clearSkeleton(container);
  const notice = tag('div', 'kpi summary--empty');
  notice.setAttribute('role', 'status');
  notice.textContent = message;
  setChildren(container, [notice]);
}

// ---------------------------------------------------------------------------
// KPI derivados de la fuente: requisitos aprobados, checks OK, checks FALLA y
// hallazgos abiertos por severidad. Con mock se calculan una vez por carga.
// ---------------------------------------------------------------------------

async function refreshKpis() {
  const wrapKpi = el('[data-kpi="requirementsApproved"]');
  const okKpi = el('[data-kpi="checksOk"]');
  const failKpi = el('[data-kpi="checksFail"]');
  const findingsKpi = el('[data-kpi="findingsOpen"]');
  if (!wrapKpi && !okKpi && !failKpi && !findingsKpi) return; // no estamos en dashboard

  const [requirements, run, review] = await Promise.allSettled([
    api('/api/requirements'),
    api('/api/executor/run/latest'),
    api('/api/code/review', { method: 'POST', body: { files: ['demo-store/src/cart.js'] } }),
  ]);

  // 1) Requisitos aprobados — su fuente propia; error no afecta a los demás
  if (wrapKpi) {
    if (requirements.status === 'fulfilled') {
      const list = Array.isArray(requirements.value.data) ? requirements.value.data : [];
      const approved = list.filter((r) => r.status === 'APPROVED').length;
      renderKpi(wrapKpi, { value: approved, label: 'Requisitos aprobados', variant: 'ok' });
    } else {
      renderCardError(wrapKpi, 'No se pudieron cargar los requisitos', refreshKpis);
    }
  }

  // 2) Checks OK y FALLA — del ejecutor (nunca de IA; §1.1)
  const [okBox, failBox] = [okKpi, failKpi];
  if (run.status === 'fulfilled') {
    const { pass, fail } = run.value.data.summary;
    if (okBox) renderKpi(okBox, { value: pass, label: 'Checks OK', variant: 'ok' });
    if (failBox) renderKpi(failBox, { value: fail, label: 'Checks FALLA', variant: 'fail' });
  } else if (run.reason instanceof ApiError && run.reason.code === 'NOT_FOUND') {
    if (okBox) renderCardNotice(okBox, 'Sin corridas todavía.');
    if (failBox) renderCardNotice(failBox, 'Sin corridas todavía.');
  } else {
    if (okBox) renderCardError(okBox, 'El ejecutor no respondió', refreshKpis);
    if (failBox) renderCardError(failBox, 'El ejecutor no respondió', refreshKpis);
  }

  // 3) Hallazgos abiertos (no demostrados) — del review
  if (findingsKpi) {
    if (review.status === 'fulfilled') {
      const findings = review.value.data.findings ?? [];
      renderKpi(findingsKpi, { value: findings.length, label: 'Hallazgos abiertos', variant: 'warn' });
    } else {
      renderCardError(findingsKpi, 'Review no disponible', refreshKpis);
    }
  }
}

// ---------------------------------------------------------------------------
// Tabla de resumen: último requisito, última corrida, últimos 5 del historial
// ---------------------------------------------------------------------------

function renderRequirementSummary(container, data) {
  clearSkeleton(container);
  const requirement = Array.isArray(data) ? data[0] : data;
  if (!requirement || isEmptyList(data)) {
    setChildren(container, [tag('p', 'summary__label', 'Último requisito'), tag('p', 'card__meta', 'Aún no hay requisitos. Empieza en Requirements Gate.')]);
    return;
  }
  const box = tag('div');
  box.append(tag('p', 'summary__label', 'Último requisito'));
  const meta = tag('div', 'summary__meta');
  meta.append(tag('span', 'badge badge--' + (requirement.status === 'APPROVED' ? 'ok' : requirement.status === 'READY_FOR_REVIEW' ? 'info' : 'warn'), requirement.status));
  box.append(meta, tag('p', 'card__meta', requirement.document?.objective ?? requirement.objective ?? requirement.title ?? 'Sin objetivo todavía.'));
  setChildren(container, [box]);
}

function renderRunSummary(container, data) {
  clearSkeleton(container);
  if (!data) {
    setChildren(container, [tag('p', 'summary__label', 'Última ejecución'), tag('p', 'card__meta', 'Sin corridas todavía.')]);
    return;
  }
  const box = tag('div');
  const clsBadge = data.status === 'PASS' ? 'ok' : data.status === 'FAIL' ? 'fail' : 'idle';
  const badge = tag('span', `badge badge--${clsBadge}`, data.status === 'EXECUTOR_ERROR' ? '⚠ ERROR DEL EJECUTOR' : data.status);
  const meta = tag('p', 'summary__label', 'Última ejecución');
  const bMeta = tag('div', 'summary__meta');
  bMeta.append(badge, tag('span', 'mono-label', `${data.summary.pass} OK · ${data.summary.fail} FALLA · ${data.summary.error} ERROR`));
  if (data.durationMs) bMeta.append(tag('span', 'mono-label', `${data.durationMs} ms`));
  box.append(meta, bMeta);
  setChildren(container, [box]);
}

function renderHistorySummary(container, data) {
  clearSkeleton(container);
  const box = tag('div');
  box.append(tag('p', 'summary__label', 'Historial reciente'));
  if (!Array.isArray(data) || isEmptyList(data)) {
    box.append(tag('p', 'card__meta', 'Aún no hay análisis. Ejecuta uno desde Two Doors.'));
    setChildren(container, [box]);
    return;
  }
  const list = tag('ul', 'summary__list');
  for (const item of data.slice(0, 5)) { // últimos 5
    const li = document.createElement('li');
    const statusCls = item.status === 'FAIL' ? 'fail' : item.status === 'PASS' || item.status === 'APPROVED' ? 'ok' : 'info';
    const st = tag('span', `badge badge--${statusCls}`, item.status);
    const title = tag('span', null, item.title.slice(0, 42));
    const date = tag('span', 'item-date', item.createdAt?.slice(0, 10) ?? '');
    li.append(st, title, date);
    list.appendChild(li);
  }
  box.append(list, Object.assign(document.createElement('a'), {
    className: 'btn btn--ghost btn--sm',
    textContent: 'Ver todo →',
    href: '/views/history-index.bxm',
  }));
  setChildren(container, [box]);
}

async function refreshSummaries() {
  const reqBox = el('[data-summary="requirement"]');
  const runBox = el('[data-summary="run"]');
  const histBox = el('[data-summary="history"]');
  if (!reqBox && !runBox && !histBox) return;

  const [req, run, hist] = await Promise.allSettled([
    api('/api/requirements/analyze', { method: 'POST', body: { text: 'El carrito debe aplicar descuentos' } }),
    api('/api/executor/run/latest'),
    api('/api/history'),
  ]);

  if (reqBox) {
    if (req.status === 'fulfilled') renderRequirementSummary(reqBox, req.value.data);
    else renderCardError(reqBox, 'El requisito no está disponible', refreshSummaries);
  }
  if (runBox) {
    if (run.status === 'fulfilled') renderRunSummary(runBox, run.value.data);
    else if (run.reason instanceof ApiError && run.reason.code === 'NOT_FOUND') renderRunSummary(runBox, null);
    else renderCardError(runBox, 'La ejecución no respondió', refreshSummaries);
  }
  if (histBox) {
    if (hist.status === 'fulfilled') renderHistorySummary(histBox, hist.value.data);
    else renderCardError(histBox, 'Historial no disponible', refreshSummaries);
  }

  // marca de frescura legible (campo técnico, mono)
  const stamp = el('#dash-loaded-at');
  if (stamp) stamp.textContent = `Actualizado ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

/** Arranque seguro: cualquier fallo global solo avisa por toast, oculta skeletons. */
export async function boot() {
  if (!el('[data-kpi]') && !el('[data-summary]')) return; // no es dashboard
  await Promise.allSettled([refreshKpis(), refreshSummaries()]);
}
