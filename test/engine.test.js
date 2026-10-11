import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { redact } from '../engine/redact.js';
import * as R from '../engine/requirements.js';
import { runChecks } from '../engine/runner.js';
import { BASE_CHECKS, TARGETS } from '../engine/util.js';
import { parseStackTrace } from '../engine/debug.js';
import { runDebug, runExplain, runReview, runVerify, realTrace } from '../engine/service.js';
import { countArtifacts, deleteAnalysis, getAnalysis, listAnalyses } from '../engine/history.js';
import { findFunctions } from '../engine/code.js';

const ANSWERS = { actor: 'Cliente', expectedBehavior: 'Aplica el cupón', inputs: 'código', errors: 'cupón inválido', acceptance: 'Total correcto', edgeCases: 'Carrito vacío', decisions: { combinable: 'no', expired: 'reject', taxOrder: 'before_tax', persistCoupons: 'yes' } };
const approvedReq = () => {
  const d = R.startRequirement('El carrito debe aplicar descuentos');
  R.answerRequirement(d.id, ANSWERS);
  return R.approveRequirement(d.id, 'Equipo de prueba');
};

test('redact: elimina secretos comunes y conserva el resto', () => {
  const t = redact('Authorization: Bearer abc.def-123 password=hunter2 key sk-abcdefghijklmnopqrstuvwx url postgres://u:pw@host/db TypeError: x');
  for (const secret of ['abc.def-123', 'hunter2', 'sk-abcdefghijklmnopqrstuvwx', ':pw@']) assert.ok(!t.includes(secret), `quedó ${secret}`);
  assert.ok(t.includes('TypeError: x'));
});

test('gate: un requisito vago pregunta y no se puede aprobar ni generar pruebas', () => {
  const d = R.startRequirement('El carrito debe aplicar descuentos');
  assert.equal(d.status, 'INCOMPLETO');
  const ids = d.questions.map((q) => q.id);
  for (const id of ['combinable', 'expired', 'taxOrder', 'persistCoupons', 'actor']) assert.ok(ids.includes(id), id);
  assert.throws(() => R.approveRequirement(d.id, 'Ana'), /No se puede aprobar/);
  assert.throws(() => R.generateChecks(d.id), /no está aprobado/);
});

test('gate: valida opciones y exige nombre de quien aprueba', () => {
  const d = R.startRequirement('El carrito debe aplicar descuentos');
  assert.throws(() => R.answerRequirement(d.id, { decisions: { taxOrder: 'tal_vez' } }), /Valor inválido/);
  assert.throws(() => R.answerRequirement(d.id, { decisions: { inventada: 'x' } }), /desconocida/);
  R.answerRequirement(d.id, ANSWERS);
  assert.throws(() => R.approveRequirement(d.id, ''), /nombre/);
});

test('gate: aprobar -> generar; editar después invalida la aprobación', () => {
  const d = approvedReq();
  assert.equal(d.status, 'APROBADO');
  const g = R.generateChecks(d.id);
  assert.equal(g.count, 5);
  const edited = R.answerRequirement(d.id, { decisions: { taxOrder: 'after_tax' } });
  assert.equal(edited.status, 'LISTO_PARA_REVISAR');
  assert.equal(edited.approval, null);
  assert.throws(() => R.generateChecks(d.id), /no está aprobado/);
});

test('runner: el error sembrado falla en demo-store y pasa en demo-store-fixed', () => {
  const g = R.generateChecks(approvedReq().id);
  const before = runChecks({ files: [BASE_CHECKS, g.file], target: 'buggy' });
  const after = runChecks({ files: [BASE_CHECKS, g.file], target: 'fixed' });
  const failing = before.results.filter((r) => r.status !== 'PASS').map((r) => r.id).sort();
  assert.deepEqual(failing, ['AC-COMBINE', 'AC-EXPIRED', 'AC-PERCENT', 'AC-PERSIST', 'BASE-FRESH-LOAD']);
  assert.equal(before.results.find((r) => r.id === 'BASE-FRESH-LOAD').status, 'ERROR');
  assert.equal(after.summary.fail + after.summary.error, 0);
  assert.equal(after.summary.pass, 8);
});

test('runner: rechaza archivos fuera del proyecto y targets desconocidos', () => {
  assert.throws(() => runChecks({ files: ['/etc/passwd'] }), /no permitido/);
  assert.throws(() => runChecks({ files: [BASE_CHECKS], target: 'prod' }), /Target desconocido/);
});

test('debug: parsea trazas V8 y con formato corto (cart.js:27)', () => {
  const p = parseStackTrace("TypeError: boom\n    at addItem (file:///x/demo-store/src/cart.js:27:31)\n    at cart.js:5");
  assert.equal(p.name, 'TypeError');
  assert.equal(p.frames.length, 2);
  assert.equal(p.frames[1].line, 5);
});

