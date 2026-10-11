// Ejecutor controlado: solo lanza `node check-host.mjs <archivos>` con límite de tiempo y entorno mínimo.
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, ROOT, TARGETS, isInside, nowIso, relativizeText } from './util.js';

const HOST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-host.mjs');
const MARK = '@@SUCKLESS_RESULTS@@';
const MAX_OUTPUT = 5 * 1024 * 1024;

function validateRun({ files, target }) {
  if (!TARGETS[target]) throw new Error(`Target desconocido: ${target} (usa buggy|fixed)`);
  for (const file of files) {
    if (!(isInside(file, ROOT) || isInside(file, DATA_DIR)) || !/\.mjs$/.test(file)) {
      throw new Error(`Archivo de pruebas no permitido: ${file}`);
    }
  }
}

function runResult(target, startedAt, t0, results, runnerError) {
  results = results.map((r) => (r.error ? { ...r, error: { ...r.error, stack: relativizeText(r.error.stack) } } : r));
  const count = (status) => results.filter((r) => r.status === status).length;
  return {
    target,
    startedAt,
    durationMs: Date.now() - t0,
    runnerError,
    results,
    summary: { total: results.length, pass: count('PASS'), fail: count('FAIL'), error: count('ERROR') },
  };
}

export function runChecks({ files, target = 'buggy', timeoutMs = 20000 }) {
  validateRun({ files, target });
  const startedAt = nowIso();
  const t0 = Date.now();
  const proc = spawnSync(process.execPath, [HOST, ...files], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT,
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
  return runResult(target, startedAt, t0, results, runnerError);
}

export function runChecksAsync({ files, target = 'buggy', timeoutMs = 20000 }) {
  validateRun({ files, target });
  const startedAt = nowIso();
  const t0 = Date.now();
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [HOST, ...files], {
      cwd: ROOT,
      env: { SUCKLESS_STORE_DIR: TARGETS[target], TMPDIR: os.tmpdir(), NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let runnerError = null;
    let settled = false;
    const finish = (results = []) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(runResult(target, startedAt, t0, results, runnerError));
    };
    const timer = setTimeout(() => {
      runnerError = `Tiempo agotado (${timeoutMs} ms)`;
      proc.kill('SIGKILL');
      finish();
    }, timeoutMs);
    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT) {
        runnerError = 'El ejecutor superó el límite de salida (5 MB)';
        proc.kill('SIGKILL');
      }
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > MAX_OUTPUT) {
        runnerError = 'El ejecutor superó el límite de salida (5 MB)';
        proc.kill('SIGKILL');
      }
    });
    proc.on('error', (error) => {
      runnerError = relativizeText(error.message);
      finish();
    });
    proc.on('close', () => {
      if (runnerError) return finish();
      if (stdout.includes(MARK)) {
        try {
          finish(JSON.parse(stdout.split(MARK).pop()));
        } catch (error) {
          runnerError = `Respuesta inválida del ejecutor: ${error.message}`;
          finish();
        }
      } else {
        runnerError = relativizeText(stderr || 'El ejecutor no devolvió resultados');
        finish();
      }
    });
  });
}
