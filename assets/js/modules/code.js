/**
 * SuckLess · assets/js/modules/code.js — Code Explainer & Review (Etapa 6).
 *
 * Reglas del plan:
 *  - El CÓDIGO se inserta SIEMPRE como texto (textContent); nunca como HTML
 *    (§1.2: contenido no confiable). El resaltado se hace con spans generados
 *    de forma segura a partir del texto plano.
 *  - Resaltador de sintaxis propio/local (tema code-view.css §3.8; sin CDN).
 *  - Referencias `archivo:línea` clicables que saltan y resaltan en el visor.
 *  - Hallazgos en acordeón accesible (<details>): severidad (color+texto),
 *    categoría, evidencia, impacto, recomendación y parche.
 *  - Parche: format "diff" → líneas +/- con SÍMBOLO visible y color; "text" →
 *    código plano. Botón "Copiar parche" copia patch.content tal cual con
 *    feedback "Copiado ✓" y fallback si falla el portapapeles.
 *  - Etiquetas §1.1: "Recomendación de IA · requiere validación humana" +
 *    distinción Hallazgo demostrado (proven=true) vs Sugerencia.
 *  - Un hallazgo sin file/lines se muestra igual sin romper el visor.
 */
import { api, ApiError } from '../api.js';
import { toastOk, toastError, toastInfo } from '../ui/toast.js';

const el = (sel) => document.querySelector(sel);

function tag(name, className, text) {
  const n = document.createElement(name);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = String(text);
  return n;
}
function setChildren(node, children) { node.replaceChildren(...children); }

let sources = {};        // { 'ruta': contenido-texto }
let files = [];          // [{path, language, size}]
let currentFile = null;
let citedRanges = [];    // rangos citados activos [{file, start, end}]

// ---------------------------------------------------------------------------
// Resaltador de sintaxis local (tema tokens §3.8; NO librería externa)
// Genera un fragmento seguro desde texto plano; sin eval ni HTML injection.
// ---------------------------------------------------------------------------

const TOKENS = [
  { re: /\/\/[^\n]*/g,           cls: 'syn-comment' },
  { re: /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, cls: 'syn-str' },
  { re: /\b(const|let|var|function|return|if|else|for|while|throw|new|import|export|from|of|in|=>)\b/g, cls: 'syn-kw' },
  { re: /\b\d+(?:\.\d+)?\b/g,    cls: 'syn-num' },
];

