// Ejecutor controlado: solo lanza `node check-host.mjs <archivos>` con límite de tiempo y entorno mínimo.
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, ROOT, TARGETS, isInside, nowIso, relativizeText } from './util.js';

const HOST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-host.mjs');
const MARK = '@@SUCKLESS_RESULTS@@';

export function runChecks({ files, target = 'buggy', timeoutMs = 20000 }) {
  if (!TARGETS[target]) throw new Error(`Target desconocido: ${target} (usa buggy|fixed)`);
  for (const f of files) {
    if (!(isInside(f, ROOT) || isInside(f, DATA_DIR)) || !/\.mjs$/.test(f)) {
      throw new Error(`Archivo de pruebas no permitido: ${f}`);
    }
  }
  const started = nowIso();
  const t0 = Date.now();
  const proc = spawnSync(process.execPath, [HOST, ...files], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 5 * 1024 * 1024,
    env: { SUCKLESS_STORE_DIR: TARGETS[target], TMPDIR: os.tmpdir(), NODE_ENV: 'test' },
  });
  let results = [];
  let runnerError = null;
  if (proc.error?.code === 'ETIMEDOUT') {
    runnerError = `Tiempo agotado (${timeoutMs} ms)`;
  } else if (proc.stdout?.includes(MARK)) {
    results = JSON.parse(proc.stdout.split(MARK).pop());
  } else {
    runnerError = relativizeText(proc.stderr || 'El ejecutor no devolvió resultados');
  }
  results = results.map((r) => (r.error ? { ...r, error: { ...r.error, stack: relativizeText(r.error.stack) } } : r));
  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    target,
    startedAt: started,
    durationMs: Date.now() - t0,
    runnerError,
    results,
    summary: { total: results.length, pass: count('PASS'), fail: count('FAIL'), error: count('ERROR') },
  };
}
