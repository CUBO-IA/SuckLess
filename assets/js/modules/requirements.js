/**
 * SuckLess · assets/js/modules/requirements.js — Requirements Gate (Etapa 4, P0).
 *
 * Reglas del plan §1.1 y §Etapa 4:
 *  - El ESTADO del requisito (INCOMPLETO / LISTO PARA REVISAR / APROBADO) lo
 *    decide el BACKEND; el frontend solo lo muestra (badge #req-status-badge).
 *  - NO EXISTE camino en la UI a APROBADO sin modal de confirmación con
 *    checkbox "Revisé y confirmo". El botón de aprobar solo se habilita con
 *    status LISTO PARA REVISAR de backend + campos obligatorios completos.
 *  - Borradores en sessionStorage por si se pierde la conexión.
 *  - Solo textContent/createElement (nunca innerHTML con datos del backend).
 */
import { api, wrap, ApiError, isEmptyList } from '../api.js';
import { toastOk, toastError, toastInfo } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { attachSecretsCheck } from '../ui/secrets-check.js';

const el = (sel, root = document) => root.querySelector(sel);

function tag(name, className, text) {
  const n = document.createElement(name);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = String(text);
  return n;
}
function setChildren(node, children) { node.replaceChildren(...children); }

const DRAFT_KEY = 'suckless:req-draft';
const LOCKED_READ_ONLY = Symbol('locked');

const DOCTYPE_FIELDS = new Map([
  ['objective',        { label: 'Objetivo',              type: 'text',  required: true }],
  ['actor',            { label: 'Actor',                 type: 'text',  required: false }],
  ['behavior',         { label: 'Comportamiento esperado', type: 'text',  required: false }],
  ['inputs',           { label: 'Entradas',              type: 'list',  required: false }],
  ['rules',            { label: 'Reglas',                type: 'list',  required: false }],
  ['errors',           { label: 'Errores posibles',      type: 'list',  required: false }],
  ['acceptanceCriteria', { label: 'Criterios de Aceptación', type: 'list', required: true }],
  ['edgeCases',        { label: 'Casos Límite',          type: 'list',  required: true }],
]);
const REQUIRED_FIELDS = [...DOCTYPE_FIELDS.entries()].filter(([, m]) => m.required).map(([k]) => k);

let currentRequirement = null; // shape del contrato §2.1
let questionsDirty = false;    // hay respuestas sin guardar
let locked                  = false;

// ---------------------------------------------------------------------------
// Estado: el BACKEND lo decide; el frontend solo lo renderiza
// ---------------------------------------------------------------------------

const STATUS_VIEW = {
  INCOMPLETE:        { badge: 'badge--warn', icon: '⚠', label: 'INCOMPLETO' },
  READY_FOR_REVIEW:  { badge: 'badge--info', icon: '◎', label: 'LISTO PARA REVISAR' },
  APPROVED:          { badge: 'badge--ok',   icon: '✓', label: 'APROBADO' },
};

function renderStatusBadge(status) {
  const badge = el('#req-status-badge');
  if (!badge) return;
  const meta = STATUS_VIEW[status] ?? STATUS_VIEW.INCOMPLETE;
  setChildren(badge, [
    Object.assign(tag('span', `badge__icon${status === 'READY_FOR_REVIEW' ? ' spin' : ''}`, meta.icon), { style: status === 'READY_FOR_REVIEW' ? 'animation: suckless-spin is not for review' : '' }),
    document.createTextNode(meta.label),
  ]);
  badge.className = `badge ${meta.badge}`;
  badge.setAttribute('role', 'status');
}

function statusIs(status) { return currentRequirement?.status === status; }

function approvedFieldsComplete(data) {
  const doc = data?.document ?? {};
  return REQUIRED_FIELDS.every((k) => {
    const v = doc[k];
    if (Array.isArray(v) && v.length > 0) return true;
    if (typeof v === 'string' && v.trim().length > 0) return true;
    return false; // null / [] / '': incompleto
  });
}

