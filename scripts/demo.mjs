// Demo guiada de 2:30: requisito vago → preguntas → aprobación → pruebas → debug → explicar → review → historial.
// Todo es real: se ejecutan las pruebas y se guarda el historial. La aprobación humana se simula de forma EXPLÍCITA.
import * as R from '../engine/requirements.js';
import { realTrace, runDebug, runExplain, runReview, runVerify } from '../engine/service.js';
import { listAnalyses } from '../engine/history.js';

const step = (n, t) => console.log(`\n${'─'.repeat(70)}\n${n}. ${t}\n${'─'.repeat(70)}`);

step(1, 'Requisito vago');
let d = R.startRequirement('El carrito debe aplicar descuentos');
console.log(`"${d.objective}" → ${d.status}. SuckLess pregunta (no supone):`);
d.questions.filter((q) => q.type === 'choice').forEach((q) => console.log(`  • ${q.text}`));

step(2, 'El equipo responde y se completa el documento');
d = R.answerRequirement(d.id, { actor: 'Cliente de la tienda', expectedBehavior: 'El carrito descuenta según el cupón aplicado', inputs: 'código de cupón', errors: 'cupón inválido, vencido o repetido', acceptance: 'El total refleja el descuento correcto', decisions: { combinable: 'no', expired: 'reject', taxOrder: 'before_tax', persistCoupons: 'yes' } });
console.log(`${d.id} → ${d.status}\n${d.rules.map((r) => `  - ${r}`).join('\n')}`);

step(3, 'Aprobación humana (simulada explícitamente para esta demo)');
d = R.approveRequirement(d.id, 'Equipo SuckLess (demo)');
console.log(`${d.id} → ${d.status} por ${d.approval.by}. Recién ahora se generan pruebas.`);

step(4, 'Pruebas reales: antes y después de la corrección');
const v = runVerify({ reqId: d.id });
console.log(v.record.summary);

step(5, 'Modo Debug con la traza REAL del fallo');
const trace = realTrace('BASE-FRESH-LOAD');
console.log(trace.split('\n').slice(0, 3).join('\n'));
const dbg = runDebug({ log: trace, reqId: d.id });
const h = dbg.diagnosis.hypotheses[0];
console.log(`→ ${h.title} [${h.status}]\n  evidencia: ${h.evidence.map((e) => `${e.file}:${e.line}`).join(', ')}\n  ${h.suggestedFix}`);

step(6, 'Code Explainer');
const ex = runExplain({ symbol: 'addItem' });
console.log(`${ex.explanation.file}:${ex.explanation.lines.join('-')}\n${ex.explanation.flow.map((f) => `  ${f.line} ${f.kind}: ${f.note}`).join('\n')}`);

step(7, 'Code Review con pruebas');
const rv = runReview({ files: ['demo-store/src/cart.js', 'demo-store/src/store.js', 'demo-store/src/server.js'], reqId: d.id });
for (const f of rv.findings.filter((x) => x.severity === 'alta')) console.log(`  [${f.severity}/${f.kind}] ${f.file}:${f.lines[0]} ${f.rule}${f.demonstratedBy.length ? ` ← ${f.demonstratedBy.join(',')}` : ''}`);

step(8, 'Historial');
console.table(listAnalyses({ limit: 6 }).map(({ id, type, status, title }) => ({ id, type, status, title: title.slice(0, 52) })));
console.log('\nReportes .md en data/reports/. Abre el panel con: npm run panel');
