import { deleteAnalysis, getAnalysis, listAnalyses } from '../../engine/history.js';
import { httpError, jsonResult, idFromHistory, mapRequirementStatus } from './shared.js';

function statusOf(type, status, detail = null) {
  if (type === 'requirements') return mapRequirementStatus(status);
  if (type === 'verify') return ({ OK: 'PASS', FALLA: 'FAIL', ERROR_DE_EJECUCION: 'EXECUTOR_ERROR' })[status] ?? status;
  if (type === 'debug') return ({ HIPOTESIS: 'HYPOTHESIS', REPRODUCIDO: 'REPRODUCED', CORRECCION_VERIFICADA: 'CORRECTION_VERIFIED' })[status] ?? status;
  if (type === 'explain') return 'OK';
  if (type === 'review') return (detail?.data?.findings?.length ?? Number.parseInt(status, 10) ?? 0) > 0 ? 'FINDINGS' : 'OK';
  return status;
}

function analysis(id) {
  const item = getAnalysis(id);
  if (!item) throw httpError(404, 'NOT_FOUND', 'No existe el análisis solicitado.');
  return item;
}

export async function handle(req, url) {
  if (req.method === 'GET' && url.pathname === '/api/history') {
    const type = url.searchParams.get('type')?.toLowerCase() ?? null;
    const q = url.searchParams.get('q') || null;
    return jsonResult(listAnalyses({ type, q }).map((item) => ({
      id: String(item.id),
      type: item.type,
      title: item.title,
      status: statusOf(item.type, item.status),
      summary: item.summary,
      createdAt: item.created_at,
    })));
  }
  const exportMatch = url.pathname.match(/^\/api\/history\/([^/]+)\/export$/);
  if (req.method === 'GET' && exportMatch) {
    const id = idFromHistory(exportMatch[1]);
    const item = analysis(id);
    return { status: 200, text: item.report, contentType: 'text/markdown; charset=utf-8', headers: { 'Content-Disposition': `attachment; filename="${id}.md"` } };
  }
  const match = url.pathname.match(/^\/api\/history\/([^/]+)$/);
  if (match) {
    const id = idFromHistory(match[1]);
    if (req.method === 'GET') {
      const item = analysis(id);
      return jsonResult({ ...item, id: String(item.id), status: statusOf(item.type, item.status, item) });
    }
    if (req.method === 'DELETE') {
      analysis(id);
      return jsonResult({ deleted: deleteAnalysis(id), id: String(id) });
    }
  }
  throw httpError(404, 'NOT_FOUND', 'Ruta de historial no encontrada.');
}
