// Panel local de evidencias. Solo escucha en 127.0.0.1; sin dependencias.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { approveRequirement, answerRequirement, getRequirement, listRequirements, startRequirement } from '../engine/requirements.js';
import { realTrace, runDebug, runExplain, runReview, runVerify, saveRequirementSnapshot } from '../engine/service.js';
import { deleteAnalysis, getAnalysis, listAnalyses } from '../engine/history.js';
import { TARGETS, listSourceFiles, relPath } from '../engine/util.js';
import { readSource } from '../engine/code.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY = 1_000_000;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        if (size - c.length <= MAX_BODY) reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 }));
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
  });
}

const summary = (r) => ({ id: r.id, report: r.report, record: r.record });

async function route(req, url, body) {
  const m = (re) => url.pathname.match(re);
  const { method } = req;
  let x;
  if (method === 'GET' && url.pathname === '/api/history') return listAnalyses({ q: url.searchParams.get('q') || null, type: url.searchParams.get('type') || null });
  if ((x = m(/^\/api\/history\/(\d+)$/))) {
    if (method === 'GET') return getAnalysis(x[1]) ?? Promise.reject(Object.assign(new Error('No existe'), { status: 404 }));
    if (method === 'DELETE') return { deleted: deleteAnalysis(x[1]) };
  }
  if (method === 'GET' && url.pathname === '/api/req') return listRequirements();
  if (method === 'POST' && url.pathname === '/api/req/start') return startRequirement(body.text);
  if ((x = m(/^\/api\/req\/(REQ-[a-f0-9]{6})$/)) && method === 'GET') return getRequirement(x[1]);
  if ((x = m(/^\/api\/req\/(REQ-[a-f0-9]{6})\/answer$/)) && method === 'POST') return answerRequirement(x[1], body);
  if ((x = m(/^\/api\/req\/(REQ-[a-f0-9]{6})\/approve$/)) && method === 'POST') {
    const d = approveRequirement(x[1], body.by);
    saveRequirementSnapshot(d.id);
    return d;
  }
  if (method === 'GET' && url.pathname === '/api/files') {
    const files = [TARGETS.buggy, TARGETS.fixed].flatMap((d) => listSourceFiles(d).map(relPath));
    const symbols = [...new Set(listSourceFiles(TARGETS.buggy).flatMap((f) => readSource(f).fns.map((fn) => fn.name)))];
    return { files, symbols };
  }
  if (method === 'GET' && url.pathname === '/api/trace') return { trace: realTrace(url.searchParams.get('check') || 'BASE-FRESH-LOAD') };
  if (method === 'POST' && url.pathname === '/api/verify') return summary(runVerify({ reqId: body.reqId || null, target: body.target || 'both' }));
  if (method === 'POST' && url.pathname === '/api/debug') return summary(runDebug({ log: body.log, reqId: body.reqId || null }));
  if (method === 'POST' && url.pathname === '/api/explain') return summary(runExplain({ symbol: body.symbol }));
  if (method === 'POST' && url.pathname === '/api/review') return summary(runReview({ files: body.files ?? [], reqId: body.reqId || null }));
  throw Object.assign(new Error('No encontrado'), { status: 404 });
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(code === 413 ? { Connection: 'close' } : {}), 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" });
    if (code === 413) res.once('finish', () => req.destroy());
    res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
  };
  try {
    const url = new URL(req.url, 'http://localhost');
    const host = req.headers.host ?? '';
    if (![`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(host)) return send(403, { error: 'Host no permitido' });
    if (req.method === 'GET' && url.pathname === '/') return send(200, fs.readFileSync(path.join(here, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    if (!url.pathname.startsWith('/api/')) return send(404, { error: 'No encontrado' });
    let body = {};
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(415, { error: 'Se requiere Content-Type: application/json' });
      body = await readJson(req);
    }
    return send(200, await route(req, url, body));
  } catch (e) {
    return send(e.status ?? 400, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Panel SuckLess en http://127.0.0.1:${PORT}`));