// ---------------------------------------------------------------------------
// Zona 3: documento estructurado en vivo
// ---------------------------------------------------------------------------

function renderDocument(data) {
  const doc = el('#req-doc');
  const complBox = el('#req-completeness');
  if (!doc || !complBox) return;
  const d = data?.document ?? {};

  const rows = [];
  const completeness = [];
  for (const [key, meta] of DOCTYPE_FIELDS) {
    const value = d[key];
    let filled;
    let displayParts;
    if (Array.isArray(value)) {
      filled = value.filter((x) => typeof x === 'string' && x.trim()).length > 0;
      displayParts = filled ? value.map((v) => ({ type: 'li', text: v })) : [];
    } else {
      filled = typeof value === 'string' && value.trim().length > 0;
      displayParts = filled ? [{ type: 'p', text: value.trim() }] : [];
    }
    completeness.push({ key, label: meta.label, required: meta.required, filled });

    const dt = document.createElement('dt');
    const stateCls = filled ? 'req-field-state--ok' : 'req-field-state--none';
    const stateTxt = filled ? '✓ completo' : (meta.required ? '✗ pendiente (obligatorio)' : '◌ opcional');
    dt.append(tag('span', `req-field-state ${stateCls}`, filled ? '✓' : (meta.required ? '✗' : '◌')),
              tag('span', null, `${meta.label}${meta.required ? ' *' : ''}`));
    if (!filled) dt.append(tag('span', 'req-field-state', stateTxt));
    const dd = document.createElement('dd');
    for (const part of displayParts) {
      if (part.type === 'p') dd.append(tag('p', null, part.text));
      else { const ul = document.createElement('ul'); ul.append(tag('li', null, part.text)); dd.append(ul); }
    }
    if (!filled) dd.append(tag('p', 'req-doc__hint', meta.required ? 'Obligatorio: bloquea la aprobación.' : 'Opcional; puedes completarlo después.'));
    const wrap = tag('div', `req-doc__field${meta.required ? '' : ' req-doc__field--optional'}`);
    wrap.append(dt, dd);
    rows.push(wrap);
  }
  setChildren(doc, rows);

  // Indicador de completitud §Etapa 4 (✓/✗ color + texto en cada campo)
  const chips = completeness.map((c) => {
    const cls = c.filled ? 'compl compl--ok' : `compl compl--missing`;
    return tag('span', cls, `${c.filled ? '✓' : (c.required ? '✗' : '◌')} ${c.label}`);
  });
  setChildren(complBox, [
    tag('span', null, 'Completitud:'),
    ...chips,
  ]);

  renderApproveAvailability();
}

function renderApproveAvailability() {
  const btn = el('#req-approve');
  const hint = el('#req-approve-hint');
  if (!btn) return;
  const ready = statusIs('READY_FOR_REVIEW');
  const fieldsOk = approvedFieldsComplete(currentRequirement);
  // Condiciones exactas del plan: status LISTO PARA REVISAR + obligatorios llenos
  btn.disabled = !(ready && fieldsOk);
  btn.setAttribute('aria-disabled', String(btn.disabled));
  if (!ready && hint) hint.textContent = 'Aún no está LISTO PARA REVISAR según el backend.';
  else if (!fieldsOk && hint) hint.textContent = 'Faltan campos obligatorios (Objetivo, Criterios de Aceptación, Casos Límite).';
  else if (hint) hint.textContent = 'Abre el modal de confirmación para aprobar.';
  if (locked) { btn.hidden = true; } // documento solo lectura tras aprobar
}

// ---------------------------------------------------------------------------
// Zona 2: preguntas interactivas
// ---------------------------------------------------------------------------

