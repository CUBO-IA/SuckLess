/**
 * SuckLess · assets/js/main.js — Entry point de la UI base.
 * Vanilla ES modules, sin build. Si el JS falla, la página sigue
 * navegable y legible (progressive enhancement).
 */
import { initParticles } from './ui/particles.js';
import { initReveal } from './ui/reveal.js';
import { boot } from './modules/dashboard.js';
import { bootTwoDoors } from './modules/two-doors.js';
import { bootRequirements } from './modules/requirements.js';
import { bootExecutor } from './modules/executor.js';
import { bootCode } from './modules/code.js';
import { bootHistory } from './modules/history.js';

document.documentElement.classList.remove('no-js');

initReveal();
initParticles();

/** Etapa 8: cada módulo arranca aislado — un boot que lanza no deja la
 *  pantalla en blanco; los módulos ya se autoprotegen por vista (comprueban
 *  su selector raíz), esto cubre errores de importación/ejecución inesperados. */
for (const [name, bootFn] of [
  ['dashboard', boot],
  ['two-doors', bootTwoDoors],
  ['requirements', bootRequirements],
  ['executor', bootExecutor],
  ['code', bootCode],
  ['history', bootHistory],
]) {
  try { bootFn(); } catch (e) { console.error(`[suckless] boot ${name} falló:`, e); }
}

// Toggle de navegación móvil (accesible con aria-expanded)
const toggle = document.getElementById('nav-toggle');
const links = document.getElementById('nav-links');
if (toggle && links) {
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  // Cerrar el menú con Escape si tiene el foco dentro
  links.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  });
  // Cerrar el menú al navegar a otra página dentro del mismo doc (SSR)
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}
