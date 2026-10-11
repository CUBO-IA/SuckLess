import { randomUUID } from 'node:crypto';
import { runVerifyAsync } from '../../engine/service.js';
import { getRequirement } from '../../engine/requirements.js';
import { getAnalysis, listAnalyses } from '../../engine/history.js';
import { httpError, jsonResult, validateObject } from './shared.js';

const jobs = new Map();
const TERMINAL = new Set(['PASS', 'FAIL', 'EXECUTOR_ERROR']);
const MAX_ACTIVE_JOBS = 2;
const MAX_RETAINED_JOBS = 100;
const RETAINED_MS = 30 * 60 * 1000;

function snapshot(job) {
  return {
    id: job.id,
    status: job.status,
    target: job.target,
    requirementId: job.requirementId,
    checks: job.checks,
    summary: job.summary,
    durationMs: job.durationMs,
    trace: { steps: [], downloadUrl: null },
    screenshots: [],
    aiInterpretation: null,
  };
}

function checksFrom(result) {
  return result.runs.flatMap((run) => [
    ...run.results.map((check) => ({
      name: `${run.target}:${check.id}`,
      status: check.status === 'ERROR' ? 'EXECUTOR_ERROR' : check.status,
      durationMs: Number.isInteger(check.durationMs) ? check.durationMs : null,
      error: check.error?.message ?? null,
    })),
    ...(run.runnerError ? [{
      name: `${run.target}:executor`,
      status: 'EXECUTOR_ERROR',
      durationMs: run.durationMs,
      error: run.runnerError,
    }] : []),
  ]);
}

function summaryFrom(checks) {
  return {
    pass: checks.filter((c) => c.status === 'PASS').length,
    fail: checks.filter((c) => c.status === 'FAIL').length,
    error: checks.filter((c) => c.status === 'EXECUTOR_ERROR').length,
  };
}

async function execute(job) {
  job.status = 'RUNNING';
  job.startedAt = Date.now();
  try {
    const result = await runVerifyAsync({ reqId: job.requirementId, target: job.target });
    job.checks = checksFrom(result);
    job.summary = summaryFrom(job.checks);
    job.status = result.runs.some((run) => run.runnerError) || job.summary.error > 0
      ? 'EXECUTOR_ERROR'
      : job.summary.fail > 0 ? 'FAIL' : 'PASS';
    job.analysisId = String(result.id);
  } catch (error) {
    job.status = 'EXECUTOR_ERROR';
    job.error = error.message;
    job.summary = { pass: 0, fail: 0, error: 1 };
    job.checks = [{ name: 'executor', status: 'EXECUTOR_ERROR', durationMs: null, error: error.message }];
  } finally {
    job.durationMs = Date.now() - job.startedAt;
    job.finishedAt = Date.now();
    if (job.checks[0]?.name === 'executor') job.checks[0].durationMs = job.durationMs;
  }
}

export async function handle(req, url, body) {
  if (req.method === 'POST' && url.pathname === '/api/executor/run') {
    validateObject(body);
    const target = body.target ?? 'both';
    if (!['buggy', 'fixed', 'both'].includes(target)) throw httpError(400, 'VALIDATION', 'target debe ser buggy, fixed o both.');
    const requirementId = body.requirementId ?? null;
    if (requirementId !== null) {
      if (typeof requirementId !== 'string' || !/^REQ-[a-f0-9]{6}$/.test(requirementId)) {
        throw httpError(400, 'VALIDATION', 'requirementId inválido.');
      }
      getRequirement(requirementId);
    }
    const now = Date.now();
    for (const [jobId, job] of jobs) {
      if (TERMINAL.has(job.status) && now - (job.finishedAt ?? 0) > RETAINED_MS) jobs.delete(jobId);
    }
    const active = [...jobs.values()].filter((job) => !TERMINAL.has(job.status)).length;
    if (active >= MAX_ACTIVE_JOBS) throw httpError(503, 'UPSTREAM_5XX', 'El ejecutor ya tiene dos corridas activas; inténtalo de nuevo en unos segundos.');
    if (jobs.size >= MAX_RETAINED_JOBS) {
      const oldTerminal = [...jobs].find(([, job]) => TERMINAL.has(job.status));
      if (oldTerminal) jobs.delete(oldTerminal[0]);
      else throw httpError(503, 'UPSTREAM_5XX', 'El historial temporal de corridas está lleno.');
    }
    const id = `run_${randomUUID().replaceAll('-', '')}`;
    const job = {
      id,
      status: 'QUEUED',
      target,
      requirementId,
      checks: [],
      summary: { pass: 0, fail: 0, error: 0 },
      durationMs: null,
    };
    jobs.set(id, job);
    setImmediate(() => { void execute(job); });
    return jsonResult(snapshot(job));
  }
  if (req.method === 'GET' && url.pathname === '/api/executor/run/latest') {
    const [item] = listAnalyses({ type: 'verify', limit: 1 });
    if (!item) throw httpError(404, 'NOT_FOUND', 'Aún no hay corridas del ejecutor.');
    const record = getAnalysis(item.id);
    const checks = checksFrom(record.data);
    const summary = summaryFrom(checks);
    const status = record.data.runs.some((run) => run.runnerError) || summary.error > 0
      ? 'EXECUTOR_ERROR'
      : summary.fail > 0 ? 'FAIL' : 'PASS';
    return jsonResult({
      id: `run_history_${record.id}`,
      status,
      target: record.data.runs.length > 1 ? 'both' : record.data.runs[0].target,
      requirementId: record.data.reqId ?? null,
      checks,
      summary,
      durationMs: record.data.runs.reduce((total, run) => total + run.durationMs, 0),
      trace: { steps: [], downloadUrl: null },
      screenshots: [],
      aiInterpretation: null,
    });
  }
  const match = url.pathname.match(/^\/api\/executor\/run\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const job = jobs.get(match[1]);
    if (!job) throw httpError(404, 'NOT_FOUND', 'No existe la corrida solicitada.');
    return jsonResult(snapshot(job));
  }
  throw httpError(404, 'NOT_FOUND', 'Ruta del ejecutor no encontrada.');
}

export function isTerminal(status) {
  return TERMINAL.has(status);
}
