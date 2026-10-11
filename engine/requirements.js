// Requirements Gate: no se inventa lo que falta. Pregunta, estructura y exige aprobación humana.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ensureDir, nowIso, readJson, writeJson } from './util.js';
import { redactDeep } from './redact.js';

export const STATUS = { INCOMPLETE: 'INCOMPLETO', READY: 'LISTO_PARA_REVISAR', APPROVED: 'APROBADO' };

const FIELDS = [
  { id: 'actor', kind: 'text', text: '¿Quién usa esta función (actor)?' },
  { id: 'expectedBehavior', kind: 'text', text: '¿Qué debe ocurrir exactamente (comportamiento esperado)?' },
  { id: 'inputs', kind: 'list', text: '¿Qué datos de entrada recibe?' },
  { id: 'errors', kind: 'list', text: '¿Qué errores o casos límite pueden ocurrir y cómo se responde?' },
  { id: 'acceptance', kind: 'list', text: '¿Qué criterios de aceptación (en lenguaje natural) confirmarían que está bien?' },
];

// Decisiones de negocio que, si faltan, impiden avanzar (dominio: descuentos/cupones).
const DOMAINS = {
  discounts: {
    detect: /descuent|cup[oó]n|promoci/i,
    decisions: [
      { id: 'combinable', text: '¿Se pueden combinar varios cupones en un mismo carrito?', options: { no: 'No: máximo un cupón', yes: 'Sí: los descuentos se suman' } },
      { id: 'expired', text: '¿Qué pasa cuando un cupón está vencido?', options: { reject: 'Se rechaza con error', ignore: 'Se ignora sin error (no descuenta)' } },
      { id: 'taxOrder', text: '¿El descuento se aplica antes o después de impuestos?', options: { before_tax: 'Antes de impuestos', after_tax: 'Después de impuestos' } },
      { id: 'persistCoupons', text: '¿El cupón aplicado debe conservarse al recargar?', options: { yes: 'Sí', no: 'No (solo los ítems)' } },
    ],
  },
};

const dir = () => ensureDir(path.join(DATA_DIR, 'requirements'));
const fileOf = (id) => {
  if (!/^REQ-[a-f0-9]{6}$/.test(id)) throw new Error(`Id de requisito inválido: ${id}`);
  return path.join(dir(), `${id}.json`);
};
const toList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/\n|;/)).map((s) => String(s).trim()).filter(Boolean);

export function detectDomain(text) {
  return Object.keys(DOMAINS).find((k) => DOMAINS[k].detect.test(text)) ?? null;
}

export function derivedRules(draft) {
  if (draft.domain !== 'discounts') return [];
  const d = draft.decisions;
  const r = ['Un cupón porcentual descuenta ese % del subtotal; uno fijo descuenta su monto.'];
  if (d.combinable === 'no') r.push('Un carrito admite como máximo un cupón; el segundo se rechaza con COUPON_NOT_COMBINABLE.');
  if (d.combinable === 'yes') r.push('Se pueden combinar varios cupones; los descuentos se suman.');
  if (d.expired === 'reject') r.push('Un cupón vencido se rechaza con COUPON_EXPIRED.');
  if (d.expired === 'ignore') r.push('Un cupón vencido se ignora: no descuenta y no genera error.');
  if (d.taxOrder === 'before_tax') r.push('El descuento se aplica antes de impuestos (IVA 13 %).');
  if (d.taxOrder === 'after_tax') r.push('El descuento se resta después de aplicar impuestos (IVA 13 %).');
  if (d.persistCoupons === 'yes') r.push('El cupón aplicado se conserva al recargar.');
  if (d.persistCoupons === 'no') r.push('Los cupones no se conservan al recargar; solo los ítems.');
  return r;
}

/** Preguntas pendientes. Sin preguntas => el documento está completo. */
export function computeMissing(draft) {
  const q = [];
  for (const f of FIELDS) {
    const v = draft[f.id];
    if (f.kind === 'list' ? !v?.length : !v) q.push({ id: f.id, field: f.id, text: f.text, type: f.kind });
  }
  if (draft.domain) {
    for (const dec of DOMAINS[draft.domain].decisions) {
      if (!draft.decisions[dec.id]) q.push({ id: dec.id, field: `decisions.${dec.id}`, text: dec.text, type: 'choice', options: dec.options });
    }
  } else if (!draft.rules.length) {
    q.push({ id: 'rules', field: 'rules', text: '¿Qué reglas de negocio aplican?', type: 'list' });
  }
  return q;
}

export function contentHash(d) {
  const core = { objective: d.objective, actor: d.actor, expectedBehavior: d.expectedBehavior, inputs: d.inputs, errors: d.errors, acceptance: d.acceptance, rules: d.rules, decisions: d.decisions };
  return crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex');
}

