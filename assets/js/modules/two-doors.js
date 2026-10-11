/**
 * SuckLess · assets/js/modules/two-doors.js — Two Doors (Etapa 3).
 *
 * Reglas del plan:
 *  - selector de pestañas `role=tablist` con selección persistida en URL;
 *  - cambiar de pestaña NO pierde lo escrito (no reload; replaceState);
 *  - detección de secretos antes de enviar (§1.2);
 *  - el resultado Debug es una lista ORDENADA de hipótesis, cada una con la
 *    etiqueta fija `HIPÓTESIS · PENDIENTE DE PROBAR` (§1.1) y botón
 *    "Reproducir con prueba" que lleva al Executor;
 *  - solo textContent/createElement (nunca innerHTML con datos).
 */
import { api, wrap, ApiError } from '../api.js';
import { toastError, toastInfo, toastOk } from '../ui/toast.js';
import { initDropzone } from '../ui/dropzone.js';
import { attachSecretsCheck, detectSecret } from '../ui/secrets-check.js';

const el = (sel) => document.querySelector(sel);
const REQUIRED_EXT = [];
// tabs accesibles con flechas; URL-sync SIN recarga para no perder lo escrito

function tag(name, className, text) {
  const n = document.createElement(name);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = String(text);
  return n;
}
function setChildren(node, children) { node.replaceChildren(...children); }

// ---------------------------------------------------------------------------
// Tabs accesibles + URL sincronizada
// ---------------------------------------------------------------------------

const MODES = ['debug', 'verify'];

function currentModeFromUrl() {
  const m = new URLSearchParams(location.search).get('mode');
  return MODES.includes(m) ? m : 'debug';
}

function activateMode(mode, { pushUrl = true } = {}) {
  for (const m of MODES) {
    const tab = el(`#tab-${m}`);
    const panel = el(`#panel-${m}`);
    const selected = m === mode;
    tab?.setAttribute('aria-selected', String(selected));
    tab?.setAttribute('tabindex', selected ? '0' : '-1');
    panel?.toggleAttribute('hidden', !selected);
  }
  if (pushUrl) {
    // replaceState NO recarga: lo escrito en formularios queda intacto (criterio Etapa 3)
    const url = new URL(location.href);
    url.searchParams.set('mode', mode);
    history.replaceState(null, '', url);
  }
  el(`#tab-${mode}`)?.focus();
}

function initTabs() {
  const tabs = MODES.map((m) => el(`#tab-${m}`)).filter(Boolean);
  if (tabs.length < 2) return;
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activateMode(tab.id.replace('tab-', '')));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      activateMode(next.id.replace('tab-', ''));
    });
  });
}

/**
 * Consume un botón "busy" con función asíncrona: cambia label a estado cargando,
 * deshabilita, cancela si procede y mapea error con ApiError a UI accesible.
 */
async function busy(button, statusEl, fn) {
  const prevLabel = button.textContent;
  button.disabled = true;
  if (statusEl) statusEl.textContent = 'Ejecutando…';
  let stopFn = null;
  try { stopFn = await fn(); }
  catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : (e?.message ?? 'Error inesperado');
    if (statusEl) statusEl.textContent = msg;
    toastError(msg);
  } finally {
    button.disabled = false;
    if (stopFn && typeof stopFn === 'function') stopFn();
    // el status queda vaciado por el CALLER (initDebugForm/Verify) si fue ok,
    // o con el mensaje de error de ApiError si falló: es responsabilidad suya.
  }
}

// ---------------------------------------------------------------------------
// Requisitos (mock) para selects de ambos modos
// ---------------------------------------------------------------------------

