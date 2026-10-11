/**
 * SuckLess · assets/js/modules/executor.js — Test & Evidence Executor (Etapa 5).
 *
 * Reglas del plan:
 *  - Polling con `pollRun()` del api.js (lógica de polling SOLO en la capa de
 *    datos: cambiar a SSE no toca la UI).
 *  - Llamada cada 1–1,5 s mientras QUEUED/RUNNING; máx 2 minutos; botón
 *    cancelar (deja de consultar; NO interrumpe el backend).
 *  - Cada respuesta trae el status global y TODOS los checks acumulados;
 *    el módulo re-renderiza la lista completa (sin estado parcial).
 *  - Los badges global y por check provienen ÚNICAMENTE de run.status y
 *    check.status del ejecutor (§1.1). El frontend no calcula el global.
 *  - `aiInterpretation` va SOLO en el panel "Interpretación de la IA
 *    (no determina el resultado)", jamás junto al badge.
 *  - Solo textContent/createElement; NADA de innerHTML con datos.
 */
import { api, pollRun, ApiError } from '../api.js';
import { initLightbox } from '../ui/lightbox.js';
import { toastError, toastOk, toastInfo } from '../ui/toast.js';

const el = (sel) => document.querySelector(sel);

function tag(name, className, text) {
  const n = document.createElement(name);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = String(text);
  return n;
}
function setChildren(node, children) { node.replaceChildren(...children); }

let stopPoll = null;        // función stop() de pollRun
let lastRun = null;         // último snapshot del ejecutor
let lightbox = null;

// ---------------------------------------------------------------------------
// Despliegue del estado global (echo del ejecutor, nunca calculado)
// ---------------------------------------------------------------------------

const RUN_BADGES = {
  QUEUED:         { cls: 'badge--idle',   icon: '◔', label: 'EN COLA' },
  RUNNING:        { cls: 'badge--running', icon: '◷', label: 'EJECUTANDO' },
  PASS:           { cls: 'badge--ok',     icon: '✓', label: 'PASS' },
  FAIL:           { cls: 'badge--fail',   icon: '✗', label: 'FAIL' },
  EXECUTOR_ERROR: { cls: 'badge--fail',   icon: '⚠', label: 'ERROR DEL EJECUTOR' },
};
const CHECK_BADGES = {
  PASS:           { cls: 'exec-check--pass',   badge: 'badge--ok',       icon: '✓', label: 'OK' },
  FAIL:           { cls: 'exec-check--fail',   badge: 'badge--fail',     icon: '✗', label: 'FALLA' },
  EXECUTOR_ERROR: { cls: 'exec-check--error',  badge: 'badge--fail',     icon: '⚠', label: 'ERROR' },
  RUNNING:        { cls: 'exec-check--running',badge: 'badge--running',  icon: '◷', label: 'EJECUTANDO' },
  QUEUED:         { cls: 'exec-check--queued', badge: 'badge--idle',     icon: '◔', label: 'EN COLA' },
};

function renderRunStatus(data) {
  const meta = RUN_BADGES[data.status] ?? RUN_BADGES.QUEUED;
  const badge = el('#exec-status-badge');
  setChildren(badge, [
    tag('span', 'badge__icon' + (data.status === 'RUNNING' ? ' spin' : ''), meta.icon),
    document.createTextNode(meta.label),
  ]);
  badge.className = `badge ${meta.cls}`;

  const dur = el('#exec-duration');
  if (dur) dur.textContent = data.durationMs ? `${data.durationMs} ms` : '';

  // contadores de summary (mostrados, no recalculados)
  const summary = data.summary ?? { pass: 0, fail: 0, error: 0 };
  if (el('#exec-n-ok')) el('#exec-n-ok').textContent = summary.pass;
  if (el('#exec-n-fail')) el('#exec-n-fail').textContent = summary.fail;
  if (el('#exec-n-err')) el('#exec-n-err').textContent = summary.error;

  // id de corrida
  const idLabel = el('#exec-summary-id');
  if (idLabel && data.id) idLabel.textContent = `Corrida: ${data.id}`;
}

// ---------------------------------------------------------------------------
// Lista de checks: re-render COMPLETO con cada snapshot (acumulados)
// ---------------------------------------------------------------------------

