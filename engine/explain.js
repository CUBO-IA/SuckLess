// Code Explainer: localiza la función, resume su flujo y cita archivo:línea. Análisis estático, no ejecuta nada.
import path from 'node:path';
import { ROOT, TARGETS, listSourceFiles } from './util.js';
import { readSource, stripNoise } from './code.js';

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

export function explainSymbol({ symbol, target = 'buggy' }) {
  if (!/^[\w$]+$/.test(String(symbol))) throw new Error('El símbolo debe ser un nombre de función (letras, números, _ o $).');
  const root = TARGETS[target];
  const files = listSourceFiles(root);
  const defs = files.flatMap((file) => readSource(file).fns.map((fn) => ({ file, ...fn })));
  const def = defs.find((d) => d.name === symbol);
  if (!def) {
    throw new Error(`No encontré la función "${symbol}". Disponibles: ${defs.map((d) => d.name).join(', ')}`);
  }
  const { lines } = readSource(def.file);
  const known = new Map(defs.map((d) => [d.name, d]));
  const flow = [];
  for (let n = def.start; n <= def.end; n++) {
    const raw = lines[n - 1];
    const s = stripNoise(raw).trim();
    if (!s || s === '{' || s === '}') continue;
    const push = (kind, note) => flow.push({ line: n, kind, text: raw.trim(), note });
    if (n === def.start) { push('firma', `Recibe: ${def.params.join(', ') || '(sin parámetros)'}`); continue; }
    if (/^(\}\s*)?else\b/.test(s) || /^if\s*\(/.test(s)) push('condición', 'Bifurca el flujo.');
    else if (/^throw\b/.test(s) || /\bthrow\b/.test(s)) push('error', 'Interrumpe con una excepción.');
    else if (/^return\b/.test(s)) push('retorno', 'Devuelve el resultado.');
    else if (/\.(push|splice|pop|shift|unshift)\(|\b[\w$]+\.[\w$.]+\s*(\+=|-=|=)(?!=)/.test(s) && def.params.some((p) => new RegExp(String.raw`\b${p}\b`).test(s))) push('mutación', 'Modifica un parámetro (efecto visible para el llamador).');
    else {
      const calls = [...s.matchAll(/\b([\w$]+)\s*\(/g)].map((m) => m[1]).filter((c) => known.has(c) && c !== symbol);
      if (calls.length) push('llamada', `Llama a ${calls.map((c) => `${c}() (${rel(known.get(c).file)}:${known.get(c).start})`).join(', ')}.`);
      else if (/\b[A-Z][A-Z_0-9]{2,}\b/.test(s)) push('dato', `Lee datos compartidos: ${[...s.matchAll(/\b([A-Z][A-Z_0-9]{2,})\b/g)].map((m) => m[1]).join(', ')}.`);
    }
  }
  const callers = [];
  for (const file of files) {
    readSource(file).lines.forEach((text, i) => {
      if (new RegExp(String.raw`\b${symbol}\s*\(`).test(stripNoise(text)) && !(file === def.file && i + 1 === def.start)) {
        callers.push({ file: rel(file), line: i + 1, text: text.trim() });
      }
    });
  }
  return {
    symbol,
    target,
    file: rel(def.file),
    lines: [def.start, def.end],
    exported: def.exported,
    params: def.params,
    flow,
    callers,
    source: lines.slice(def.start - 1, def.end).map((text, i) => ({ line: def.start + i, text })),
    note: 'Resumen derivado de análisis estático del código; cada punto cita archivo y línea.',
  };
}