function refresh(d, event) {
  d.rules = d.domain ? derivedRules(d) : d.rules;
  const missing = computeMissing(d);
  if (d.approval && d.approval.hash !== contentHash(d)) {
    d.history.push({ at: nowIso(), event: 'Aprobación invalidada: el contenido cambió después de aprobar' });
    d.approval = null;
  }
  d.status = d.approval ? STATUS.APPROVED : missing.length ? STATUS.INCOMPLETE : STATUS.READY;
  d.questions = missing;
  d.updatedAt = nowIso();
  if (event) d.history.push({ at: d.updatedAt, event });
  writeJson(fileOf(d.id), redactDeep(d));
  return d;
}

export function startRequirement(text) {
  const objective = String(text ?? '').trim();
  if (objective.length < 5) throw new Error('Describe el requisito con al menos unas palabras.');
  const draft = {
    id: `REQ-${crypto.randomBytes(3).toString('hex')}`,
    createdAt: nowIso(),
    objective,
    domain: detectDomain(objective),
    actor: '', expectedBehavior: '', inputs: [], rules: [], errors: [], acceptance: [],
    decisions: {},
    approval: null,
    history: [],
  };
  return refresh(draft, 'Requisito recibido; faltan datos');
}

export function getRequirement(id) {
  const f = fileOf(id);
  if (!fs.existsSync(f)) throw new Error(`No existe el requisito ${id}`);
  return readJson(f);
}

export function listRequirements() {
  return fs.readdirSync(dir()).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dir(), f)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ id, objective, status, createdAt, approval }) => ({ id, objective, status, createdAt, approvedBy: approval?.by ?? null }));
}

/** Aplica respuestas. Editar un requisito aprobado invalida la aprobación. */
export function answerRequirement(id, patch) {
  const d = getRequirement(id);
  const changed = [];
  for (const f of FIELDS) {
    if (patch[f.id] === undefined) continue;
    d[f.id] = f.kind === 'list' ? toList(patch[f.id]) : String(patch[f.id]).trim();
    changed.push(f.id);
  }
  if (patch.objective) { d.objective = String(patch.objective).trim(); d.domain = detectDomain(d.objective) ?? d.domain; changed.push('objective'); }
  if (patch.rules !== undefined && !d.domain) { d.rules = toList(patch.rules); changed.push('rules'); }
  for (const [k, v] of Object.entries(patch.decisions ?? {})) {
    const dec = d.domain && DOMAINS[d.domain].decisions.find((x) => x.id === k);
    if (!dec) throw new Error(`Decisión desconocida para este requisito: ${k}`);
    if (!(v in dec.options)) throw new Error(`Valor inválido para ${k}: "${v}". Opciones: ${Object.keys(dec.options).join(', ')}`);
    d.decisions[k] = v;
    changed.push(`decisions.${k}`);
  }
  return refresh(d, `Respuestas recibidas: ${changed.join(', ') || '(ninguna)'}`);
}

/** Solo una persona aprueba, y solo un documento completo. El agente de IA NO tiene acceso a esta función. */
export function approveRequirement(id, by) {
  const d = getRequirement(id);
  if (!String(by ?? '').trim()) throw new Error('La aprobación requiere el nombre de quien aprueba (--by).');
  if (d.status === STATUS.APPROVED) throw new Error(`${id} ya está aprobado.`);
  if (d.status !== STATUS.READY) throw new Error(`${id} está ${d.status}: faltan ${d.questions.length} respuesta(s). No se puede aprobar.`);
  d.approval = { by: String(by).trim(), at: nowIso(), hash: contentHash(d) };
  return refresh(d, `Aprobado por ${d.approval.by}`);
}

const r2 = (n) => Math.round(n * 100) / 100;

