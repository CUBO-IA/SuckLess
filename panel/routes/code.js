import { TARGETS, listSourceFiles, relPath } from '../../engine/util.js';
import { readSource } from '../../engine/code.js';
import { runExplain, runReview } from '../../engine/service.js';
import { httpError, jsonResult, validateObject } from './shared.js';

function enumValue(value, mapping, label) {
  if (!Object.hasOwn(mapping, value)) {
    throw httpError(500, 'INTERNAL', `Valor interno de ${label} no reconocido: ${value}.`);
  }
  return mapping[value];
}

export async function handle(req, url, body) {
  if (req.method === 'GET' && url.pathname === '/api/files') {
    const files = [...new Set([TARGETS.buggy, TARGETS.fixed].flatMap((root) => listSourceFiles(root).map(relPath)))];
    const symbols = [...new Set(listSourceFiles(TARGETS.buggy).flatMap((file) => readSource(file).fns.map((fn) => fn.name)))];
    return jsonResult({ files, symbols });
  }
  if (req.method === 'POST' && url.pathname === '/api/code/explain') {
    validateObject(body);
    if (typeof body.symbol !== 'string' || !body.symbol.trim()) throw httpError(400, 'VALIDATION', 'symbol es obligatorio.');
    const result = runExplain({ symbol: body.symbol.trim() });
    const explanation = result.explanation;
    return jsonResult({
      id: `exp_${result.id}`,
      status: 'OK',
      symbol: explanation.symbol,
      summary: result.record.summary,
      steps: explanation.flow.map((step) => ({
        text: step.note || step.text,
        file: explanation.file,
        lines: [step.line, step.line],
      })),
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/code/review') {
    validateObject(body);
    if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > 20 || body.files.some((f) => typeof f !== 'string')) {
      throw httpError(400, 'VALIDATION', 'files debe contener entre 1 y 20 rutas de archivo.');
    }
    if (body.requirementId !== undefined && body.requirementId !== null && typeof body.requirementId !== 'string') {
      throw httpError(400, 'VALIDATION', 'requirementId debe ser texto o null.');
    }
    const result = runReview({ files: body.files, reqId: body.requirementId || null });
    const findings = result.findings.map((finding, index) => ({
      id: `fin_${result.id}_${index + 1}`,
      severity: enumValue(finding.severity, { alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' }, 'severidad'),
      category: enumValue(finding.category, { lógica: 'LOGICA', seguridad: 'SEGURIDAD', calidad: 'CALIDAD' }, 'categoría'),
      file: finding.file ?? null,
      lines: finding.lines ?? null,
      evidence: finding.evidence,
      impact: finding.impact,
      recommendation: finding.recommendation,
      patch: finding.patch ? { format: 'text', language: 'javascript', content: finding.patch } : null,
      proven: finding.kind === 'demostrado',
    }));
    return jsonResult({ id: `rev_${result.id}`, status: findings.length ? 'FINDINGS' : 'OK', findings });
  }
  throw httpError(404, 'NOT_FOUND', 'Ruta de código no encontrada.');
}