function renderChecks(data) {
  const list = el('#exec-checks');
  if (!list) return;
  const onlyFails = el('#exec-only-fails')?.checked ?? false;
  list.classList.toggle('only-fails', onlyFails);

  const checks = data.checks ?? [];
  if (checks.length === 0) {
    setChildren(list, [tag('li', 'exec-check exec-check--queued', '')
      .append(tag('span', 'exec-check__icon', '◔'), tag('span', 'exec-check__name', 'Esperando la corrida…'))].map((x) => x)[0] ? [tag('li', 'exec-check exec-check--queued')] : []);
    // más simple: un li placeholder
    setChildren(list, []);
    const li = document.createElement('li');
    li.className = 'exec-check exec-check--queued';
    li.append(tag('span', 'exec-check__icon', '◔'), tag('span', 'exec-check__name', 'Esperando la corrida…'));
    setChildren(list, [li]);
    return;
  }

  const rows = [];
  for (const c of checks) {
    const meta = CHECK_BADGES[c.status] ?? CHECK_BADGES.QUEUED;
    const li = document.createElement('li');
    li.className = `exec-check ${meta.cls}` + (c.status === 'FAIL' || c.status === 'EXECUTOR_ERROR' ? ` exec-check--${c.status === 'EXECUTOR_ERROR' ? 'error' : 'fail'}` : '');
    li.dataset.status = c.status;

    const icon = tag('span', 'exec-check__icon', meta.icon);
    icon.setAttribute('aria-hidden', 'true');

    const badge = tag('span', `badge ${meta.badge}`);
    setChildren(badge, [
      tag('span', 'badge__icon' + (c.status === 'RUNNING' ? ' spin' : ''), meta.icon),
      document.createTextNode(meta.label),
    ]);

    const name = tag('span', 'exec-check__name', c.name);
    const dur = tag('span', 'exec-check__dur', c.durationMs ? `${c.durationMs} ms` : '—');

    const detailBtn = tag('button', 'exec-check__detail', 'ver detalle');
    detailBtn.type = 'button';
    detailBtn.setAttribute('aria-label', `Ver detalle de ${c.name}`);
    detailBtn.addEventListener('click', () => {
      if (lightbox && c.error) {
        // sin captura real: notificación legible con el error en el <pre>
        const zone = el('#exec-trace');
        zone.scrollIntoView({ block: 'start' });
      }
      if (lightbox === null) return;
    });

    li.append(icon, badge, name, dur, detailBtn);
    if (c.error) {
      const err = tag('p', 'exec-check__error', c.error);
      li.append(err);
    }
    // rótulo de procedencia §Etapa 5: cada check lleva su rótulo
    const prov = tag('span', 'provenance', '');
    prov.style.marginLeft = 'auto';
    prov.append(document.createTextNode('Resultado producido por el ejecutor'));
    li.append(prov);
    rows.push(li);
  }
  setChildren(list, rows);
}

// ---------------------------------------------------------------------------
// Trazas y capturas (zona limpia §3.6 / galería + lightbox)
// ---------------------------------------------------------------------------

function renderTrace(data) {
  const list = el('#exec-trace');
  if (!list) return;
  const steps = data.trace?.steps ?? [];
  if (steps.length === 0) {
    setChildren(list, [tag('li', 'exec-trace__placeholder mono-label', 'Sin pasos todavía: los pasos aparecen al ejecutar.')]);
    return;
  }
  const rows = steps.map((s, i) => {
    const li = document.createElement('li');
    const failed = Boolean(s.error);
    if (failed) li.className = 'exec-trace__failed';
    li.append(
      tag('span', 'exec-trace__step mono-label', `${String(i + 1).padStart(2, '0')}`),
      tag('span', 'exec-trace__action mono-label', s.action),
      tag('span', 'exec-trace__selector', s.selector ?? '—'),
      tag('span', 'exec-trace__dur', `${s.durationMs} ms`),
    );
    if (failed) { const e = tag('span', 'exec-check__error', s.error); li.append(e); }
    return li;
  });
  setChildren(list, rows);

  // enlace de descarga de traza
  const dl = el('#exec-trace-download');
  if (dl) dl.hidden = !data.trace?.downloadUrl;

  // galería de capturas con thumbnails + lightbox (una ÚNICA instancia)
  const gallery = el('#exec-gallery');
  const grid = el('#exec-gallery-grid');
  const shots = data.screenshots ?? [];
  if (gallery) gallery.hidden = shots.length === 0;
  if (grid && shots.length > 0) {
    if (!lightbox) lightbox = initLightbox([]);
    lightbox.setItems(shots.map((s) => ({ url: s.url, checkName: s.checkName })));
    setChildren(grid, shots.map((s, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'exec-gallery__thumb';
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', `Ver captura de ${s.checkName}`);
      const img = document.createElement('img');
      img.src = s.url;
      img.alt = `Captura de ${s.checkName}`;
      img.loading = 'lazy';
      const label = tag('span', 'exec-gallery__label', s.checkName);
      btn.append(img, label);
      btn.addEventListener('click', () => lightbox.open(i, btn));
      return btn;
    }));
  }
}

