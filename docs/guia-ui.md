# Guía UI — Sistema de diseño SuckLess

Etapa 8 · Documentación del sistema de diseño Futuristic Cyberpunk Dashboard
(empezada en Etapa 1 y consolidada al cierre). Fuente del plan:
`prompts/SuckLess_Plan_Frontend.md` §3. **Referencia visual viva:** catálogo
histórico en `views/ui-kit.bxm` (retirado del nav con la entrega) y
`ui-kit.html` (harness estático regenerable con `npm run uikit:build`).

---

## 1. Tokens (`assets/css/tokens.css`)

Sin build. Un solo archivo de variables; **los componentes no definen colores nuevos**.

### 1.1 Paleta

| Grupo | Token | Valor | Uso |
|---|---|---|---|
| Fondos | `--bg-main` | `#030712` | Fondo de página |
| | `--bg-card` | `#0A0F1E` | Tarjetas |
| | `--bg-elevated` | `#111827` | Superficies elevadas (nav cola, modales, inputs) |
| | `--border` / `--border-strong` | `#1F2937` / `#374151` | Bordes 1 px |
| Texto | `--text-primary` | `#F8FAFC` | Texto principal |
| | `--text-secondary` | `#94A3B8` | Texto secundario (≥4.5:1 verificado) |
| | `--text-muted` | `#64748B` | Solo texto grande o decorativo (no llega a AA en chico) |
| Marca | `--cyan` / `--cyan-bright` | `#06B6D4` / `#22D3EE` | Interacción: enlaces, foco, tab/nav activa |
| | `--magenta` / `--magenta-bright` | `#D946EF` / `#E879F9` | Acento degradado/decoración. **Nunca estado** |
| Semánticos | `--ok` / `--ok-bg` | `#22C55E` | OK / PASS / APROBADO |
| | `--fail` / `--fail-bg` | `#EF4444` | FAIL / ALTA / error |
| | `--warn` / `--warn-bg` | `#F59E0B` | INCOMPLETO / hipótesis / MEDIA |
| | `--idle` / `--idle-bg` | `#64748B` | EN COLA / pendiente |
| Degradado | `--grad-brand` | cian → magenta | Botón primario, texto de héroe |

> **Regla crítica:** cian y magenta son de marca, **jamás** indican PASS/FAIL.
> Si un color debe significar resultado, solo puede ser `--ok`/`--fail`/`--warn`
> y su fuente es el campo `status` devuelto por el ejecutor (§1.1 del plan).

### 1.2 Fuentes (vendorizadas, offline)

Variables `.woff2` locales en `assets/fonts/` con su `LICENSE-*.md`:

| Fuente | Token | Rango | Uso |
|---|---|---|---|
| Orbitron | `--font-display` | 400–900 | Encabezados, KPI, botones primarios (neón solo en títulos) |
| Space Grotesk | `--font-body` | 300–700 | Cuerpo, descripciones, formularios |
| JetBrains Mono | `--font-mono` | 100–800 | Datos técnicos, IDs, timestamps, badges, nav, logs, código |

Fallback: always `system-ui` / `ui-monospace`. `font-display: swap`.

### 1.3 Forma y movimiento

`--radius: 12px` (tarjetas) · `--radius-sm: 8px` (controles) ·
`--space-card: 24px` (32px en tarjetas grandes) · `--t-fast: 200ms` ·
`--t-slow: 400ms` · `--ease-out` · `--container: 1280px` ·
`--glow-cyan` / `--neon-title` (solo títulos y hover de tarjeta).

---

## 2. Base (`assets/css/base.css`)

- Reset ligero, `color-scheme: dark`, rejilla tenue de fondo en `body`.
- `.neon` (text-shadow solo en títulos) y `.grad-text` (recorte cian→magenta).
- **Foco visible cian**: `:focus-visible { outline: 2px solid var(--cyan-bright) }` global.
- `.container` 1280 px con padding fluido.
- `.visually-hidden` + `.skip-link` ("Saltar al contenido principal").
- Animaciones utilitarias: `.reveal` (+ `.is-visible` vía IntersectionObserver,
  `no-js .reveal` visible sin JS), `.animate-in`, `.spin`, `.pulse`.
- **`prefers-reduced-motion: reduce`** apaga animaciones, shimmer y oculta el
  canvas de partículas (`#suckless-particles`).
- **Zonas limpias (§3.6)** `.clean-zone`: visor de código, trazas, logs y
  textareas — fondo sólido, sin glow, sin gradiente, sin animación.

---

## 3. Componentes (`assets/css/components/`)

