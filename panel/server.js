import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { approveRequirement, answerRequirement, getRequirement, listRequirements, startRequirement } from '../engine/requirements.js';
import { realTrace, runDebug, runExplain, runReview, runVerify, saveRequirementSnapshot } from '../engine/service.js';
import { deleteAnalysis, getAnalysis, listAnalyses } from '../engine/history.js';
import { TARGETS, listSourceFiles, relPath } from '../engine/util.js';
import { readSource } from '../engine/code.js';
import { handle as requirementsRoute } from './routes/requirements.js';
import { handle as debugRoute } from './routes/debug.js';
import { handle as executorRoute } from './routes/executor.js';
import { handle as codeRoute } from './routes/code.js';
import { handle as historyRoute } from './routes/history.js';
import { httpError, normalizeError } from './routes/shared.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY = 1_000_000;
const FRONTEND_ORIGINS = new Set((process.env.SUCKLESS_FRONTEND_ORIGINS || 'http://127.0.0.1:8083,http://localhost:8083').split(',').map((x) => x.trim()).filter(Boolean));

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let rejected = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        if (!rejected) {
          rejected = true;
          reject(httpError(413, 'OVERSIZED_BODY', 'El cuerpo supera el límite de 1 MB.'));
        }
      } else if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(httpError(400, 'VALIDATION', 'JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

const summary = (r) => ({ id: r.id, report: r.report, record: r.record });

async function route(req, url, body) {
  const { method } = req;
  if (url.pathname === '/api/requirements' || url.pathname.startsWith('/api/requirements/')) return requirementsRoute(req, url, body);
  if (url.pathname.startsWith('/api/debug/')) return debugRoute(req, url, body);
  if (url.pathname.startsWith('/api/executor/')) return executorRoute(req, url, body);
  if (url.pathname === '/api/files' || url.pathname.startsWith('/api/code/')) return codeRoute(req, url, body);
  if (url.pathname === '/api/history' || url.pathname.startsWith('/api/history/')) return historyRoute(req, url, body);

  let match;
  if (method === 'GET' && url.pathname === '/api/req') return listRequirements();
  if (method === 'POST' && url.pathname === '/api/req/start') return startRequirement(body.text);
  if ((match = url.pathname.match(/^\/api\/req\/(REQ-[a-f0-9]{6})$/)) && method === 'GET') return getRequirement(match[1]);
  if ((match = url.pathname.match(/^\/api\/req\/(REQ-[a-f0-9]{6})\/answer$/)) && method === 'POST') return answerRequirement(match[1], body);
  if ((match = url.pathname.match(/^\/api\/req\/(REQ-[a-f0-9]{6})\/approve$/)) && method === 'POST') {
    const requirement = approveRequirement(match[1], body.by);
    saveRequirementSnapshot(requirement.id);
    return requirement;
  }
  if (method === 'GET' && url.pathname === '/api/trace') return { trace: realTrace(url.searchParams.get('check') || 'BASE-FRESH-LOAD') };
  if (method === 'POST' && url.pathname === '/api/verify') return summary(runVerify({ reqId: body.reqId || null, target: body.target || 'both' }));
  if (method === 'POST' && url.pathname === '/api/debug') return summary(runDebug({ log: body.log, reqId: body.reqId || null }));
  if (method === 'POST' && url.pathname === '/api/explain') return summary(runExplain({ symbol: body.symbol }));
  if (method === 'POST' && url.pathname === '/api/review') return summary(runReview({ files: body.files ?? [], reqId: body.reqId || null }));
  throw httpError(404, 'NOT_FOUND', 'Ruta no encontrada.');
}

export function createServer() {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const corsHeaders = origin && FRONTEND_ORIGINS.has(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
      : {};
    const send = (code, result) => {
      const headers = {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
        ...corsHeaders,
        ...(result?.headers ?? {}),
      };
      if (result?.text !== undefined) {
        headers['Content-Type'] = result.contentType ?? 'text/plain; charset=utf-8';
        res.writeHead(code, headers);
        return res.end(result.text);
      }
      headers['Content-Type'] = 'application/json; charset=utf-8';
      res.writeHead(code, headers);
      res.end(JSON.stringify(result?.data ?? result));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const host = req.headers.host ?? '';
      const listeningPort = server.address()?.port ?? PORT;
      if (![`127.0.0.1:${listeningPort}`, `localhost:${listeningPort}`].includes(host)) {
        return send(403, { error: { code: 'VALIDATION', message: 'Host no permitido.' } });
      }
      if (req.method === 'OPTIONS') {
        if (!origin || !FRONTEND_ORIGINS.has(origin)) {
          return send(403, { error: { code: 'VALIDATION', message: 'Origen no permitido.' } });
        }
        res.writeHead(204, corsHeaders);
        return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
        return res.end(fs.readFileSync(path.join(here, 'index.html'), 'utf8'));
      }
      if (!url.pathname.startsWith('/api/')) return send(404, { error: { code: 'NOT_FOUND', message: 'No encontrado.' } });
      let body = {};
      const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || Boolean(req.headers['transfer-encoding']);
      if (['POST', 'PUT'].includes(req.method) || (req.method === 'DELETE' && hasBody)) {
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
          return send(415, { error: { code: 'VALIDATION', message: 'Se requiere Content-Type: application/json.' } });
        }
        body = await readJson(req);
      }
      const result = await route(req, url, body);
      return send(result?.status ?? 200, result);
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.status === 413) res.once('finish', () => req.destroy());
      return send(normalized.status, { error: { code: normalized.code, message: normalized.message } });
    }
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, '127.0.0.1', () => console.log(`Panel SuckLess en http://127.0.0.1:${PORT}`));
}