test('debug: la traza real se diagnostica, se reproduce con una prueba y se verifica la corrección', () => {
  const log = realTrace('BASE-FRESH-LOAD');
  const r = runDebug({ log });
  const h = r.diagnosis.hypotheses[0];
  assert.deepEqual(r.diagnosis.candidateFiles, ['demo-store/src/cart.js']);
  assert.ok(h.evidence.some((e) => e.file === 'demo-store/src/store.js'));
  assert.equal(r.diagnosis.reproduction.reproduced, true);
  assert.equal(h.status, 'correccion_verificada');
  assert.match(r.report, /Corrección propuesta \(no aplicada\)/);
});

test('debug: un error que ninguna prueba reproduce queda como hipótesis (no se afirma)', () => {
  const r = runDebug({ log: "TypeError: x is not a function\n    at addItem (demo-store/src/cart.js:27:3)" });
  assert.equal(r.record.status, 'HIPOTESIS');
  assert.equal(r.diagnosis.reproduction.reproduced, false);
  assert.equal(r.diagnosis.hypotheses[0].status, 'pendiente_de_probar');
});

test('debug: rechaza texto sin error y redacta secretos del log guardado', () => {
  assert.throws(() => runDebug({ log: 'todo bien' }), /línea de error/);
  const r = runDebug({ log: "TypeError: Cannot read properties of undefined (reading 'find')\n  at addItem (cart.js:27:1)\n token=SECRETO123 ", reproduce: false });
  const saved = getAnalysis(r.id);
  assert.ok(!JSON.stringify(saved).includes('SECRETO123'));
});

test('explain: cita archivo y línea, llamadores y mutaciones', () => {
  const r = runExplain({ symbol: 'addItem' });
  assert.equal(r.explanation.file, 'demo-store/src/cart.js');
  assert.ok(r.explanation.flow.some((f) => f.kind === 'mutación'));
  assert.ok(r.explanation.callers.some((c) => c.file.endsWith('server.js')));
  assert.throws(() => runExplain({ symbol: 'noExiste' }), /No encontré/);
  assert.throws(() => runExplain({ symbol: 'a;b' }), /nombre de función/);
});

test('review: encuentra los errores sembrados y los marca demostrados solo con pruebas', () => {
  const files = ['demo-store/src/cart.js', 'demo-store/src/store.js', 'demo-store/src/server.js'];
  const potential = runReview({ files });
  const rules = potential.findings.map((f) => f.rule);
  for (const rule of ['expiracion-ignorada', 'porcentaje-sin-calcular', 'carga-devuelve-objeto-vacio', 'serializacion-parcial', 'cuerpo-sin-limite']) assert.ok(rules.includes(rule), rule);
  assert.ok(potential.findings.every((f) => f.kind === 'potencial'));
  const proven = runReview({ files, reqId: approvedReq().id });
  const byRule = (r) => proven.findings.find((f) => f.rule === r);
  assert.equal(byRule('expiracion-ignorada').kind, 'demostrado');
  assert.equal(byRule('porcentaje-sin-calcular').demonstratedBy[0], 'AC-PERCENT');
  assert.equal(byRule('cuerpo-sin-limite').kind, 'potencial');
});

test('review: la versión corregida no tiene hallazgos de severidad alta', () => {
  const r = runReview({ files: ['demo-store-fixed/src/cart.js', 'demo-store-fixed/src/store.js'] });
  assert.equal(r.findings.filter((f) => f.severity === 'alta').length, 0);
});

test('review: no revisa archivos fuera de las carpetas demo', () => {
  assert.throws(() => runReview({ files: ['engine/cli.js'] }), /Solo se revisan/);
  assert.throws(() => runReview({ files: ['../../etc/passwd'] }), /Solo se revisan/);
});

test('historial: guardar, buscar, abrir y borrar elimina también los datos asociados', () => {
  const v = runVerify({ target: 'buggy' });
  assert.ok(countArtifacts(v.id) >= 1);
  assert.ok(listAnalyses({ q: 'Verificación' }).some((a) => a.id === v.id));
  assert.ok(listAnalyses({ type: 'verify' }).every((a) => a.type === 'verify'));
  assert.equal(listAnalyses({ q: 'Verifi%ción' }).length, 0, 'los comodines LIKE se escapan');
  assert.equal(getAnalysis(v.id).data.runs[0].target, 'buggy');
  assert.equal(deleteAnalysis(v.id), true);
  assert.equal(getAnalysis(v.id), null);
  assert.equal(countArtifacts(v.id), 0);
  assert.equal(deleteAnalysis(v.id), false);
});

test('código: findFunctions soporta parámetros con valores por defecto con paréntesis', () => {
  const fns = findFunctions('export function f(a, today = new Date()) {\n  if (a) { return 1; }\n}\n');
  assert.equal(fns[0].name, 'f');
  assert.deepEqual(fns[0].params, ['a', 'today']);
  assert.deepEqual([fns[0].start, fns[0].end], [1, 3]);
});

test('reportes: se escriben a disco y no contienen rutas absolutas de la máquina', () => {
  const v = runVerify({ target: 'buggy' });
  assert.ok(fs.existsSync(v.reportFile));
  assert.ok(!v.report.includes(TARGETS.buggy));
});
