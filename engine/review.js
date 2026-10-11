// Code Review: hallazgos con severidad, archivo/líneas, evidencia, impacto y recomendación.
// "potencial" = detectado por reglas estáticas. "demostrado" = además hay una prueba ejecutada que falla por ello.
import path from 'node:path';
import { ROOT, TARGETS, listSourceFiles } from './util.js';
import { readSource, enclosingFunction } from './code.js';

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const SEV = { alta: 0, media: 1, baja: 2 };

export function reviewFiles({ files, target = 'buggy' }) {
  const ctxFiles = listSourceFiles(TARGETS[target]);
  const findings = [];
  const add = (f) => findings.push({ kind: 'potencial', demonstratedBy: [], ...f });

  // Claves del estado del carrito (para detectar serialización parcial).
  const stateKeys = [];
  for (const file of ctxFiles) {
    const src = readSource(file);
    for (const fn of src.fns.filter((x) => /^create/i.test(x.name))) {
      const m = src.lines.slice(fn.start - 1, fn.end).join(' ').match(/return\s*\{([^}]*)\}/);
      if (m) stateKeys.push(...[...m[1].matchAll(/([\w$]+)\s*:/g)].map((k) => k[1]));
    }
  }

  for (const file of files) {
    const { lines, fns } = readSource(file);
    const f = rel(file);
    const body = (fn) => lines.slice(fn.start - 1, fn.end).join('\n');

    // R1 acceso a propiedad anidada sin protección (agregado por archivo y parámetro)
    const r1 = new Map();
    for (const fn of fns) {
      for (const p of fn.params) {
        const re = new RegExp(String.raw`\b${p}\.([\w$]+)\.(find|push|map|reduce|filter|forEach|some|length)\b`);
        if (new RegExp(String.raw`${p}\?\.|Array\.isArray\(${p}\.|if\s*\(\s*!${p}\.`).test(body(fn))) continue;
        for (let n = fn.start; n <= fn.end; n++) {
          const m = lines[n - 1].match(re);
          if (m) {
            const key = `${p}.${m[1]}`;
            r1.set(key, [...(r1.get(key) ?? []), n]);
          }
        }
      }
    }
    for (const [key, hits] of r1) {
      const [p, member] = key.split('.');
      const producer = ctxFiles.some((cf) => readSource(cf).fns.some((fn) => /^(load|get|read|restore)/i.test(fn.name) && readSource(cf).lines.slice(fn.start - 1, fn.end).some((l) => { const r = l.match(/return\s*\{([^}]*)\}/); return r && !new RegExp(String.raw`\b${member}\b`).test(r[1]); })));
      add({ rule: 'acceso-sin-proteccion', category: 'lógica', severity: producer ? 'alta' : 'baja', file: f, lines: [hits[0], hits[hits.length - 1]], evidence: `${lines[hits[0] - 1].trim()}${hits.length > 1 ? `  (+${hits.length - 1} uso(s) más de ${key})` : ''}`, impact: producer ? `Hay código que puede entregar \`${p}\` sin \`${member}\` (p. ej. un estado recién cargado); entonces estas funciones lanzan TypeError y detienen la compra.` : `Si \`${p}\` llega sin \`${member}\`, estas funciones lanzan TypeError. No se encontró un productor que lo provoque hoy.`, recommendation: `Garantizar la forma de \`${p}\` en un solo punto (estado inicial completo) o validarla al entrar.`, tags: producer ? ['fresh-load'] : [] });
    }
    // R2 cantidad sin validar
    for (const fn of fns) {
      const q = fn.params.find((p) => /^(qty|quantity|cantidad)$/i.test(p));
      if (q && !new RegExp(String.raw`Number\.isInteger\(${q}\)|\b${q}\s*(<|<=|>|>=)\s*[01]\b`).test(body(fn))) {
        add({ rule: 'cantidad-sin-validar', category: 'lógica', severity: 'media', file: f, lines: [fn.start, fn.start], evidence: lines[fn.start - 1].trim(), impact: 'Cantidades negativas, cero, decimales o NaN entran al carrito y producen totales incorrectos.', recommendation: `Exigir que \`${q}\` sea un entero ≥ 1 y lanzar un error con código.`, tags: [] });
      }
    }
    // R3 dinero en coma flotante sin redondeo
    for (const fn of fns) {
      const txt = body(fn);
      if (/(price|TAX_RATE)/.test(txt) && /\*/.test(txt) && !/Math\.round|toFixed|round\w*\(/.test(txt)) {
        const n = fn.start + txt.split('\n').findIndex((l) => /(price|TAX_RATE)/.test(l) && /\*/.test(l));
        add({ rule: 'dinero-sin-redondeo', category: 'calidad', severity: 'media', file: f, lines: [n, n], evidence: lines[n - 1].trim(), impact: 'Los decimales binarios acumulan errores (0.1 + 0.2) y los totales pueden diferir en centavos.', recommendation: 'Redondear a centavos en cada resultado monetario, o trabajar en enteros (centavos).', tags: [] });
      }
    }
    // R4 expiración definida pero nunca leída
    const exp = lines.findIndex((l) => /\bexpires\s*:/.test(l));
    if (exp >= 0 && !lines.some((l) => /\.expires\b/.test(l))) {
      add({ rule: 'expiracion-ignorada', category: 'lógica', severity: 'alta', file: f, lines: [exp + 1, exp + 1], evidence: lines[exp].trim(), impact: 'Los cupones vencidos se aceptan y descuentan como si estuvieran vigentes.', recommendation: 'Comparar la fecha actual con `expires` al aplicar el cupón y rechazar con un error con código.', tags: ['coupon-expired'] });
    }
    // R5 rama porcentual que devuelve el valor crudo
    lines.forEach((l, i) => {
      if (/type\s*===\s*['"]percent['"]/.test(l)) {
        const next = lines.slice(i + 1, i + 4).join(' ');
        if (/return/.test(next) && !/\/\s*100|\*\s*0?\.\d|\*\s*\(/.test(next)) {
          add({ rule: 'porcentaje-sin-calcular', category: 'lógica', severity: 'alta', file: f, lines: [i + 1, i + 3], evidence: lines.slice(i, i + 3).map((x) => x.trim()).join(' '), impact: 'Un cupón de 10 % resta 10 unidades monetarias en vez del 10 % del subtotal.', recommendation: 'Calcular `subtotal * value / 100` para cupones porcentuales.', tags: ['coupon-percent'] });
        }
      }
    });
    // R6 cupones duplicados / combinables sin regla
    for (const fn of fns.filter((x) => /coupon/i.test(x.name))) {
      const txt = body(fn);
      if (/\.coupons\.push\(/.test(txt) && !/\.coupons\.(length|includes|some)/.test(txt)) {
        const n = fn.start + txt.split('\n').findIndex((l) => /\.coupons\.push\(/.test(l));
        add({ rule: 'cupones-sin-regla', category: 'lógica', severity: 'media', file: f, lines: [n, n], evidence: lines[n - 1].trim(), impact: 'Se acumulan cupones (incluso repetidos) sin una regla de negocio explícita.', recommendation: 'Definir en el requisito si se combinan y aplicar esa regla antes de agregar el cupón.', tags: ['coupon-combine'] });
      }
    }
    // R7 JSON.parse sin try
    for (const fn of fns) {
      const txt = body(fn);
      if (/JSON\.parse\(/.test(txt) && !/\btry\s*\{/.test(txt)) {
        const n = fn.start + txt.split('\n').findIndex((l) => /JSON\.parse\(/.test(l));
        add({ rule: 'json-parse-sin-try', category: 'seguridad', severity: 'media', file: f, lines: [n, n], evidence: lines[n - 1].trim(), impact: 'Un archivo o cuerpo HTTP mal formado lanza excepción y puede tumbar la petición o el proceso.', recommendation: 'Envolver en try/catch y responder con un error controlado (400) o un valor por defecto.', tags: [] });
      }
    }
    // R8 load* que devuelve {}
    for (const fn of fns.filter((x) => /^(load|get|read|restore)/i.test(x.name))) {
      for (let n = fn.start; n <= fn.end; n++) {
        if (/return\s*\{\s*\}\s*;?/.test(lines[n - 1])) {
          add({ rule: 'carga-devuelve-objeto-vacio', category: 'lógica', severity: 'alta', file: f, lines: [n, n], evidence: lines[n - 1].trim(), impact: 'El primer uso (sin archivo guardado) obtiene un estado sin `items` y el siguiente acceso falla.', recommendation: 'Devolver el estado inicial completo (p. ej. `createCart()`).', tags: ['fresh-load'] });
        }
      }
    }
    // R9 serialización parcial del estado
    for (const fn of fns.filter((x) => /^(save|persist|write|store)/i.test(x.name))) {
      const idx = lines.slice(fn.start - 1, fn.end).findIndex((l) => /JSON\.stringify\(\{/.test(l));
      if (idx >= 0) {
        const lineNo = fn.start + idx;
        const written = [...lines[lineNo - 1].matchAll(/([\w$]+)\s*:/g)].map((m) => m[1]);
        const missing = [...new Set(stateKeys)].filter((k) => !written.includes(k));
        if (missing.length) {
          add({ rule: 'serializacion-parcial', category: 'lógica', severity: 'alta', file: f, lines: [lineNo, lineNo], evidence: lines[lineNo - 1].trim(), impact: `El estado guardado omite: ${missing.join(', ')}. Se pierde al recargar.`, recommendation: 'Serializar todas las claves del estado (o guardar el objeto completo) y restaurarlas al cargar.', tags: ['persist-coupon'] });
        }
      }
    }
    // R10 seguridad: eval / new Function / exec con plantilla
    lines.forEach((l, i) => {
      if (/\beval\(|new Function\(|child_process|\bexec(Sync)?\(\s*`/.test(l)) {
        add({ rule: 'ejecucion-dinamica', category: 'seguridad', severity: 'alta', file: f, lines: [i + 1, i + 1], evidence: l.trim(), impact: 'Permite ejecutar código o comandos controlados por datos externos.', recommendation: 'Eliminar la ejecución dinámica o usar una lista cerrada de comandos y argumentos.', tags: [] });
      }
    });
    // R11 seguridad: cuerpo HTTP sin límite
    if (lines.some((l) => /createServer\(/.test(l))) {
      const i = lines.findIndex((l) => /\bbody\s*\+=/.test(l));
      if (i >= 0 && !lines.some((l) => /(maxBody|MAX_BODY|content-length|\.destroy\()/i.test(l))) {
        add({ rule: 'cuerpo-sin-limite', category: 'seguridad', severity: 'media', file: f, lines: [i + 1, i + 1], evidence: lines[i].trim(), impact: 'Un cliente puede enviar un cuerpo enorme y agotar la memoria del servidor.', recommendation: 'Fijar un tamaño máximo y cortar la petición (413) al superarlo.', tags: [] });
      }
    }
  }

  findings.sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.file.localeCompare(b.file) || a.lines[0] - b.lines[0]);
  findings.forEach((x, i) => { x.id = `F-${i + 1}`; });
  return findings;
}

/** Marca como "demostrado" lo que una prueba ejecutada confirma (misma etiqueta y resultado distinto de PASS). */
export function markDemonstrated(findings, run) {
  for (const f of findings) {
    const hit = run.results.filter((r) => r.status !== 'PASS' && r.tags.some((t) => f.tags.includes(t)));
    if (hit.length) {
      f.kind = 'demostrado';
      f.demonstratedBy = hit.map((h) => h.id);
    }
  }
  return findings;
}