| Archivo | Componente | Notas clave |
|---|---|---|
| `card.css` | `.card .card--lg .card--hover` | borde 1px, r12, hover `translateY(-4px)` + glow cian |
| `button.css` | `.btn .btn--primary/secondary/danger/ghost/icon/sm` | primario = `--grad-brand`; estados hover/focus/active/disabled; objetivo ≥44px |
| `badge.css` | `.badge .badge__icon` + variantes | **siempre ícono + texto + color**; `.provenance` (procedencia) y `.ai-tag` (rótulo IA) |
| `kpi.css` | `.kpi .kpi--ok/fail/warn/idle` | número grande display + etiqueta mono |
| `nav.css` | `.nav` | fija, `backdrop-filter: blur(12px)`, ítem activo cian, toggle móvil |
| `table.css` | `table.data` + `.table-wrap` | cabeceras mono mayúsculas; `data-label` + media query → tarjetas apiladas en móvil |
| `tabs.css` | `.tabs [role=tablist]` | tab activa cian; flechas ←/→ gestionadas en cada módulo |
| `accordion.css` | `details.acc` | acordeón nativo accesible |
| `modal.css` | `dialog.suckless-modal` | comportamiento en `assets/js/ui/modal.js` (focus trap, Esc, retorno de foco) |
| `toast.css` | `.toast-region .toast--ok/error/info` | única región global `aria-live=polite` (ui/toast.js) |
| `form.css` | `.field .input .select .textarea .hint .field__error .secret-warning` | `field__error` con `role=alert`; aviso permanente anti-secretos |
| `dropzone.css` | `.dropzone .file-list` | estados hover/aceptado/rechazado; `<input type=file>` oculto accesible |
| `skeleton.css` | `.skeleton.*` | shimmer; se quita al llegar data |
| `progress` | (en `modules/history.css`) | `.progress .progress__bar` — mover a components si se reutiliza |
| `empty-state.css` | `.empty-state (--error)` | vacío vs error distinguibles (color + ícono + texto) |
| `stepper.css` | `.step .step--current/--done` | flujo ACLARAR→DIAGNOSTICAR→PROBAR→VERIFICAR |
| `code-view.css` | `.code-view .line-num .syn-*` | tema de resaltado propio §3.8; rangos citados `.line-cited` |
| `demo-banner.css` | `#suckless-demo-banner` | visible con `data-suckless-demo="true"` en `<html>` |

### Módulos de página (`assets/css/modules/`)
`dashboard · two-doors · requirements · executor · code · history` — un CSS por
vista; nunca duplicar reglas de components.

---

## 4. JavaScript (`assets/js/`)

- **`main.js`**: punto de entrada; boots aislados (un módulo que lanza queda
  registrado en consola y no tumbla la página); toggle de nav móvil.
- **`api.js`**: única capa de datos (`USE_MOCK`). Ofrece `api/apiGet/apiPost/apiDelete`,
  `ApiError` con códigos uniformes, `pollRun()` (polling aislado, migrable a SSE)
  y `wrap()` para el patrón loading/error/empty/data.
- **`ui/`**: `particles` (canvas, pausa en pestaña oculta, off con reduced-motion),
  `modal`, `toast`, `reveal`, `lightbox`, `dropzone`, `secrets-check`.
- **`modules/<vista>.js`**: un módulo por vista con `boot<Modulo>()` que sale
  temprano si el selector raíz no existe. Render SIEMPRE `textContent`/`createElement`.

### Convenciones obligatorias

1. **Seguridad**: logs, código, stack traces y texto de IA = contenido no
   confiable. Prohibido `innerHTML` con datos externos (§1.2).
2. **Integridad**: badge PASS/FAIL solo desde `run.status`/`check.status`;
   interpretación de IA en su panel etiquetado; hipótesis siempre
   "PENDIENTE DE PROBAR" (§1.1).
3. **Estado**: el patrón loading → error → empty → data siempre vía `wrap()`;
   vacío ≠ error.
4. **Progressive enhancement**: la página funciona sin JS; el JS solo añade
   interactividad. Estados en vivo con `aria-live="polite"`.
5. **URL compartida**: filtros/modo se sincronizan con `history.replaceState`
   (Two Doors `?mode=`, Historial `?type=&q=`) — navegable con clase.

---

## 5. Vistas SSR (`views/`)

Patrón de wrapper idéntico (ver `views/rename-me.bxm` para la convención):

```text
views/index.bxm + dashboard.bxm          Panel Principal (raíz /)
views/requirements-index.bxm (+ .bxm)    Requirements Gate · P0
views/two-doors-index.bxm (+ .bxm)       Two Doors (?mode=debug|verify)
views/executor-index.bxm (+ .bxm)        Test & Evidence Executor · P0
views/code-index.bxm (+ .bxm)            Code Explainer & Review · P0
views/history-index.bxm (+ .bxm)         Report History & Export
views/layouts/base.bxm                   layout único (head css + nav + banner + slot main)
views/partials/{nav,demo-banner,badge,toast,modal,empty-state,kpi-card}.bxm
```

Cada vista define `pageTitle`, `activeNav`, `useMock=true` y envuelve su
contenido en `bx:savecontent pageContent` antes de incluir el layout.
**Todo dato dinámico en SSR va por `encodeForHTML`** — nada de interpolación cruda.

`views/ui-kit.bxm` queda como catálogo interno de desarrollo (fuera de la nav):
regenera su preview estático con `npm run uikit:build` si ajustas componentes.

---

## 6. Checklist de consistencia al añadir vistas o componentes

- [ ] Tokens para todo color/forma/movimiento; cero valores mágicos.
- [ ] Badge = ícono + texto + color (nunca color solo).
- [ ] Foco visible en cian en todo control; `Esc` cierra diálogos.
- [ ] Contraste AA verificado si introduces una combinación nueva
      (`--text-muted` prohibido en texto pequeño).
- [ ] Objetivos táctiles ≥44×44 (padding mínimo incluye).
- [ ] `prefers-reduced-motion` respetado si añades animación.
- [ ] Sin scroll horizontal a 1440 / 768 / 390 px (tablas → data-label).
- [ ] Progresiva: visible sin JS; estados en vivo con `aria-live`.
