// Modo Debug: parsea la traza, localiza archivos candidatos y ordena hipótesis CON evidencia.
// Una hipótesis nunca es un hecho: solo pasa a "reproducido" si una prueba ejecutada falla con el mismo error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, TARGETS, isInside, listSourceFiles } from './util.js';
import { redact } from './redact.js';
import { readSource } from './code.js';

export function parseStackTrace(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim());
  let name = null;
  let message = '';
  for (const l of lines) {
    const m = l.match(/^(?:Uncaught\s+)?([A-Za-z_$][\w$.]*(?:Error|Exception))(?:\s*\[[^\]]+\])?(?::\s*(.*))?$/);
    if (m) {
      name = m[1];
      message = m[2] ?? '';
      break;
    }
  }
  const frames = [];
  for (const l of lines) {
    const m = l.match(/^at\s+(?:(.+?)\s+\()?(.+?):(\d+)(?::(\d+))?\)?$/);
    if (m) frames.push({ fn: m[1] ?? null, file: m[2], line: Number(m[3]), col: m[4] ? Number(m[4]) : null });
  }
  return { name, message, frames };
}

function resolveFile(file, projectFiles) {
  const tries = [];
  if (file.startsWith('file://')) tries.push(fileURLToPath(file));
  if (path.isAbsolute(file)) tries.push(file);
  tries.push(path.resolve(ROOT, file));
  for (const t of tries) if (projectFiles.includes(t)) return t;
  const base = path.basename(file);
  return projectFiles.find((p) => path.basename(p) === base) ?? null;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function allLines(root) {
  return listSourceFiles(root).flatMap((file) => readSource(file).lines.map((text, i) => ({ file, line: i + 1, text })));
}

function snippet(abs, line, ctx = 2) {
  const { lines } = readSource(abs);
  const out = [];
  for (let n = Math.max(1, line - ctx); n <= Math.min(lines.length, line + ctx); n++) out.push({ line: n, text: lines[n - 1], hit: n === line });
  return out;
}

const ev = (abs, line, text, why) => ({ file: rel(abs), line, text: text.trim(), why });

function ruleUndefinedProperty(ctx) {
  const m = ctx.message.match(/Cannot read propert(?:y|ies) of (undefined|null) \(reading '([^']+)'\)/);
  if (!m || !ctx.top) return [];
  const [, nil, prop] = m;
  const lineText = readSource(ctx.top.abs).lines[ctx.top.line - 1] ?? '';
  const expr = lineText.match(new RegExp(String.raw`([\w$.]+)\.${prop}\b`))?.[1] ?? null;
  const member = expr?.includes('.') ? expr.split('.').pop() : null;
  const parent = expr?.includes('.') ? expr.split('.').slice(0, -1).join('.') : null;
  const hyps = [];
  const producers = [];
  if (member) {
    for (const file of listSourceFiles(ctx.root)) {
      for (const fn of readSource(file).fns.filter((f) => /^(load|get|read|restore|init|create|parse|from)/i.test(f.name))) {
        const { lines } = readSource(file);
        for (let n = fn.start; n <= fn.end; n++) {
          const r = lines[n - 1].match(/return\s*\{([^}]*)\}/);
          if (r && !new RegExp(String.raw`\b${member}\b`).test(r[1])) producers.push({ file, n, fn: fn.name, text: lines[n - 1] });
        }
      }
    }
  }
  const cite = [ev(ctx.top.abs, ctx.top.line, lineText, `Aquí se lee \`.${prop}\` de ${expr ?? 'un valor'} que es ${nil}.`)];
  for (const p of producers) cite.push(ev(p.file, p.n, p.text, `\`${p.fn}()\` puede devolver un objeto sin \`${member}\`.`));
  let fix = null;
  if (producers.length && member) {
    const factory = listSourceFiles(ctx.root).flatMap((f) => readSource(f).fns.filter((fn) => /^create/i.test(fn.name) && readSource(f).lines.slice(fn.start - 1, fn.end).join('\n').includes(`${member}:`)).map((fn) => fn.name))[0];
    fix = `En ${rel(producers[0].file)}:${producers[0].n} devolver un objeto con \`${member}\` inicializado${factory ? ` (p. ej. \`return ${factory}();\`)` : ''} en lugar de \`${producers[0].text.trim()}\`. Propuesta: requiere revisión humana antes de aplicarse.`;
  }
  hyps.push({
    title: `${expr ?? 'El valor'} es ${nil}: estado sin inicializar`,
    statement: `${expr ? `\`${expr}\`` : 'El valor'} es ${nil} al ejecutar ${rel(ctx.top.abs)}:${ctx.top.line}${parent ? `; el objeto \`${parent}\` llegó sin la propiedad \`${member}\`` : ''}.`,
    confidence: producers.length ? 'alta' : 'media',
    evidence: cite,
    suggestedFix: fix,
  });
  if (ctx.caller) {
    const callerText = readSource(ctx.caller.abs).lines[ctx.caller.line - 1] ?? '';
    hyps.push({
      title: 'El llamador pasó un valor inesperado',
      statement: `La llamada en ${rel(ctx.caller.abs)}:${ctx.caller.line} pudo pasar ${parent ? `un \`${parent}\`` : 'un argumento'} sin la forma esperada.`,
      confidence: producers.length ? 'baja' : 'media',
      evidence: [ev(ctx.caller.abs, ctx.caller.line, callerText, 'Línea del llamador en la traza.')],
      suggestedFix: null,
    });
  }
  return hyps;
}

function ruleNotAFunction(ctx) {
  const m = ctx.message.match(/(\S+) is not a function/);
  if (!m || !ctx.top) return [];
  const last = m[1].split('.').pop();
  const defs = ctx.lines.filter((l) => new RegExp(String.raw`(function\s+${last}\b|const\s+${last}\b|export\s+\{[^}]*\b${last}\b)`).test(l.text)).slice(0, 3);
  return [{
    title: `\`${m[1]}\` no es una función`,
    statement: `Se invoca \`${m[1]}\` pero su valor no es invocable (import incorrecto, nombre mal escrito o valor sobrescrito).`,
    confidence: 'media',
    evidence: [ev(ctx.top.abs, ctx.top.line, readSource(ctx.top.abs).lines[ctx.top.line - 1], 'Llamada que falla.'), ...defs.map((d) => ev(d.file, d.line, d.text, 'Definición encontrada con ese nombre.'))],
    suggestedFix: null,
  }];
}