/** Crea el HTML-safe DOM del código: cada línea un <tr> con número y celda. */
function buildCodeDom(source) {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  const lines = source.split('\n');
  lines.forEach((lineText, i) => {
    const tr = document.createElement('tr');
    const num = tag('td', 'line-num', String(i + 1));
    const code = document.createElement('td');
    highlightLine(code, lineText);
    tr.append(num, code);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

/** Resalta UNA línea generando spans seguros a partir de matches del texto. */
function highlightLine(container, text) {
  // decimos tokens por posición: [start, end, cls]
  const marks = [];
  for (const t of TOKENS) {
    t.re.lastIndex = 0;
    let m;
    while ((m = t.re.exec(text)) !== null) {
      marks.push({ s: m.index, e: m.index + m[0].length, cls: t.cls });
      if (m.index === t.re.lastIndex) t.re.lastIndex++;
    }
  }
  marks.sort((a, b) => a.s - b.s);
  // resolve solapamientos: la marca más larga gana; no solapamos
  const valid = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.s >= cursor) { valid.push(m); cursor = m.e; }
  }
  let pos = 0;
  for (const m of valid) {
    if (m.s > pos) container.append(document.createTextNode(text.slice(pos, m.s)));
    const span = document.createElement('span');
    span.className = m.cls;
    span.textContent = text.slice(m.s, m.e);
    container.append(span);
    pos = m.e;
  }
  if (pos < text.length) container.append(document.createTextNode(text.slice(pos)));
  if (text.length === 0) container.append(document.createTextNode(' '));
}

/** Marca de rangos citados en el visor. */
function applyCited() {
  const rows = el('#code-view').querySelectorAll('tbody tr');
  rows.forEach((tr, i) => tr.classList.remove('line-cited', 'line-error'));
  for (const r of citedRanges) {
    if (r.file !== currentFile) continue;
    for (let line = r.start; line <= r.end; line++) {
      const tr = rows[line - 1];
      if (tr) tr.classList.add('line-cited');
    }
  }
}

/** Salta y resalta el rango en el visor; devuelve el foco al visor. */
function jumpTo(file, start, end) {
  if (file !== currentFile) selectFile(file, { then: () => jumpTo(file, start, end) });
  applyCited();
  const row = el(`#code-view tbody tr:nth-child(${start})`);
  if (row) {
    row.scrollIntoView({ block: 'center' });
    row.classList.add('line-error');
    row.querySelector('td:nth-child(2)')?.focus?.();
  }
}

// ---------------------------------------------------------------------------
// Visor
// ---------------------------------------------------------------------------

function selectFile(path, { then = null } = {}) {
  if (!sources[path]) return;
  currentFile = path;
  const view = el('#code-view');
  setChildren(view, [buildCodeDom(sources[path])]);
  el('#code-src').value = path;
  applyCited();
  if (then) then();
}

function initViewer() {
  const sel = el('#code-src');
  for (const f of files) {
    const opt = document.createElement('option');
    opt.value = f.path;
    opt.textContent = f.path;
    sel.append(opt);
  }
  // default: el archivo con más hallazgos; si no, primero
  selectFile(files[0]?.path);

  // Copiar archivo completo
  el('#code-copy').addEventListener('click', () => copyText(sources[currentFile] ?? '', `Archivo ${currentFile} copiado`));

  // Búsqueda en archivo: resalta las coincidencias por línea
  el('#code-search').addEventListener('input', () => {
    const query = el('#code-search').value.trim().toLowerCase();
    const status = el('#code-search-status');
    if (!query) { applyCited(); if (status) status.textContent = ''; return; }
    const rows = el('#code-view').querySelectorAll('tbody tr');
    let hits = [];
    rows.forEach((tr, i) => {
      const text = tr.querySelector('td:nth-child(2)').textContent.toLowerCase();
      if (text.includes(query)) hits.push(i + 1);
    });
    if (status) status.textContent = hits.length
      ? `${hits.length} coincidencia(s) en líneas ${hits.slice(0, 6).join(', ')}${hits.length > 6 ? '…' : ''}`
      : 'Sin coincidencias.';
    rows.forEach((tr) => tr.classList.remove('line-cited'));
    for (const line of hits) rows[line - 1]?.classList.add('line-cited');
  });
}

// ---------------------------------------------------------------------------
// Copiar con feedback y fallback (§Etapa 6)
// ---------------------------------------------------------------------------

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toastOk(`Copiado ✓ ${okMsg ?? ''}`);
  } catch {
    // fallback: textarea temporal + execCommand (navega en iframe HTTP sin SSL)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toastOk(`Copiado ✓ ${okMsg ?? ''}`);
    } catch { toastError('No se pudo copiar. Selecciónalo manualmente.'); }
    ta.remove();
  }
}

// ---------------------------------------------------------------------------
// Explicar: referencia archivo:línea clicable (útil para el flujo)
// ---------------------------------------------------------------------------

async function runExplain() {
  const status = el('#explain-status');
  const list = el('#explain-steps');
  const symbol = el('#explain-symbol').value.trim() || 'addItem';
  try {
    if (status) status.textContent = 'Explicando…';
    const { data } = await api('/api/code/explain', { method: 'POST', body: { symbol } });
    const steps = data.steps ?? [];
    const rows = steps.map((s) => {
      const li = document.createElement('li');
      li.append(tag('span', null, s.text));
      if (s.file && s.lines) {
        const ref = document.createElement('a');
        ref.className = 'step-ref';
        ref.href = '#code-viewer-zone';
        ref.textContent = `${s.file}:${s.lines[0]}` + (s.lines[1] !== s.lines[0] ? `–${s.lines[1]}` : '');
        ref.addEventListener('click', (e) => { e.preventDefault(); jumpTo(s.file, s.lines[0], s.lines[1]); });
        li.append(ref);
      }
      return li;
    });
    setChildren(list, rows);
    list.hidden = false;
    if (status) status.textContent = '';
    // resaltar el rango principal en el visor
    const first = steps.find((s) => s.file && s.lines);
    if (first) jumpTo(first.file, first.lines[0], first.lines[1]);
  } catch (e) {
    const msg = `${e instanceof ApiError ? e.code : 'ERROR'}: ${e.message}`;
    if (status) status.textContent = msg;
    toastError(msg);
  }
}

// ---------------------------------------------------------------------------
// Revisar: hallazgos con acordeón, filtros, orden y parche
// ---------------------------------------------------------------------------

