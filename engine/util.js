import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.SUCKLESS_DATA ? path.resolve(process.env.SUCKLESS_DATA) : path.join(ROOT, 'data');
export const TARGETS = {
  buggy: path.join(ROOT, 'demo-store'),
  fixed: path.join(ROOT, 'demo-store-fixed'),
};
export const BASE_CHECKS = path.join(ROOT, 'demo-store', 'checks', 'base.mjs');

export const nowIso = () => new Date().toISOString();

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

export function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export const relPath = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** Quita rutas absolutas de la máquina para que trazas e historial sean portables. */
export function relativizeText(text) {
  return String(text).split(`file://${ROOT}/`).join('').split(`${ROOT}/`).join('');
}

/** Archivos fuente (.js/.mjs) de un proyecto, ignorando pruebas, estáticos y dependencias. */
export function listSourceFiles(dir) {
  const out = [];
  const skip = new Set(['node_modules', 'checks', 'public', '.git']);
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(m?js)$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}
