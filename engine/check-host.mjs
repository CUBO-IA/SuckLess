// Proceso hijo: carga archivos de checks y ejecuta cada uno. PASS/FAIL sale SOLO de aquí.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const out = [];
for (const file of process.argv.slice(2)) {
  let mod;
  try {
    mod = await import(pathToFileURL(path.resolve(file)).href);
  } catch (e) {
    out.push({ id: `LOAD:${path.basename(file)}`, title: `No se pudo cargar ${path.basename(file)}`, criterion: null, tags: [], status: 'ERROR', ms: 0, error: { name: e.name, message: e.message, stack: e.stack } });
    continue;
  }
  for (const c of mod.checks) {
    const t0 = performance.now();
    const base = { id: c.id, title: c.title, criterion: c.criterion ?? null, tags: c.tags ?? [] };
    try {
      await c.run();
      out.push({ ...base, status: 'PASS', ms: Math.round(performance.now() - t0) });
    } catch (e) {
      const status = e && e.name === 'AssertionError' ? 'FAIL' : 'ERROR';
      out.push({ ...base, status, ms: Math.round(performance.now() - t0), error: { name: e?.name, message: String(e?.message), stack: String(e?.stack) } });
    }
  }
}
process.stdout.write('\n@@SUCKLESS_RESULTS@@' + JSON.stringify(out) + '\n');
