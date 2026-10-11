/**
 * SuckLess · ui/reveal.js — Aparición progresiva de secciones (§3.5).
 * Clase .reveal + .is-visible con IntersectionObserver; sin JS no oculta
 * nada (base.css hace .reveal visible por defecto con no-js).
 */

export function initReveal(root = document) {
  const items = root.querySelectorAll('.reveal');
  if (!items.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });

  items.forEach((el) => io.observe(el));
  return io;
}
