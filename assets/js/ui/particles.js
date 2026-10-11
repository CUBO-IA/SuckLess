/**
 * SuckLess · ui/particles.js — Fondo canvas de partículas (§3.5).
 * Pocas partículas, opacidad baja, pausa si la pestaña no está visible
 * y DESACTIVADO con prefers-reduced-motion (§1.4).
 * Importado por base.bxm. Sin dependencias.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

export function initParticles() {
  const canvas = document.getElementById('suckless-particles');
  if (!canvas || REDUCED.matches) return canvas ? null : null;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;
  let raf = 0;
  let running = false;
  let particles = [];
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const N = 46; // pocas partículas
  const COLORS = ['rgba(6,182,212,ALPHA)', 'rgba(217,70,239,ALPHA)'];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    particles = Array.from({ length: N }, () => spawn());
  }

  function spawn() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (Math.random() * 1.6 + 0.6) * dpr,
      vx: (Math.random() * 0.22 + 0.04) * dpr,
      vy: (Math.random() * -0.16 - 0.04) * dpr,
      color: COLORS[Math.random() < 0.75 ? 0 : 1].replace('ALPHA', String(Math.random() * 0.22 + 0.06)),
    };
  }

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x > canvas.width + p.r) p.x = -p.r;
      if (p.y < -p.r) p.y = canvas.height + p.r;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  document.addEventListener('visibilitychange', () => {
    // Pausa cuando la pestaña no está visible (rendimiento)
    if (document.hidden) stop();
    else if (!REDUCED.matches) start();
  });

  const reducedObserver = () => {
    if (REDUCED.matches) { stop(); canvas.style.display = 'none'; }
  };
  REDUCED.addEventListener?.('change', reducedObserver);

  window.addEventListener('resize', () => { resize(); }, { passive: true });

  resize();
  start();
  return () => { stop(); };
}
