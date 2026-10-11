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

function parseResults(stdout) {
  const marker = stdout.lastIndexOf(MARK);
  if (marker === -1) return null;
  const results = JSON.parse(stdout.slice(marker + MARK.length).trim());
  if (!Array.isArray(results)) throw new Error('El resultado del ejecutor no es una lista.');
  return results;
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
  } else if (proc.error?.code === 'ENOBUFS') {
    runnerError = 'El ejecutor superó el límite de salida (5 MB)';
  } else if (proc.error) {
    runnerError = relativizeText(proc.error.message);
  } else if (proc.status !== 0) {
    runnerError = relativizeText(proc.stderr || `El ejecutor terminó con código ${proc.status}`);
  } else {
    try {
      results = parseResults(proc.stdout ?? '') ?? [];
      if (!proc.stdout?.includes(MARK)) runnerError = relativizeText(proc.stderr || 'El ejecutor no devolvió resultados');
    } catch (error) {
      runnerError = `Respuesta inválida del ejecutor: ${error.message}`;
    }
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
    let outputBytes = 0;
    let outputLimitExceeded = false;
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
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    const capture = (stream, chunk) => {
      if (settled || outputLimitExceeded) return;
      outputBytes += Buffer.byteLength(chunk, 'utf8');
      if (outputBytes > MAX_OUTPUT) {
        outputLimitExceeded = true;
        runnerError = 'El ejecutor superó el límite de salida (5 MB)';
        stdout = '';
        stderr = '';
        proc.kill('SIGKILL');
        return;
      }
      if (stream === 'stdout') stdout += chunk;
      else stderr += chunk;
    };
    proc.stdout.on('data', (chunk) => capture('stdout', chunk));
    proc.stderr.on('data', (chunk) => capture('stderr', chunk));
    proc.on('error', (error) => {
      runnerError = relativizeText(error.message);
      finish();
    });
    proc.on('close', (code, signal) => {
      if (runnerError) return finish();
      if (code !== 0) {
        runnerError = relativizeText(stderr || `El ejecutor terminó${signal ? ` por ${signal}` : ` con código ${code}`}`);
        return finish();
      }
      try {
        const results = parseResults(stdout);
        if (results) return finish(results);
        runnerError = relativizeText(stderr || 'El ejecutor no devolvió resultados');
      } catch (error) {
        runnerError = `Respuesta inválida del ejecutor: ${error.message}`;
      }
      finish();
    });
  });
}