function renderQuestions(data) {
  const list = el('#req-questions');
  if (!list) return;
  setChildren(list, []);
  const qs = data?.questions ?? [];
  for (const q of qs) {
    const id = q.id;
    const item = tag('li', `req-question ${q.answered ? 'req-question--answered' : 'req-question--pending'}`);
    item.dataset.qid = id;

    const top = document.createElement('div');
    top.className = 'req-question__top';
    const state = tag('span', 'req-question__state', q.answered ? '✓' : '✗ pendiente');
    const text = tag('span', 'req-question__text', q.text);
    top.append(state, text);
    item.append(top);

    const type = q.type ?? 'input';
    let input;
    if (type === 'choice' || type === 'select') {
      input = tag('select', 'select');
      input.id = `q-${id}`;
      input.append(Object.assign(document.createElement('option'), { textContent: 'Elegir…', value: '' }));
      for (const [value, label] of Object.entries(q.options ?? {})) {
        const opt = document.createElement('option');
        opt.value = value; opt.textContent = label;
        if (q.answer === value && q.answered) opt.selected = true;
        input.append(opt);
      }
      input.value = q.answer ? String(q.answer) : '';
    } else {
      input = tag('textarea', 'textarea');
      input.id = `q-${id}`;
      input.rows = 2;
      input.value = q.answer && q.answered ? q.answer : '';
      input.placeholder = 'Tu respuesta… (una por línea si list)';
    }
    const label = document.createElement('label');
    label.className = 'field__label mono-label';
    label.setAttribute('for', input.id);
    label.textContent = q.category ? `Categoría: ${q.category}` : 'Respuesta';
    item.append(label, input);
    input.addEventListener('input', () => { questionsDirty = true; refreshProgress(); el('#req-save-answers').disabled = false; });

    list.append(item);
  }
  refreshProgress();
  el('#req-save-answers').disabled = questionsDirty ? false : true;
  el('#req-save-answers')?.focus?.();
}

function refreshProgress() {
  const qs = currentRequirement?.questions ?? [];
  const answered = qs.filter((q) => q.answered).length;
  const bar = el('#req-progress-bar');
  const label = el('#req-progress-label');
  if (bar) bar.style.width = `${qs.length ? Math.round((answered / qs.length) * 100) : 100}%`;
  if (label) label.textContent = `${answered} / ${qs.length} respondidas`;
}

// ---------------------------------------------------------------------------
// Estado de la corrida actual (mock) y guardado de respuestas
// ---------------------------------------------------------------------------

function cloneCurrent() {
  return JSON.parse(JSON.stringify(currentRequirement));
}

async function saveAnswers() {
  const statusEl = el('#req-questions-status');
  const btn = el('#req-save-answers');
  btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Guardando…';
  try {
    const answers = {};
    for (const node of el('#req-questions').querySelectorAll('[data-qid]')) {
      const input = node.dataset.qid ? node.querySelector('textarea, select') : null;
      if (input && input.value.trim()) answers[node.dataset.qid] = { answered: true, answer: input.value.trim() };
    }
    // El POST con answers devuelve el requisito REEVALUADO (contrato §2.1):
    // el backend decide el nuevo status (mock: todas respondidas → READY_FOR_REVIEW).
    const { data } = await api('/api/requirements/analyze', { method: 'POST', body: { text: currentRequirement.document?.objective ?? '', answers } });
    currentRequirement = data;
    questionsDirty = false;
    const idLabel = el('#req-id');
    if (idLabel) idLabel.textContent = data.id;
    renderStatusBadge(data.status);
    renderQuestions(data);
    renderDocument(data);
    el('#req-zone-2')?.toggleAttribute('hidden', (data.questions ?? []).length === 0);
    el('#req-zone-3')?.removeAttribute('hidden');
    toastOk(`Respuestas integradas. Estado del backend: ${data.status}.`);
    if (statusEl) statusEl.textContent = '';
    saveDraft();
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : e.message;
    toastError(msg);
    if (statusEl) statusEl.textContent = msg;
    btn.disabled = false;
  }
}

function saveDraft() {
  if (!currentRequirement) return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(currentRequirement));
    toastOk('Borrador guardado en sesión.');
  } catch { /* sesión bloqueada: no interrumpe el flujo */ }
}

function restoreDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Captura (Análisis) del requisito + reintento robusto
// ---------------------------------------------------------------------------

function canReopen() { return !locked; }

