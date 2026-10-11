#!/usr/bin/env node
// SuckLess CLI. Núcleo determinista y verificable; los agentes BoxLang lo usan como herramienta.
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { approveRequirement, answerRequirement, generateChecks, getRequirement, listRequirements, startRequirement } from './requirements.js';
import { realTrace, runDebug, runExplain, runReview, runVerify, saveRequirementSnapshot } from './service.js';
import { deleteAnalysis, getAnalysis, listAnalyses } from './history.js';
import { renderReport } from './report.js';

const USAGE = `SuckLess — entiende, revisa, corrige, comprueba.

  req start "<texto>"                 Abre un requisito y muestra las preguntas pendientes
  req answer <id> [--set k=v]... [--actor ..] [--behavior ..] [--input ..]... [--error ..]... [--criterion ..]... [--edge-case ..]... [--file respuestas.json]
  req show <id> | req list
  req approve <id> --by "Nombre"      Solo una persona aprueba
  gen <id>                            Genera pruebas desde un requisito aprobado
  verify [--req <id>] [--target buggy|fixed|both]
  trace [<checkId>] [--target ..]     Traza real de una prueba fallida
  debug [--log archivo | stdin] [--req <id>] [--no-reproduce]
  explain <función>
  review <archivo>... [--req <id>]
  history list [--q texto] [--type t] | show <id> | delete <id>
  report <id> [--out archivo.md]`;

const { values: v, positionals: p } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: { by: { type: 'string' }, req: { type: 'string' }, target: { type: 'string' }, log: { type: 'string' }, q: { type: 'string' }, type: { type: 'string' }, out: { type: 'string' }, file: { type: 'string' }, actor: { type: 'string' }, behavior: { type: 'string' }, set: { type: 'string', multiple: true }, input: { type: 'string', multiple: true }, error: { type: 'string', multiple: true }, criterion: { type: 'string', multiple: true }, 'edge-case': { type: 'string', multiple: true }, 'no-reproduce': { type: 'boolean' } },
});

const show = (r) => {
  console.log(r.report);
  console.log(`\n→ Guardado en el historial como #${r.id} · reporte: ${r.reportFile}`);
};
const printReq = (d) => {
  console.log(`${d.id} · ${d.status}\nObjetivo: ${d.objective}`);
  if (d.rules.length) console.log(`Reglas acordadas:\n${d.rules.map((x) => `  - ${x}`).join('\n')}`);
  if (d.questions.length) {
    console.log('\nPreguntas pendientes (SuckLess no supone las respuestas):');
    d.questions.forEach((q, i) => console.log(`  ${i + 1}. ${q.text}${q.options ? `\n     → --set ${q.id}=<${Object.keys(q.options).join('|')}>   (${Object.entries(q.options).map(([k, l]) => `${k}: ${l}`).join('; ')})` : `\n     → ${q.id}`}`));
  }
  if (d.status === 'LISTO_PARA_REVISAR') console.log(`\nListo para revisión humana. Para aprobar: req approve ${d.id} --by "Tu nombre"`);
  if (d.status === 'APROBADO') console.log(`\nAprobado por ${d.approval.by}. Siguiente: gen ${d.id} / verify --req ${d.id}`);
};

async function main() {
  const [cmd, sub, ...rest] = p;
  switch (cmd) {
    case 'req': {
      if (sub === 'start') return printReq(startRequirement(rest.join(' ')));
      if (sub === 'list') return console.table(listRequirements());
      if (sub === 'show') return printReq(getRequirement(rest[0]));
      if (sub === 'answer') {
        const patch = v.file ? JSON.parse(fs.readFileSync(v.file, 'utf8')) : {};
        if (v.actor) patch.actor = v.actor;
        if (v.behavior) patch.expectedBehavior = v.behavior;
        if (v.input) patch.inputs = v.input;
        if (v.error) patch.errors = v.error;
        if (v.criterion) patch.acceptance = v.criterion;
        if (v['edge-case']) patch.edgeCases = v['edge-case'];
        for (const kv of v.set ?? []) {
          const [k, val] = kv.split('=');
          patch.decisions = { ...patch.decisions, [k]: val };
        }
        return printReq(answerRequirement(rest[0], patch));
      }
      if (sub === 'approve') {
        const d = approveRequirement(rest[0], v.by);
        printReq(d);
        return show(saveRequirementSnapshot(d.id));
      }
      break;
    }
    case 'gen': {
      const g = generateChecks(sub);
      return console.log(`Pruebas generadas (${g.count}): ${g.ids.join(', ')}\nArchivo: ${g.file}`);
    }
    case 'verify': return show(runVerify({ reqId: v.req ?? null, target: v.target ?? 'both' }));
    case 'trace': return console.log(realTrace(sub ?? 'BASE-FRESH-LOAD', v.target ?? 'buggy', v.req ?? null));
    case 'debug': {
      const log = v.log ? fs.readFileSync(v.log, 'utf8') : fs.readFileSync(0, 'utf8');
      return show(runDebug({ log, reproduce: !v['no-reproduce'], reqId: v.req ?? null }));
    }
    case 'explain': return show(runExplain({ symbol: sub, target: v.target ?? 'buggy' }));
    case 'review': return show(runReview({ files: [sub, ...rest].filter(Boolean), reqId: v.req ?? null }));
    case 'history': {
      if (sub === 'list') return console.table(listAnalyses({ q: v.q ?? null, type: v.type ?? null }).map(({ id, type, title, status, created_at }) => ({ id, type, status, title: title.slice(0, 60), created_at })));
      if (sub === 'show') {
        const a = getAnalysis(rest[0]);
        if (!a) throw new Error(`No existe el análisis #${rest[0]}`);
        return console.log(a.report);
      }
      if (sub === 'delete') return console.log(deleteAnalysis(rest[0]) ? `Análisis #${rest[0]} eliminado junto con sus datos asociados.` : `No existe el análisis #${rest[0]}`);
      break;
    }
    case 'report': {
      const a = getAnalysis(sub);
      if (!a) throw new Error(`No existe el análisis #${sub}`);
      const md = a.report || renderReport(a);
      if (v.out) { fs.writeFileSync(v.out, md); return console.log(`Escrito ${v.out}`); }
      return console.log(md);
    }
    default:
  }
  console.log(USAGE);
  if (cmd) process.exitCode = 2;
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
