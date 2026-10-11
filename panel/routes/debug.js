import { runDebug } from '../../engine/service.js';
import { httpError, jsonResult, validateObject } from './shared.js';

export async function handle(req, url, body) {
  if (req.method !== 'POST' || url.pathname !== '/api/debug/analyze') {
    throw httpError(404, 'NOT_FOUND', 'Ruta de diagnóstico no encontrada.');
  }
  validateObject(body);
  if (typeof body.log !== 'string' || !body.log.trim() || body.log.length > 50_000) {
    throw httpError(400, 'VALIDATION', 'log debe contener entre 1 y 50000 caracteres.');
  }
  if (body.requirementId !== undefined && body.requirementId !== null && typeof body.requirementId !== 'string') {
    throw httpError(400, 'VALIDATION', 'requirementId debe ser texto o null.');
  }
  const result = runDebug({ log: body.log, reqId: body.requirementId || null });
  const diag = result.diagnosis;
  const hypotheses = diag.hypotheses.map((hyp, index) => {
    const linesByFile = new Map();
    for (const item of hyp.evidence ?? []) {
      const lines = linesByFile.get(item.file) ?? [];
      lines.push(item.line);
      linesByFile.set(item.file, lines);
    }
    return {
      id: `hyp_${result.id}_${index + 1}`,
      text: hyp.statement,
      status: hyp.status === 'correccion_verificada' ? 'correction_verified'
        : hyp.status === 'error_reproducido' ? 'reproduced' : 'hypothesis',
      evidence: [...linesByFile].map(([file, lines]) => ({
        file,
        lines: [Math.min(...lines), Math.max(...lines)],
        snippet: (hyp.evidence ?? []).filter((e) => e.file === file).map((e) => e.text).join('\n'),
      })),
      reproduceWith: diag.reproduction?.reproduced ? `POST /api/executor/run con check ${diag.reproduction.checkId}` : null,
    };
  });
  const status = result.record.status === 'CORRECCION_VERIFICADA' ? 'CORRECTION_VERIFIED'
    : result.record.status === 'REPRODUCIDO' ? 'REPRODUCED' : 'HYPOTHESIS';
  return jsonResult({
    id: `dbg_${result.id}`,
    status,
    ladderLevel: status === 'CORRECTION_VERIFIED' ? 3 : status === 'REPRODUCED' ? 2 : 1,
    logSummary: `${diag.error.name}: ${diag.error.message}`.slice(0, 300),
    hypotheses,
  });
}