async function analyzeLocal({ text, silent = false } = {}) {
  const statusEl = el('#req-status');
  const errorEl = el('#req-text-error');
  try {
    if (!silent) {
      if (statusEl) statusEl.textContent = 'Analizando…';
    }
    const { data } = await api('/api/requirements/analyze', {
      method: 'POST',
      body: { text: text ?? el('#req-text').value },
    });
    currentRequirement = data;
    locked = false;
    questionsDirty = false;
    const idLabel = el('#req-id');
    if (idLabel) idLabel.textContent = data.id;
    renderStatusBadge(data.status);
    renderQuestions(data);
    renderDocument(data);
    // Zonas 2 y 3 visibles si hay preguntas / document
    el('#req-zone-2')?.toggleAttribute('hidden', (data.questions ?? []).length === 0);
    el('#req-zone-3')?.toggleAttribute('hidden', !data.document);
    el('#req-reanalyze')?.removeAttribute('hidden');
    el('#req-save-draft')?.removeAttribute('hidden');
    el('#req-approved-note')?.setAttribute('hidden', '');
    if (statusEl) statusEl.textContent = '';
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : (e?.message ?? 'Error inesperado');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.remove('visually-hidden');
    }
    toastError(msg);
    if (statusEl) statusEl.textContent = '';
  }
}

// ---------------------------------------------------------------------------
// Modal de aprobación: único camino a APROBADO (criterio de aceptación Etapa 4)
// ---------------------------------------------------------------------------

function openApproveModal() {
  if (!currentRequirement) return;
  if (!statusIs('READY_FOR_REVIEW')) return;   // doble guard: el backend debe ya estar listo
  const modal = el('#req-approve-modal');
  const idLabel = el('#req-approve-id');
  const criteriaList = el('#req-approve-criteria');
  const summaryBox = el('#req-approve-summary');
  const confirmChk = el('#req-approve-confirm');
  const confirmBtn = el('#req-approve-confirm-btn');
  const errorEl = el('#req-approve-error');

  if (idLabel) idLabel.textContent = currentRequirement.id ?? '—';

  const setChildrenSafe = (elNode, children) => { setChildren(elNode, children); };

  // Resumen del documento (textContent siempre)
  setChildrenSafe(summaryBox, [
    tag('p', 'doc-objective', currentRequirement.document?.objective ?? '(sin objetivo)'),
  ]);

  // Criterios de aceptación: lista simple
  setChildrenSafe(criteriaList, (currentRequirement.document?.acceptanceCriteria ?? []).map((c) => tag('li', null, c)));

  confirmChk.checked = false;
  confirmBtn.disabled = !confirmChk.checked; // checkbox obligatorio §Etapa 4
  errorEl.classList.add('visually-hidden');

  confirmChk.onchange = () => {
    confirmBtn.disabled = !confirmChk.checked;
    if (!confirmChk.checked) confirmBtn.setAttribute('aria-disabled', 'true');
    else confirmBtn.removeAttribute('aria-disabled');
  };

  const close = openModal(modal); // focus trap + Esc + retorno de foco (ui/modal.js)

  // Conexión al submit: un único handler del modal
  confirmBtn.onclick = async () => {
    if (!confirmChk.checked) {
      errorEl.textContent = 'Marca "Revisé y confirmo" para poder aprobar.';
      errorEl.classList.remove('visually-hidden');
      return;
    }
    try {
      confirmBtn.disabled = true;
      const name = prompt('Nombre de la persona que aprueba (se registra en el historial):') ?? '';
      if (!name.trim()) {
        confirmBtn.disabled = false;
        errorEl.textContent = 'Se requiere un nombre de aprobador.';
        errorEl.classList.remove('visually-hidden');
        return;
      }
      const { data } = await api('/api/requirements/approve', {
        method: 'POST',
        body: { id: currentRequirement.id, approvedBy: name.trim() },
      });
      // APROBADO: el backend lo dijo; UI solo renderiza
      close();
      renderApproved(data);
    } catch (e) {
      const msg = `${e instanceof ApiError ? e.code : 'ERROR'}: ${e.message}`;
      errorEl.textContent = msg;
      errorEl.classList.remove('visually-hidden');
      toastError(msg);
      confirmBtn.disabled = false;
    }
  };
}