async function populateRequirementSelects() {
  try {
    const { data } = await api('/api/requirements');
    const optionsList = Array.isArray(data) ? data : [];
    const approvedOptions = optionsList.map((r) => ({ id: r.id, label: `${r.id.slice(0, 12)}… · ${r.status}`, approved: r.status === 'APPROVED' }));
    for (const sel of [el('#debug-reqid'), el('#verify-reqid')]) {
      if (!sel) continue;
      const opts = sel.dataset.mode === 'verify'
        ? [{ id: '', label: 'Solo checks base (sin requisito)', approved: false }, ...approvedOptions]
        : [sel.querySelector('option'), ...approvedOptions.map((o) => ({ id: o.id, label: o.label }))];
      // construye las <option> de forma segura (nada viene de HTML del backend)
      const optNodes = opts.filter(Boolean).map((o) => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.label;
        if (o.approved && sel.dataset.mode === 'verify') opt.dataset.approved = 'true';
        return opt;
      });
      setChildren(sel, optNodes);
      if (sel.dataset.mode === 'verify') {
        const hasApproved = approvedOptions.some((o) => o.approved);
        if (!hasApproved) {
          const warning = tag('p', 'field__error', 'Aún no hay requisito aprobado. Solo se ejecutarán los checks base.');
          warning.className = 'minor mono-label';
          warning.style.color = 'var(--warn)';
          sel.after(warning);
        }
      }
    }
  } catch { /* silencioso: si no hay requisitos, la UI ya lo reflejó en SSR */ }
}

// ---------------------------------------------------------------------------
// DEBUG: formulario + resultado
// ---------------------------------------------------------------------------

function renderHypotheses(container, data) {
  // clear
  setChildren(container, [tag('h2', 'card__title', 'Resultado del diagnóstico')]);
  if (data?.pollError) return;
  // Procedencia §1.1: mientras USE_MOCK, TODO resultado mock lleva la etiqueta
  container.append(tag('p', 'provenance provenance--mock', 'Dato de ejemplo'));
  if (!data?.hypotheses || data.hypotheses.length === 0) {
    container.append(tag('p', 'card__meta', 'No se identificaron hipótesis revisables en el log. Añade más contexto (pasos, archivo, versión) y reintenta.'));
    return;
  }
  container.append(tag('div', 'summary__meta', '').append(
    tag('span', 'badge badge--warn', data.status === 'HYPOTHESIS' ? 'HIPÓTESIS · NIVEL DE EVIDENCIA' : data.status),
    tag('span', 'mono-label', `Ladder ${data.ladderLevel ?? 1}/3`),
  ));
  if (data.logSummary) container.append(tag('p', 'card__meta', data.logSummary));

  const list = tag('ol', 'two-doors__hyp-list');
  data.hypotheses.forEach((hyp, i) => {
    const item = tag('li', 'card two-doors__hyp');
    // etiqueta FIJA: nunca cambia ("hipótesis" no es causa confirmada; §1.1)
    const label = tag('p');
    label.appendChild(tag('span', 'ai-tag', 'HIPÓTESIS · PENDIENTE DE PROBAR'));
    if (hyp.status === 'reproduced' || hyp.status === 'correction_verified') {
      label.append(tag('span', 'badge badge--ok', hyp.status === 'reproduced' ? 'REPRODUCIDO' : 'CORRECCIÓN VERIFICADA'));
    }
    item.append(tag('h3', 'two-doors__hyp-title', `Hipótesis ${i + 1}`), label, tag('p', null, hyp.text));
    // evidencia: archivo:líneas con snippet en <code>
    for (const ev of hyp.evidence ?? []) {
      const line = tag('p', 'two-doors__evidence');
      const ref = tag('code', 'mono', `${ev.file}:${ev.lines.join('–')}`);
      line.append(tag('span', 'mono-label', 'Evidencia: '), ref);
      item.append(line);
      if (ev.snippet) {
        const pre = document.createElement('pre');
        pre.className = 'clean-zone';
        const code = document.createElement('code');
        code.textContent = ev.snippet; // SIEMPRE textContent
        pre.appendChild(code);
        item.append(pre);
      }
    }
    // CTA: Reproducir con prueba → executor (etapa 5 mostrará el flujo real)
    if (hyp.reproduceWith) {
      const cta = tag('a', 'btn btn--secondary btn--sm', 'Reproducir con prueba');
      cta.href = '/views/executor-index.bxm';
      item.append(cta);
      item.append(tag('p', 'minor mono-label', hyp.reproduceWith));
    }
    list.appendChild(item);
  });
  container.append(list);
  container.hidden = false;
}

