// Operaciones de alto nivel (las usan la CLI, el panel y las herramientas de los agentes BoxLang).
import fs from 'node:fs';
import path from 'node:path';
import { BASE_CHECKS, DATA_DIR, ROOT, TARGETS, ensureDir, isInside, nowIso, relPath } from './util.js';
import { runChecks, runChecksAsync } from './runner.js';
import { attachFixVerification, attachReproduction, diagnose } from './debug.js';
import { explainSymbol } from './explain.js';
import { markDemonstrated, reviewFiles } from './review.js';
import { generateChecks, getRequirement } from './requirements.js';
import { renderReport } from './report.js';
import { saveAnalysis } from './history.js';

function persist(rec, artifacts = []) {
  const stamped = { ...rec, createdAt: nowIso() };
  const report = renderReport(stamped);
  const id = saveAnalysis({ ...rec, report }, artifacts);
  const dir = ensureDir(path.join(DATA_DIR, 'reports'));
  const file = path.join(dir, `analysis-${id}.md`);
  fs.writeFileSync(file, report);
  return { id, report, reportFile: file, record: stamped };
}

function checkFiles(reqId) {
  const files = [BASE_CHECKS];
  if (reqId) files.push(generateChecks(reqId).file);
  return files;
}

export function runVerify({ reqId = null, target = 'both' } = {}) {
  const files = checkFiles(reqId);
  const targets = target === 'both' ? ['buggy', 'fixed'] : [target];
  const runs = targets.map((t) => runChecks({ files, target: t }));
  const first = runs[0];
  const bad = first.summary.fail + first.summary.error;
  const rec = {
    type: 'verify',
    title: `Verificación${reqId ? ` de ${reqId}` : ' base'} (${targets.join(' + ')})`,
    status: first.runnerError ? 'ERROR_DE_EJECUCION' : bad ? 'FALLA' : 'OK',
    summary: `${targets[0]}: ${first.summary.pass} PASS, ${first.summary.fail} FAIL, ${first.summary.error} ERROR${runs[1] ? ` · ${targets[1]}: ${runs[1].summary.pass}/${runs[1].summary.total} PASS` : ''}`,
    data: { reqId, runs },
  };
  const artifacts = first.results.filter((r) => r.error).map((r) => ({ kind: 'trace', name: r.id, content: r.error.stack }));
  return { ...persist(rec, artifacts), runs };
}

export async function runVerifyAsync({ reqId = null, target = 'both' } = {}) {
  const files = checkFiles(reqId);
  const targets = target === 'both' ? ['buggy', 'fixed'] : [target];
  const runs = [];
  for (const t of targets) runs.push(await runChecksAsync({ files, target: t }));
  const first = runs[0];
  const bad = first.summary.fail + first.summary.error;
  const rec = {
    type: 'verify',
    title: `Verificación${reqId ? ` de ${reqId}` : ' base'} (${targets.join(' + ')})`,
    status: first.runnerError ? 'ERROR_DE_EJECUCION' : bad ? 'FALLA' : 'OK',
    summary: `${targets[0]}: ${first.summary.pass} PASS, ${first.summary.fail} FAIL, ${first.summary.error} ERROR${runs[1] ? ` · ${targets[1]}: ${runs[1].summary.pass}/${runs[1].summary.total} PASS` : ''}`,
    data: { reqId, runs },
  };
  const artifacts = runs.flatMap((run) => run.results.filter((r) => r.error).map((r) => ({
    kind: 'trace',
    name: `${run.target}:${r.id}`,
    content: r.error.stack,
  })));
  return { ...persist(rec, artifacts), runs };
}

/** Devuelve la traza real de una prueba fallida (para alimentar el modo Debug). */
export function realTrace(checkId = 'BASE-FRESH-LOAD', target = 'buggy', reqId = null) {
  const run = runChecks({ files: checkFiles(reqId), target });
  const r = run.results.find((x) => x.id === checkId);
  if (!r) throw new Error(`No existe la prueba ${checkId}`);
  if (!r.error) throw new Error(`${checkId} pasa en ${target}: no hay traza que mostrar.`);
  return r.error.stack;
}

export function runDebug({ log, reproduce = true, verifyFix = true, reqId = null }) {
  const diag = diagnose({ log });
  let runs = [];
  if (reproduce) {
    const run = runChecks({ files: checkFiles(reqId), target: 'buggy' });
    attachReproduction(diag, run);
    runs.push(run);
    if (verifyFix && diag.reproduction.reproduced) {
      const fixed = runChecks({ files: checkFiles(reqId), target: 'fixed' });
      attachFixVerification(diag, fixed);
      runs.push(fixed);
    }
  }
  const top = diag.hypotheses[0];
  const rec = {
    type: 'debug',
    title: `Error: ${diag.error.name}: ${diag.error.message}`.slice(0, 140),
    status: top.status === 'correccion_verificada' ? 'CORRECCION_VERIFICADA' : diag.reproduction?.reproduced ? 'REPRODUCIDO' : 'HIPOTESIS',
    summary: `${diag.hypotheses.length} hipótesis; la principal: ${top.title} (${top.status}).`,
    data: { diagnosis: diag },
  };
  return { ...persist(rec, [{ kind: 'log', name: 'log-original', content: String(log) }]), diagnosis: diag };
}

export function runExplain({ symbol, target = 'buggy' }) {
  const explanation = explainSymbol({ symbol, target });
  const rec = { type: 'explain', title: `Explicación: ${symbol}()`, status: 'GUARDADO', summary: `${explanation.file}:${explanation.lines[0]}-${explanation.lines[1]}, ${explanation.flow.length} puntos de flujo, ${explanation.callers.length} llamador(es).`, data: { explanation } };
  return { ...persist(rec), explanation };
}

const REVIEWABLE = () => [path.join(TARGETS.buggy, 'src'), path.join(TARGETS.fixed, 'src')];
export function resolveReviewFile(file) {
  const abs = path.resolve(ROOT, file);
  if (!REVIEWABLE().some((d) => isInside(abs, d)) || !fs.existsSync(abs) || !/\.m?js$/.test(abs)) {
    throw new Error(`Solo se revisan archivos .js de demo-store/src o demo-store-fixed/src (recibido: ${file}).`);
  }
  return abs;
}

export function runReview({ files, reqId = null }) {
  const abs = [...new Set(files.map(resolveReviewFile))];
  const target = abs.every((f) => isInside(f, TARGETS.fixed)) ? 'fixed' : 'buggy';
  let findings = reviewFiles({ files: abs, target });
  if (reqId) findings = markDemonstrated(findings, runChecks({ files: checkFiles(reqId), target }));
  const names = abs.map(relPath).join(', ');
  const rec = {
    type: 'review',
    title: `Revisión de ${abs.map((f) => path.basename(f)).join(', ')}`,
    status: `${findings.length} HALLAZGOS`,
    summary: `${names}: ${findings.filter((f) => f.severity === 'alta').length} alta, ${findings.filter((f) => f.kind === 'demostrado').length} demostrados por pruebas.`,
    data: { files: abs.map(relPath), reqId, findings },
  };
  return { ...persist(rec), findings };
}

export function saveRequirementSnapshot(reqId) {
  const d = getRequirement(reqId);
  const rec = { type: 'requirements', title: `Requisito ${d.id}: ${d.objective}`.slice(0, 140), status: d.status, summary: d.approval ? `Aprobado por ${d.approval.by}.` : `${d.questions.length} pregunta(s) pendiente(s).`, data: d };
  return persist(rec);
}