function renderApproved(data) {
  currentRequirement = data;
  locked = true;
  questionsDirty = false;
  renderStatusBadge('APPROVED');
  renderDocument(data);
  // campos en solo lectura
  for (const node of el('#req-questions').querySelectorAll('textarea, select'))
    node.disabled = true;
  const note = el('#req-approved-note');
  if (note) {
    note.removeAttribute('hidden');
    el('#req-approved-by').textContent = data.approvedBy ?? '—';
    el('#req-approved-at').textContent = data.approvedAt?.slice(0, 16).replace('T', ' ') ?? '';
  }
  el('#req-approve')?.setAttribute('hidden', '');
  el('#req-status')?.replaceChildren('');
  toastOk(`Requisito APROBADO por ${data.approvedBy}. Puedes ir a Executor para verificar.`);
  saveDraft();
}

function reopen() {
  locked = false;
  renderApproveAvailability();
  for (const node of el('#req-questions')?.querySelectorAll('textarea, select') ?? [])
    node.disabled = false;
  el('#req-approved-note')?.setAttribute('hidden', '');
  // el estado lo confirma el backend: re-analizamos
  analyzeLocal({ text: el('#req-text').value, silent: true });
}

// ---------------------------------------------------------------------------
// Boot del módulo
// ---------------------------------------------------------------------------

export function bootRequirements() {
  if (!el('#req-analyze')) return; // no es la vista Requirements
  const textArea = el('#req-text');
  attachSecretsCheck(textArea, null);

  el('#req-analyze').addEventListener('click', async () => {
    const text = textArea.value.trim();
    const errEl = el('#req-text-error');
    if (!text) {
      errEl.textContent = 'Escribe o pega el requisito antes de analizar.';
      errEl.classList.remove('visually-hidden');
      textArea.focus();
      return;
    }
    errEl.classList.add('visually-hidden');
    await analyzeLocal({ text });
  });

  el('#req-load-example').addEventListener('click', () => {
    textArea.value = 'El carrito debe aplicar descuentos';
    textArea.focus();
  });

  el('#req-reanalyze').addEventListener('click', () => analyzeLocal({ text: textArea.value, silent: true }));
  el('#req-save-answers').addEventListener('click', saveAnswers);
  el('#req-save-draft').addEventListener('click', saveDraft);
  el('#req-approve').addEventListener('click', openApproveModal);
  el('#req-reopen').addEventListener('click', reopen);

  // Cancel del modal (data-modal-cancel) → cierra sin aprobar
  el('#req-approve-modal').querySelector('[data-modal-cancel]')?.addEventListener('click', () => {
    try { el('#req-approve-modal').close(); } catch { el('#req-approve-modal').removeAttribute('open'); }
  });
  // Esc en el checkbox: el modal nativo lo gestiona; el focus trap lo hace ui/modal.js.

  // Si hay borrador, ofrecer restaurarlo (pérdida de conexión)
  const draft = restoreDraft();
  if (draft) {
    const note = tag('p', 'card__meta', 'Hay un borrador sin guardar de esta sesión.');
    const restoreBtn = tag('button', 'btn btn--secondary btn--sm', 'Restaurar borrador');
    restoreBtn.type = 'button';
    restoreBtn.addEventListener('click', () => {
      currentRequirement = draft;
      el('#req-text').value = draft.document?.objective ?? '';
      renderStatusBadge(draft.status);
      renderQuestions(draft);
      renderDocument(draft);
      el('#req-zone-2')?.removeAttribute('hidden');
      el('#req-zone-3')?.removeAttribute('hidden');
      el('#req-reanalyze')?.removeAttribute('hidden');
      toastInfo('Borrador restaurado.');
      restoreBtn.parentElement?.remove();
    });
    note.append(restoreBtn);
    el('#req-zone-1').append(note);
  }
}