/** Genera pruebas ejecutables SOLO desde un requisito aprobado y sin cambios posteriores. */
export function generateChecks(id) {
  const d = getRequirement(id);
  if (d.status !== STATUS.APPROVED || !d.approval || d.approval.hash !== contentHash(d)) {
    throw new Error(`${id} no está aprobado: no se generan pruebas desde requisitos sin aprobación humana.`);
  }
  if (d.domain !== 'discounts') {
    throw new Error('El MVP solo genera pruebas ejecutables para el dominio descuentos/cupones. Los criterios en texto quedan documentados.');
  }
  const x = d.decisions;
  const net = x.taxOrder === 'before_tax';
  const totalPct = r2(net ? (40 - 4) * 1.13 : 40 * 1.13 - 4);
  const totalFix = r2(net ? (40 - 5) * 1.13 : 40 * 1.13 - 5);
  const T = '2026-10-10';
  const defs = [];
  const add = (id2, title, criterion, tags, body) => defs.push({ id2, title, criterion, tags, body });

  add('AC-PERCENT', 'Cupón porcentual descuenta el % del subtotal', 'SAVE10 sobre 2 × 20.00 descuenta 4.00', ['coupon-percent'], `
      const c = cart.createCart();
      cart.addItem(c, 'SKU-1', 2);
      cart.applyCoupon(c, 'SAVE10', '${T}');
      near(cart.discount(c), 4, 'descuento de SAVE10 sobre 40.00');
      near(cart.total(c), ${totalPct}, 'total con IVA');`);
  add('AC-EXPIRED', x.expired === 'reject' ? 'Un cupón vencido se rechaza' : 'Un cupón vencido se ignora', x.expired === 'reject' ? 'OLD20 (vence 2025-01-01) lanza COUPON_EXPIRED' : 'OLD20 vencido no descuenta ni falla', ['coupon-expired'],
    x.expired === 'reject' ? `
      const c = cart.createCart();
      cart.addItem(c, 'SKU-1', 1);
      assert.throws(() => cart.applyCoupon(c, 'OLD20', '${T}'), (e) => e.code === 'COUPON_EXPIRED', 'un cupón vencido debe rechazarse con COUPON_EXPIRED');`
    : `
      const c = cart.createCart();
      cart.addItem(c, 'SKU-1', 1);
      cart.applyCoupon(c, 'OLD20', '${T}');
      near(cart.discount(c), 0, 'un cupón vencido no debe descontar');`);
  add('AC-COMBINE', x.combinable === 'no' ? 'No se combinan cupones' : 'Los cupones se combinan y suman', x.combinable === 'no' ? 'Segundo cupón lanza COUPON_NOT_COMBINABLE' : 'SAVE10 + FIVEOFF descuentan 9.00', ['coupon-combine'],
    x.combinable === 'no' ? `
      const c = cart.createCart();
      cart.addItem(c, 'SKU-1', 2);
      cart.applyCoupon(c, 'SAVE10', '${T}');
      assert.throws(() => cart.applyCoupon(c, 'FIVEOFF', '${T}'), (e) => e.code === 'COUPON_NOT_COMBINABLE', 'el segundo cupón debe rechazarse con COUPON_NOT_COMBINABLE');`
    : `
      const c = cart.createCart();
      cart.addItem(c, 'SKU-1', 2);
      cart.applyCoupon(c, 'SAVE10', '${T}');
      cart.applyCoupon(c, 'FIVEOFF', '${T}');
      near(cart.discount(c), 9, 'descuento combinado');`);
  add('AC-TAX', net ? 'El descuento se aplica antes de impuestos' : 'El descuento se aplica después de impuestos', `FIVEOFF sobre 40.00 => total ${totalFix}`, ['tax-order'], `
      const c = cart.createCart();
      cart.addItem(c, 'SKU-1', 2);
      cart.applyCoupon(c, 'FIVEOFF', '${T}');
      near(cart.total(c), ${totalFix}, 'total con cupón fijo');`);
  add('AC-PERSIST', x.persistCoupons === 'yes' ? 'El cupón se conserva al recargar' : 'Los cupones no se conservan al recargar', x.persistCoupons === 'yes' ? 'Guardar y cargar conserva SAVE10' : 'Guardar y cargar deja la lista de cupones vacía', ['persist-coupon'], `
      const f = tmp();
      const c = cart.createCart();
      cart.addItem(c, 'SKU-1', 1);
      cart.applyCoupon(c, 'SAVE10', '${T}');
      store.saveCart(f, c);
      const back = store.loadCart(f);
      assert.deepEqual(back.coupons, ${x.persistCoupons === 'yes' ? "['SAVE10']" : '[]'}, 'estado de cupones tras recargar');`);

  const src = `// Generado por SuckLess desde ${d.id} (aprobado por ${d.approval.by} el ${d.approval.at}).
// No editar: se regenera desde el requisito aprobado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = process.env.SUCKLESS_STORE_DIR;
const load = (f) => import(pathToFileURL(path.join(dir, 'src', f)).href);
const cart = await load('cart.js');
const store = await load('store.js');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, \`\${msg}: se esperaba \${b} pero se obtuvo \${a}\`);
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'suckless-')), 'cart.json');

export const checks = [
${defs.map((c) => `  {
    id: ${JSON.stringify(c.id2)},
    title: ${JSON.stringify(c.title)},
    criterion: ${JSON.stringify(c.criterion)},
    tags: ${JSON.stringify(c.tags)},
    run() {${c.body}
    },
  },`).join('\n')}
];
`;
  const file = path.join(ensureDir(path.join(DATA_DIR, 'generated')), `checks.${d.id}.mjs`);
  fs.writeFileSync(file, src);
  return { file, count: defs.length, ids: defs.map((c) => c.id2) };
}