function ruleNotDefined(ctx) {
  const m = ctx.message.match(/([\w$]+) is not defined/);
  if (!m || !ctx.top) return [];
  const found = ctx.lines.filter((l) => new RegExp(String.raw`\b(import|const|let|var|function)\b.*\b${m[1]}\b`).test(l.text)).slice(0, 3);
  return [{
    title: `\`${m[1]}\` no está definido`,
    statement: found.length ? `\`${m[1]}\` existe en otro lugar del proyecto pero no es visible aquí (¿falta importarlo?).` : `No se encontró definición ni import de \`${m[1]}\` en el proyecto.`,
    confidence: found.length ? 'media' : 'alta',
    evidence: [ev(ctx.top.abs, ctx.top.line, readSource(ctx.top.abs).lines[ctx.top.line - 1], 'Uso del identificador.'), ...found.map((d) => ev(d.file, d.line, d.text, 'Definición en otro punto.'))],
    suggestedFix: null,
  }];
}

function ruleJson(ctx) {
  if (!/JSON|Unexpected (token|end)/i.test(ctx.message)) return [];
  const parses = ctx.lines.filter((l) => /JSON\.parse\(/.test(l.text));
  return [{
    title: 'JSON inválido o vacío al parsear',
    statement: 'Se parsea un texto que no es JSON válido (archivo vacío, truncado o con otro formato) sin protección.',
    confidence: parses.length ? 'media' : 'baja',
    evidence: parses.map((p) => ev(p.file, p.line, p.text, 'Llamada a JSON.parse; verificar si está dentro de try/catch.')),
    suggestedFix: null,
  }];
}

function ruleEnoent(ctx) {
  const m = ctx.message.match(/ENOENT.*?'([^']+)'/);
  if (!m) return [];
  const fsCalls = ctx.lines.filter((l) => /fs\.(readFile|readFileSync|openSync|createReadStream)\(/.test(l.text));
  return [{
    title: `El archivo ${m[1]} no existe`,
    statement: 'Se lee un archivo sin comprobar su existencia o con una ruta relativa al directorio de trabajo equivocado.',
    confidence: 'media',
    evidence: fsCalls.map((p) => ev(p.file, p.line, p.text, 'Lectura de archivo sin protección aparente.')),
    suggestedFix: null,
  }];
}

const RULES = [ruleUndefinedProperty, ruleNotAFunction, ruleNotDefined, ruleJson, ruleEnoent];
const ORDER = { alta: 0, media: 1, baja: 2 };

export function diagnose({ log, target = 'buggy' }) {
  const root = TARGETS[target];
  const text = redact(String(log ?? ''));
  const parsed = parseStackTrace(text);
  if (!parsed.name) throw new Error('No encontré una línea de error (p. ej. "TypeError: ...") en el texto pegado.');
  const projectFiles = listSourceFiles(root);
  const frames = parsed.frames.map((f) => {
    const abs = resolveFile(f.file, projectFiles);
    return { ...f, abs, inProject: Boolean(abs && isInside(abs, root)) };
  });
  const own = frames.filter((f) => f.inProject);
  const ctx = { root, message: parsed.message, top: own[0] ?? null, caller: own[1] ?? null, lines: allLines(root) };
  let hypotheses = RULES.flatMap((r) => r(ctx));
  if (!hypotheses.length) {
    hypotheses = [{
      title: 'Sin patrón conocido',
      statement: ctx.top ? `El fallo ocurre en ${rel(ctx.top.abs)}:${ctx.top.line}; no coincide con ninguna regla. Hace falta reproducirlo con una prueba.` : 'Ningún frame de la traza pertenece al proyecto analizado.',
      confidence: 'baja',
      evidence: ctx.top ? [ev(ctx.top.abs, ctx.top.line, readSource(ctx.top.abs).lines[ctx.top.line - 1], 'Frame superior del proyecto.')] : [],
      suggestedFix: null,
    }];
  }
  hypotheses.sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence]);
  hypotheses = hypotheses.map((h, i) => ({ id: `H${i + 1}`, status: 'pendiente_de_probar', ...h }));
  return {
    target,
    error: { name: parsed.name, message: parsed.message },
    candidateFiles: [...new Set(own.map((f) => rel(f.abs)))],
    frames: frames.map((f) => ({ fn: f.fn, file: f.abs ? rel(f.abs) : f.file, line: f.line, inProject: f.inProject })),
    snippet: ctx.top ? { file: rel(ctx.top.abs), lines: snippet(ctx.top.abs, ctx.top.line) } : null,
    hypotheses,
    reproduction: null,
    fixVerification: null,
  };
}

/** Reproducido = una prueba EJECUTADA falla con el mismo mensaje de error (no es juicio de la IA). */
export function attachReproduction(diag, run) {
  const hit = run.results.find((r) => r.status === 'ERROR' && r.error?.message === diag.error.message);
  diag.reproduction = hit
    ? { reproduced: true, checkId: hit.id, title: hit.title, trace: hit.error.stack }
    : { reproduced: false, note: 'Ninguna prueba disponible reprodujo el mismo error; las hipótesis siguen sin confirmar.' };
  if (hit && diag.hypotheses[0]) diag.hypotheses[0].status = 'error_reproducido';
  return diag;
}

/** Tras aplicar una corrección (versión "fixed"), la misma prueba debe pasar. */
export function attachFixVerification(diag, fixedRun) {
  if (!diag.reproduction?.reproduced) return diag;
  const after = fixedRun.results.find((r) => r.id === diag.reproduction.checkId);
  diag.fixVerification = { checkId: diag.reproduction.checkId, passedAfterFix: after?.status === 'PASS', target: fixedRun.target };
  if (after?.status === 'PASS' && diag.hypotheses[0]) diag.hypotheses[0].status = 'correccion_verificada';
  return diag;
}
