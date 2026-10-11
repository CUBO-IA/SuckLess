// Utilidades de análisis estático ligero (sin dependencias).
import fs from 'node:fs';

/** Reemplaza strings y comentarios para contar llaves sin confundirse. */
export function stripNoise(line) {
  return line
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/\/\/.*$/, '');
}

const PARAMS = String.raw`\(((?:[^()]|\([^()]*\))*)\)`;
const RE_FN = new RegExp(String.raw`^\s*(export\s+)?(async\s+)?function\s+([\w$]+)\s*${PARAMS}\s*\{`);
const RE_ARROW = new RegExp(String.raw`^\s*(export\s+)?const\s+([\w$]+)\s*=\s*(async\s*)?${PARAMS}\s*=>\s*\{`);

/** Encuentra funciones de nivel superior: {name, params, exported, start, end} (líneas 1-based). */
export function findFunctions(source) {
  const lines = source.split('\n');
  const fns = [];
  for (let i = 0; i < lines.length; i++) {
    let name;
    let params;
    let exported;
    let m = lines[i].match(RE_FN);
    if (m) {
      [, exported, , name, params] = m;
    } else if ((m = lines[i].match(RE_ARROW))) {
      [, exported, name, , params] = m;
    } else continue;
    let depth = 0;
    let started = false;
    let end = i;
    for (let j = i; j < lines.length; j++) {
      for (const ch of stripNoise(lines[j])) {
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') depth--;
      }
      end = j;
      if (started && depth <= 0) break;
    }
    fns.push({
      name,
      exported: Boolean(exported),
      params: params
        .split(',')
        .map((p) => p.replace(/=.*$/, '').trim())
        .filter(Boolean),
      start: i + 1,
      end: end + 1,
    });
  }
  return fns;
}

const cache = new Map();
export function readSource(file) {
  const stat = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtime === stat.mtimeMs) return hit.value;
  const text = fs.readFileSync(file, 'utf8');
  const value = { text, lines: text.split('\n'), fns: findFunctions(text) };
  cache.set(file, { mtime: stat.mtimeMs, value });
  return value;
}

export function enclosingFunction(fns, line) {
  return fns.find((f) => line >= f.start && line <= f.end) ?? null;
}