function initDebugForm() {
  const form = el('#panel-debug');
  if (!form) return;
  const logArea = el('#debug-log');
  const statusEl = el('#debug-status');
  const resultBox = el('#debug-result');
  const btn = el('#debug-analyze');
  const cancelBtn = el('#debug-cancel');

  // detección de secretos en vivo (§1.2)
  attachSecretsCheck(logArea, (found) => {
    if (found) {
      const msg = `Detectamos "${found.hint}" en línea ${found.line}. Quita el secreto antes de enviar.`;
      const err = el('#debug-log-error');
      err.textContent = msg;
      err.classList.remove('visually-hidden');
      toastInfo(msg);
    } else {
      const err = el('#debug-log-error');
      err.textContent = '';
      err.classList.add('visually-hidden');
    }
  });

  // dropzone accesible
  initDropzone(el('#debug-dropzone'));

  // Analizar: valida y llama al endpoint de debug con PROCEDENCIA interna
  btn.addEventListener('click', async () => {
    const logText = logArea.value.trim();
    const errEl = el('#debug-log-error');
    if (!logText) {
      errEl.textContent = 'Pega un log o stack trace antes de analizar.';
      errEl.classList.remove('visually-hidden');
      logArea.focus();
      return;
    }
    if (detectSecret(logText)) {
      errEl.textContent = 'Se detectó un posible secreto. Elimínalo antes de enviar.';
      errEl.classList.remove('visually-hidden');
      logArea.focus();
      return;
    }
    errEl.classList.add('visually-hidden');
    // mock: creamos un body conforme al contrato con delay normal
    const body = { log: logText, requirementId: el('#debug-reqid')?.value || null };
    await busy(btn, statusEl, async () => {
      const res = await api('/api/debug/analyze', { method: 'POST', body });
      renderHypotheses(resultBox, res.data);
      statusEl.textContent = '';
      toastOk('Diagnóstico listo (datos de ejemplo).');
    });
  });

  cancelBtn?.addEventListener('click', () => {
    statusEl.textContent = '';
    btn.disabled = false;
    cancelBtn.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// VERIFY: bloqueo si no hay requisito aprobado + corrida vía usuario Executor
// ---------------------------------------------------------------------------

function initVerifyForm() {
  const panel = el('#panel-verify');
  if (!panel) return;
  const btn = el('#verify-run');
  const statusEl = el('#verify-status');
  const resultBox = el('#verify-result');
  btn.addEventListener('click', () => {
    const reqId = el('#verify-reqid')?.value ?? '';
    const target = el('#verify-target')?.value ?? 'both';
    const appIdentifier = el('#verify-app-id')?.value?.trim() ?? '';
    if (detectSecret(appIdentifier)) {
      toastError('El identificador de la app parece contener un secreto. Elimina cualquier token o clave.');
      return;
    }
    // En la Etapa 5 el módulo executor pobla su UI real; aquí registramos el
    // intento con procedencia y avisamos Ever running (m Interrupt de mock).
    toastInfo('Solicitud registrada. La corrida real se lanzará desde el Executor (Etapa 5).');
    resultBox.hidden = false;
    setChildren(resultBox, [
      tag('h2', 'card__title', 'Resultado de la ejecución'),
      tag('p', 'provenance provenance--mock', 'Dato de ejemplo'),
      tag('p', 'card__meta', `target=${target}${reqId ? ` · requisito=${reqId.slice(0, 12)}…` : ' · checks base'}${appIdentifier ? ` · app=${appIdentifier}` : ''}`),
      tag('a', 'btn btn--primary', 'Ir al Executor para ver checks en vivo').setAttribute('href', '/views/executor-index.bxm') && null,
    ]);
  });
}

// ---------------------------------------------------------------------------
// Boot del módulo
// ---------------------------------------------------------------------------

export function bootTwoDoors() {
  if (!el('#tab-debug') && !el('#tab-verify')) return; // no es Two Doors
  initTabs();
  // El SSR ya aplicó ?mode=; el cliente re-aplica en JS (sin recargar nada)
  activateMode(currentModeFromUrl(), { pushUrl: false });
  populateRequirementSelects();
  initDebugForm();
  initVerifyForm();
  // sync de cambio manual de URL (back/forward)
  window.addEventListener('popstate', () => activateMode(currentModeFromUrl(), { pushUrl: false }));
}
