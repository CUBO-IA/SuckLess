/**
 * scripts/build-uikit-harness.js — Harness de desarrollo para previsualizar el
 * ui-kit SIN BoxLang runtime. Emula las sustituciones de variables del SSR
 * (valores por defecto de Etapa 0) y coloca los partials en el layout.
 * El resultado es un artefacto de preview; la verdad de las plantillas sigue
 * siendo los .bxm. Regenerar tras editar cualquier .bxm.
 *
 * Node >= 22. Sin dependencias.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (t) => t.replace(/<bx:output>|<\/bx:output>/g, '');

/**
 * Sustituye las interpolaciones BoxLang con los valores del harness.
 * Solo cubre las variables del layout y del partial nav (Etapa 0/1).
 */
function bxs(template) {
  return template
    .replace(/#encodeForHTML\(\s*\(\s*pageTitle \?: "SuckLess" \)\s*\)#/, 'UI Kit · SuckLess')
    .replace(/#\(\s*useMock \? 'true' : 'false' \s*\)#/, 'true') // USE_MOCK=true (Etapa 0)
    .replace(/#\(\s*activeNav == 'ui-kit' \? 'aria-current="page"' : '' \s*\)#/, 'aria-current="page"')
    .replace(/#\(\s*activeNav == '(?:dashboard|requirements|two-doors|executor|code|history)' \? 'aria-current="page"' : '' \s*\)#/g, '');
}

const nav = bxs(strip(read('views/partials/nav.bxm')));
const banner = bxs(strip(read('views/partials/demo-banner.bxm')));
const base = bxs(strip(read('views/layouts/base.bxm')))
  .replace(/<bx:include template="\.\.\/partials\/nav.bxm" \/>/, nav)
  .replace(/<bx:include template="\.\.\/partials\/demo-banner.bxm" \/>/, banner);
const kit = strip(read('views/ui-kit.bxm'));
const out = base.replace(
  '<main id="main-content" class="container" tabindex="-1">',
  '<main id="main-content" class="container" tabindex="-1">' + kit,
);

fs.writeFileSync(path.join(ROOT, 'ui-kit.html'), out);
console.log('harness regenerado: ui-kit.html (preview estático; no reemplaza SSR BoxLang)');