// ---------------------------------------------------------------------------
// Panel de IA separado (§1.1): nunca junto al badge
// ---------------------------------------------------------------------------

function renderAi(data) {
  const textNode = el('#exec-ai-text');
  if (!textNode) return;
  const txt = data.aiInterpretation ?? '';
  if (!txt) {
    textNode.textContent = 'La interpretación de la IA aparecerá aquí cuando el backend la ofrezca. No es evidencia: el PASS/FAIL proviene del ejecutor.';
    return;
  }
  textNode.textContent = txt; // textContent: contenido no confiable
}

// ---------------------------------------------------------------------------
// Corrida: POST + polling
// ---------------------------------------------------------------------------

async function startRun() {
  const btn = el('#exec-run');
  const cancelBtn = el('#exec-cancel');
  const statusEl = el('#exec-provenance');
  btn.disabled = true;
  cancelBtn.hidden = false;

  try {
    const { data: queued } = await api('/api/executor/run', {
      method: 'POST',
      body: { target: el('#exec-target')?.value ?? 'both', requirementId: el('#exec-reqid')?.value || null },
    });
    renderRunStatus(queued);
    renderChecks(queued);
    renderTrace(queued);
    renderAi(queued);

    // polling aislado: la capa de datos gestiona intervalos/erretras/tolerancia
    stopPoll = pollRun(queued.id, (snapshot) => {
      lastRun = snapshot;
      if (snapshot.pollError) {
        const e = snapshot.pollError;
        const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : 'Error de polling';
        toastError(msg);
        cancelBtn.hidden = true; btn.disabled = false;
        setChildren(el('#exec-status-badge'), [
          tag('span', 'badge__icon', '⚠'),
          document.createTextNode('ERROR DEL EJECUTOR'),
        ]);
        el('#exec-status-badge').className = 'badge badge--fail';
        return;
      }
      renderRunStatus(snapshot);
      renderChecks(snapshot);
      renderTrace(snapshot);
      renderAi(snapshot);
      if (['PASS', 'FAIL', 'EXECUTOR_ERROR'].includes(snapshot.status)) {
        toastOk(`Corrida terminada: ${snapshot.status} (datos de ejemplo).`);
        cancelBtn.hidden = true; btn.disabled = false;
      }
    }, { intervalMs: 1200, maxDurationMs: 120_000 });
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : (e?.message ?? 'Error inesperado');
    toastError(msg);
    if (statusEl) statusEl.textContent = msg;
    btn.disabled = false;
    cancelBtn.hidden = true;
  }
}

function cancelRun() {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  el('#exec-cancel').hidden = true;
  el('#exec-run').disabled = false;
  toastInfo('Consulta cancelada. La corrida puede seguir en el servidor.');
}

// ---------------------------------------------------------------------------
// Requisitos aprobados (mock) para el select
// ---------------------------------------------------------------------------

async function populateRequirements() {
  try {
    const { data } = await api('/api/history?type=requirements');
    const sel = el('#exec-reqid');
    if (!sel) return;
    const list = Array.isArray(data) ? data : [];
    if (list.length === 0) {
      // bloqueo visible si no hay requisito aprobado (§Etapa 3 reusa la idea;
      // aquí NO bloquea: solo se deshabilita la opción de requisito)
      const opt = document.createElement('option');
      opt.textContent = 'Sin requisitos aprobados (solo checks base)';
      opt.value = '';
      setChildren(sel, [opt]);
      return;
    }
    for (const r of list) {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.id.slice(0, 10)}… · ${r.status}`;
      if (r.status !== 'APPROVED') opt.disabled = true; // solo APROBADOS sedan válidos
      sel.append(opt);
    }
  } catch { /* selected defaults keep working */ }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

export function bootExecutor() {
  if (!el('#exec-run')) return; // no es la vista Executor
  populateRequirements();
  el('#exec-only-fails').addEventListener('change', () => lastRun && renderChecks(lastRun));
  el('#exec-run').addEventListener('click', startRun);
  el('#exec-cancel').addEventListener('click', cancelRun);
  // apagar polling si se abandona la página
  window.addEventListener('beforeunload', () => { if (stopPoll) stopPoll(); });
}