const SEV_ORDER = { ALTA: 0, MEDIA: 1, BAJA: 2 };
const SEV_BADGE = { ALTA: 'badge--fail', MEDIA: 'badge--warn', BAJA: 'badge--info' };

function provenLabel(f) {
  return f.proven ? 'Hallazgo demostrado' : 'Sugerencia';
}

function renderFindings(data) {
  const list = el('#review-findings');
  const findings = [...(data.findings ?? [])].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));

  // resumen-KPI: contadores por severidad y categoría (§Etapa 6)
  const bySev = { ALTA: 0, MEDIA: 0, BAJA: 0 };
  const byCat = {};
  for (const f of findings) { bySev[f.severity] = (bySev[f.severity] ?? 0) + 1; byCat[f.category] = (byCat[f.category] ?? 0) + 1; }
  const kpis = [
    { value: bySev.ALTA, label: 'ALTA', variant: 'fail' },
    { value: bySev.MEDIA, label: 'MEDIA', variant: 'warn' },
    { value: bySev.BAJA, label: 'BAJA', variant: '' },
    { value: byCat.LOGICA ?? 0, label: 'Lógica', variant: '' },
    { value: byCat.SEGURIDAD ?? 0, label: 'Seguridad', variant: '' },
    { value: byCat.CALIDAD ?? 0, label: 'Calidad', variant: '' },
  ].map((k) => {
    const box = tag('div', `kpi kpi--${k.variant}`);
    box.append(tag('span', 'kpi__value', k.value), tag('span', 'kpi__label', k.label));
    return box;
  });
  setChildren(el('#review-summary'), kpis);

  // acordeones
  const nodes = findings.map((f) => {
    const details = document.createElement('details');
    details.className = 'acc review-finding';
    details.dataset.sev = f.severity;
    details.dataset.cat = f.category;

    const summary = document.createElement('summary');
    const sev = tag('span', `finding-sev badge ${SEV_BADGE[f.severity] ?? 'badge--idle'}`);
    setChildren(sev, [document.createTextNode(f.severity)]);
    const title = tag('span', null, f.recommendation.slice(0, 42) + (f.recommendation.length > 42 ? '…' : ''));
    const file = tag('span', 'finding-file', f.file ? `${f.file.split('/').pop()}:${f.lines?.[0] ?? '?'}` : 'sin ubicación');
    const cat = tag('span', 'finding-cat', f.category);
    summary.append(sev, title, file, cat);

    const body = tag('div', 'acc__body review-finding__body');

    // líneas Evidencia/Impacto/Recomendación con filas glance
    body.append(
      tag('p', null, '').append(tag('span', 'mono-label', 'Evidencia: '), document.createTextNode(f.evidence)),
    );
    if (f.file && f.lines) {
      const ref = document.createElement('a');
      ref.className = 'step-ref';
      ref.href = '#code-viewer-zone';
      ref.textContent = `${f.file}:${f.lines[0]}`;
      ref.addEventListener('click', (e) => { e.preventDefault(); jumpTo(f.file, f.lines[0], f.lines[1] ?? f.lines[0]); });
      body.append(ref);
    } else {
      body.append(tag('p', 'minor mono-label', 'Hallazgo sin ubicación de archivo/líneas; se muestra sin salto del visor.'));
    }
    body.append(tag('p', null, '').append(tag('span', 'mono-label', 'Impacto: '), document.createTextNode(f.impact ?? '—')));
    body.append(tag('p', null, '').append(tag('span', 'mono-label', 'Recomendación: '), document.createTextNode(f.recommendation)));
    body.append(tag('p', 'review-finding__labels').append(
      tag('span', 'ai-tag', 'Recomendación de IA · requiere validación humana'),
      tag('span', 'provenance', provenLabel(f)),
    ));
    if (f.proven) {
      const p = tag('p', 'compl compl--ok', '✓ Hallazgo demostrado por una prueba ejecutada.');
      body.append(p);
    } else {
      body.append(tag('p', 'compl compl--missing', '◌ Sugerencia; una prueba podría demostrarla (repite check en Executor).'));
    }

    // patch
    if (f.patch?.content) {
      const box = tag('div', 'patch-box');
      const copy = tag('button', 'btn btn--ghost btn--sm patch-copy');
      copy.type = 'button';
      copy.textContent = 'Copiar parche';
      copy.setAttribute('aria-label', 'Copiar contenido del parche');
      copy.addEventListener('click', () => copyText(f.patch.content, 'Parche copiado'));
      box.append(copy);
      const code = document.createElement('code');
      code.className = 'patch-code';
      if (f.patch.format === 'diff') {
        // líneas +/- con SÍMBOLO VISIBLE y color (§Etapa 6: no solo color)
        code.replaceChildren(...f.patch.content.split('\n').map((line) => {
          const div = document.createElement('div');
          if (line.startsWith('+')) { div.className = 'diff-add'; div.textContent = line.slice(1).trim(); }
          else if (line.startsWith('-')) { div.className = 'diff-del'; div.textContent = line.slice(1).trim(); }
          else { div.textContent = line; }
          return div;
        }));
      } else {
        code.textContent = f.patch.content; // código plano con textContent
      }
      box.append(code);
      body.append(box);
    }

    details.append(summary, body);
    // resaltar rango citado al abrir el acordeón
    details.addEventListener('toggle', () => {
      citedRanges = citedRanges.filter((r) => !(r.file === f.file && r.start === f.lines?.[0]));
      if (details.open && f.file && f.lines) {
        citedRanges.push({ file: f.file, start: f.lines[0], end: f.lines[1] ?? f.lines[0] });
      }
      applyCited();
    });
    return details;
  });
  setChildren(list, nodes);
  el('#review-save').removeAttribute('hidden');
}

async function runReview() {
  const status = el('#review-status');
  try {
    if (status) status.textContent = 'Revisando…';
    const { data } = await api('/api/code/review', { method: 'POST', body: { files: ['demo-store/src/cart.js'] } });
    renderFindings(data);
    if (status) status.textContent = '';
    // citamos el primer hallazgo con ubicación
    const first = (data.findings ?? []).find((f) => f.file && f.lines);
    if (first) jumpTo(first.file, first.lines[0], first.lines[1] ?? first.lines[0]);
  } catch (e) {
    const msg = `${e instanceof ApiError ? e.code : 'ERROR'}: ${e.message}`;
    if (status) status.textContent = msg;
    toastError(msg);
  }
}

function initFilters() {
  const on = () => {
    const sevs = [...document.querySelectorAll('[data-sev]')].filter((c) => c.checked).map((c) => c.dataset.sev);
    const cats = [...document.querySelectorAll('[data-cat]')].filter((c) => c.checked).map((c) => c.dataset.cat);
    for (const details of document.querySelectorAll('.review-finding')) {
      const ok = sevs.includes(details.dataset.sev) && cats.includes(details.dataset.cat);
      details.style.display = ok ? '' : 'none';
    }
  };
  document.querySelectorAll('.review-filters input').forEach((c) => c.addEventListener('change', on));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

export function bootCode() {
  if (!el('#code-view')) return; // no es la vista Code

  // El visor se alimenta de mock/code-view.json vía fetch directo: no hay
  // endpoint /api en el contrato para el ESTÁTICO del código demo (el código
  // es contenido del repo demo-store, no un análisis).
  (async () => {
    try {
      const res = await fetch('/mock/code-view.json');
      if (!res.ok) throw new Error(`mock/code-view.json no disponible (${res.status})`);
      const data = await res.json();
      sources = data.sources ?? {};
      files = data.files ?? [];
      initViewer();
    } catch (e) {
      toastError(`Visor no disponible: ${e.message}`);
    }
  })();

  el('#code-src').addEventListener('change', () => selectFile(el('#code-src').value));
  el('#explain-run').addEventListener('click', runExplain);
  el('#review-run').addEventListener('click', runReview);
  // revisar al iniciar (mock) para tener hallazgos visibles de inmediato
  runReview();
  initFilters();

  // tabs del panel derecho
  const tabs = [['explain', '#tab-explain', '#panel-explain'], ['review', '#tab-review', '#panel-review']];
  tabs.forEach(([m, tabSel, panelSel]) => {
    const tab = el(tabSel);
    tab.addEventListener('click', () => {
      tabs.forEach(([m2, ts, ps]) => {
        el(ts).setAttribute('aria-selected', String(m2 === m));
        el(ts).setAttribute('tabindex', m2 === m ? '0' : '-1');
        el(ps).toggleAttribute('hidden', m2 !== m);
      });
      tab.focus();
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const idx = tabs.findIndex(([mm]) => mm === m);
      const next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : -1) + 2) % 2];
      el(next[1]).click();
    });
  });
  window.addEventListener('beforeunload', () => { citedRanges = []; });
}
