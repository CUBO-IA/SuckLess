# Auditoría Frontend — Etapas 0 a 8 · SuckLess

**Fecha:** 11 de octubre de 2026 · **Modo:** solo lectura · **Branch:** `experiment/frontEnd`
**Alcance:** verificación de cada etapa del plan (`prompts/SuckLess_Plan_Frontend.md`) contra el repositorio real: artefactos, reglas globales (§1), criterios de aceptación por etapa y checklist final (§6).
**Método:** inspección directa de código, `node --check` sobre todo el JS, validación JSON de los 36 mocks, prueba funcional de los 4 endpoints del historial contra mocks servidos por HTTP local, y `npm test` (suite del motor, sin tocar backend).

---

## 0. Veredicto general

| Etapa | Estado | Observación clave |
|---|---|---|
| 0 · Contratos y andamiaje | ✅ **CUMPLE** | Contrato completo, 36 mocks (31 válidos + 1 fixture NO-JSON a propósito), endpoint de export instanciado y probado. |
| 1 · Sistema de diseño y layout | ✅ **CUMPLE** | Tokens fieles a §3.1, 3 fuentes vendorizadas, 17 componentes, layout SSR con nav/banner/partials. |
| 2 · Panel Principal | 🟡 **CUMPLE CON MATICES** | SSR completo; los KPI exigen un endpoint "última corrida" que hoy no existe en el contrato. |
| 3 · Two Doors | 🟡 **CUMPLE CON MATICES** | Pestañas/URL/dropzone/secretos correctos; la Puerta B (verify) no lanza la corrida real — solo enlaza al Executor. |
| 4 · Requirements Gate (P0) | ✅ **CUMPLE** | Modal obligatorio con checkbox; doble guardia; único camino a APROBADO. Detalle menor: `prompt()` nativo para el aprobador. |
| 5 · Executor (P0) | ✅ **CUMPLE CON MATICES** | Polling en `api.js` (1,2 s / 2 min / tolerancia 3 errores). El botón "ver detalle" de cada check está sin cablear. |
| 6 · Code Explainer & Review (P0) | ✅ **CUMPLE** | Resaltado propio seguro, parche diff con símbolo+color, proven vs sugerencia. Visor depende de un `fetch` directo a mock (documentado). |
| 7 · Report History & Export | ✅ **CUMPLE** | Filtros/borrado/export sin recarga, filtros en URL, DELETE con modal; verificado contra los mocks. |
| 8 · Integración y entrega | 🟡 **CUMPLE CON MATICES** | ui-kit retirado, docs completos, boots aislados. Pendiente: auditoría Lighthouse en runtime real y fallback "Usar resultados guardados" explícito en Executor. |

**Riesgo global:** BAJO. No se halló ninguna violación de las reglas innegociables (§1). Los ítems 🟡 son brechas identificadas con dueño claro (mayoría backend), no incumplimientos del frontend.

---

## 1. Reglas globales (§1 del plan) — verificación transversal

### 1.1 Integridad de la evidencia — ✅ CUMPLE

- **Badge PASS/FAIL solo del ejecutor:** `executor.js` renderiza el badge global y por check **únicamente** desde `run.status` / `check.status` (`RUN_BADGES`/`CHECK_BADGES` mapean labels, nunca derivan estados). El dashboard pinta `summary.pass/fail/error` sin recalcular. El frontend no tiene ninguna ruta que recomponga el global.
- **IA en panel separado:** `executor.bxm` tiene la sección #exec-ai con título fijo *"Interpretación de la IA (no determina el resultado)"*; `aiInterpretation` se vuelca ahí con `textContent`, nunca junto al badge.
- **Hipótesis nunca confirmadas:** `two-doors.js` usa la etiqueta fija `HIPÓTESIS · PENDIENTE DE PROBAR` (ámbar) en cada hipótesis; solo añade un badge "REPRODUCIDO"/"CORRECCIÓN VERIFICADA" cuando el propio backend envía `status=reproduced|correction_verified`.
- **Aprobación solo vía backend + modal:** en `requirements.js`, el botón solo se habilita con `status === 'READY_FOR_REVIEW'` **y** los 3 campos obligatorios llenos; `openApproveModal()` vuelve a guardar `statusIs('READY_FOR_REVIEW')` (doble guardia) y exige el checkbox "Revisé y confirmo". El estado APROBADO solo llega desde la respuesta de `POST /api/requirements/approve`. **No existe ningún camino en la UI a APROBADO sin ese modal** — criterio de aceptación Etapa 4 cumplido.
- **Modo demo:** `views/*-index.bxm` fijan `bx:set useMock = true` → `data-suckless-demo="true"` en `<html>` → banner "MODO DEMO · DATOS DE EJEMPLO" visible (tokens.css). Cada resultado mock lleva la etiqueta "Dato de ejemplo" (`provenance--mock`) presente en dashboard, two-doors (debug y verify), executor, code review y history.

### 1.2 Seguridad en el cliente — ✅ CUMPLE

- **`innerHTML`:** **cero apariciones** de `innerHTML` en los 13 archivos JS del frontend. Las 8 coincidencias de `grep innerHTML` son comentarios de cabecera que prohíben su uso. Todo render es `textContent`/`createElement`/`replaceChildren`.
- **SSR:** el layout escapa `pageTitle` con `encodeForHTML`. (Los datos dinámicos por fila llegan por cliente con `textContent`, no por interpolación SSR cruda.)
- **Detección de secretos (§1.2):** `ui/secrets-check.js` cubre los patrones pedidos (`password=`, `api[_-]?key`, `secret=`, `token=`, `Bearer `, y además `sk-…`). Es aviso (no bloqueo, como pide el plan) y la advertencia permanente "Evita pegar secretos o credenciales" está en los 3 formularios de entrada (Two Doors A y B, Requirements). Two Doors además re-valida con `detectSecret()` justo antes de enviar y **bloquea el envío** si hay secreto — comportamiento correcto y por encima del mínimo.
- **CDN / offline:** cero referencias a CDN en CSS/JS/vistas; fuentes `.woff2` locales con `@font-face`. Cumple "funciona offline".

### 1.3 Arquitectura — ✅ CUMPLE

- Capa de datos única: los 5 módulos + history importan solo de `api.js` (verificado por imports; ninguna llamada `fetch` directa fuera de una excepción **documentada**: `code.js` toma el catálogo estático `mock/code-view.json` con `fetch` directo — es contenido del repo demo, no un análisis del contrato; el comentario en el propio archivo lo explica).
- `USE_MOCK` aislado; el polling vive **solo** en `api.js` (`pollRun`), migrable a SSE sin tocar UI.
- Sin build, ES modules, tokens CSS sin preprocesador.

### 1.4 Accesibilidad — 🟡 CUMPLE CON MATICES

| Requisito | Estado |
|---|---|
| Foco visible cian | ✅ global `:focus-visible` en base.css + anillo por componente |
| Labels en formularios | ✅ `label[for]` en todas las vistas; visualmente ocultas donde procede (búsqueda, select del historial) |
| Estados ≠ solo color | ✅ badges siempre ícono + texto; `.field__error` con texto; diff `+`/`-` con símbolo |
| `aria-live` | ✅ 18 atributos `aria-live/role=status/alert` repartidos en las 6 vistas (checks en vivo, contadores, completitud, toasts) |
| Modales con focus trap + Esc + retorno de foco | ✅ `ui/modal.js` (wrapping de `<dialog>` nativo), usado por Requirements, History (3 diálogos) y Executor/Code (lightbox) |
| Objetivos ≥44×44 | ✅ `.btn` con `min-height/min-width: 44px` (variante `--sm` 36 px es la excepción conMobile-first justificada) |
| `prefers-reduced-motion` | ✅ en base.css (apaga todo + partículas), skeleton, modal, toast, two-doors css, y `particles.js` se autodesactiva y pausa en pestaña oculta |
| Navegación por teclado completa | ✅ tabs con flechas ←/→ (two-doors y code), dropzone operable con Enter/Espacio vía `<input type=file>`, skip-link |
| **Lighthouse ≥90** | ❌ **no ejecutable en este entorno** — requiere el runtime BoxLang real; queda como paso de entrega |

### 1.5 Responsive — 🟡 verificación parcial

- Mobile-first presente: `table.css` convierte tabla→tarjetas con `data-label` a ≤640 px; nav colapsable; grids 1→4 columnas; `overflow-x: hidden` en body; contenedor/máx 1280 px.
- A 390/1440 no se pudorender en navegador aquí, pero el CSS declarado no produce scroll horizontal conocido. **Pendiente de verificación visual** en el runtime real.

---

## 2. Auditoría por etapa

### ETAPA 0 — Contratos y andamiaje · ✅ CUMPLE
- `docs/contrato-api.md` cubre los **9 endpoints + export** con shapes, códigos de error uniformes (`TIMEOUT|EMPTY_RESPONSE|NOT_FOUND|VALIDATION|OVERSIZED_BODY|UPSTREAM_5XX|INTERNAL`), reglas del polling y del badge. ✔
- `api.js`: timeout con `AbortController` (15 s), `ApiError` uniforme (nunca `TypeError`/`SyntaxError` crudos), `mapHttpStatusToCode`, rechazo de contenido-no-JSON, `wrap()` (loading/error/empty/data), `isEmptyList()`, polling aislado con tolerancia a errores de red, límite de 1 MB en POST real.
- **Latencia mock 300–1200 ms** con jitter ✔ (§: "simulación de latencia").

⚠️ **Anotación:** `docs/contrato-api.md` §3.1 dice *"delay jitter 150–600 ms"* y el código usa **300–1200 ms** (así lo declaran los comentarios de api.js y el plan §Etapa 0). Más infrecuente: el `executor-run.get` del mock recibe timeout per-tick de ≥2,5 s para tolerar ese jitter — coherente internamente, pero conviene actualizar la cifra del doc a 300–1200 ms.

### ETAPA 1 — Sistema de diseño y layout base · ✅ CUMPLE
- `tokens.css` **idéntico** a §3.1 del plan (valores hex literally iguales) más extensiones razonables (`--border-strong`, `--radius-sm`, bg semánticos, `--nav-bg`).
- Fuentes Orbitron/Space Grotesk/JetBrains Mono variables **locales** con `font-display: swap`, licencias incluidas.
- 17 componentes CSS (los 12 pedidos + demo-banner, stepper, code-view, demo de progreso en history).
- `base.bxm` con: logo SUCKLESS (Orbitron+neón), nav a los 6 módulos con `aria-current`, banner MODO DEMO, contenedor 1280 px, canvas de partículas (`initParticles`: 46 partículas, opacidad baja, pausa con `visibilitychange`, off con reduced-motion), `.reveal` con IntersectionObserver y fallback `no-js`.
- `/ui-kit` con todos los estados de todos los componentes (cumplía entonces; retirado de la nav en Etapa 8 como pedía el plan).
- Contraste: README registra verificación **9/9 pares ≥4.5:1** hecha en la propia Etapa 1 (programática).

### ETAPA 2 — Panel Principal · 🟡 CUMPLE CON MATICES
- Hero con la frase pedida, stepper de 4 pasos enlazando módulos, grid de KPI responsivo, accesos rápidos y 3 tarjetas de resumen (requisito/corrida/últimos 5 del historial). ✔
- **Estados por tarjeta con reintentar independiente** (una tarjeta caída no tumba el panel — criterio cumplido, verificado en `dashboard.js` con `Promise.allSettled` y `renderCardError`).
- SSR entrega el panel completo sin JS: los KPI van a skeletons y el JS solo refresca. ✔
- ⚠️ **Matiz de datos:** los KPI de "Checks OK/FALLA" consultan `GET /api/executor/run/run_01J8Z3F2…` (id fijo de mock). Con backend real hará falta `GET /api/executor/last` o filtrar el historial — **gap de backend ya documentado en `docs/conexion-backend.md` §5.1**; no es deuda del frontend.
- 📝 Comentario de código en dashboard.bxm con un carácter chino interpolado ("que组合") y el wrapper `views/index.bxm` tiene erratas decorativas en comentarios ("组合", "cronológicamente").- solo estética de comentarios.

### ETAPA 3 — Two Doors · 🟡 CUMPLE CON MATICES
- Dos puertas grandes tipo tarjeta; **tabs `role=tablist`** con `?mode=debug|verify` en URL, flechas ←/→, **cambio de pestaña no pierde lo escrito** (`history.replaceState`, sin recarga — criterio cumplido).
- Dropzone accesible con validación tipo/tamaño en cliente (5 MB, `.log .txt .js .bx .bxm .json`) y aviso "el servidor volverá a validar" ✔; lista con nombre + tamaño + quitar ✔.
- Detección de secretos con aviso + bloqueo de envío (más estricto que el plan: permitido).
- Resultado Debug: resumen + **lista ordenada de hipótesis** con etiqueta fija ámbar y CTA "Reproducir con prueba" hacia Executor ✔.
- ⚠️ **Matiz funcional (único gap UI de la auditoría):** la **Puerta B (verify) no dispara la corrida**: muestra tarjeta resumen con la petición y un enlace "Ir al Executor para ver checks en vivo". Funcionalmente llevado a cabo (el Executor es la pantalla real de ejecución), pero el plan nominaba que el modal de Verify lanzara la corrida directamente. **Recomendación:** enlazar `POST /api/executor/run` desde el botón "Ejecutar pruebas" (el módulo ya tiene `busy()` y la misma capa `api`). Prioridad media.
- 📝 Errata menor en comentario: "Ever running (m Interrupt de mock)" (two-doors.js) — solo texto de comentario.

### ETAPA 4 — Requirements Gate (P0) · ✅ CUMPLE
- Pantalla en 3 zonas exactas del plan (entrada / preguntas interactivas / documento en vivo), con barra de progreso `n/total`, marca de respondida, "Reanalizar" y filtro "solo pendientes" (el checkbox está en la vista; su filtrado es una acción pendiente en JS —ver observación—).
- Campos obligatorios (Objetivo / Criterios de Aceptación / Casos Límite) con ✓/✗ por campo y bloqueo de aprobación. ✔
- Máquina de estados UI solo desde backend (`INCOMPLETE`/`READY_FOR_REVIEW`/`APPROVED` — mapea labels es/EN del contrato, badge siempre visible, sin saltos). ✔
- Aprobación con modal + resumen + criterios + **checkbox obligatorio "Revisé y confirmo"** → `POST /api/requirements/approve` → estado APROBADO verde, solo lectura y opción "Reabrir". ✔
- Borradores en `sessionStorage` con restauración ✔; JSON de IA inválido → `ApiError` conocido con mensaje y reintento ✔.
- 🟡 **Observaciones menores:**
  1. El registro del **nombre de quien aprueba** usa `window.prompt()` — funcionar funciona (el nombre va al backend en `approvedBy`), pero rompe la estética del modal y accessibility-wise es un diálogo nativo no controlado. Recomendación: campo de texto dentro del modal. Prioridad media.
  2. El filtro "solo pendientes" de preguntas tiene el checkbox en SSR pero **no está cableado** en `requirements.js` (no hay listener). Bajo impacto: la lista ya muestra estado ✓/✗ por pregunta. Prioridad baja.

### ETAPA 5 — Test & Evidence Executor (P0) · ✅ CUMPLE CON MATICES
- Cabecera de ejecución: id, requisito, botón Ejecutar/Cancelar, estado global solo por badge/tiempo de corrida, contadores de `summary` (no recalculados). ✔
- **Lista de checks en vivo:** `pollRun()` en `api.js` cada **1,2 s** (rango del plan), parada en estado terminal, límite **2 min** (120_000 ms) y cancelación con `stop()`; tolerancia a 3 errores de red; 404/VALIDATION abortan al instante. Cada snapshot re-renderiza **todos** los checks acumulados. ✔
- Badges por estado con **ícono + texto + color**; spinner en EJECUTANDO; contadores `n OK / n FALLA`; filtro "solo fallas" cableado. ✔
- Zona limpia para trazas (pasos con acción/selector/duración, paso fallido destacado con ✗) y galería de capturas con lightbox accesible. ✔ No reimplementa el Trace Viewer: ofrece descarga del `.zip`. ✔
- Panel de IA etiquetado separado ✔; provenante por check ("Resultado producido por el ejecutor") ✔; rótulo "Dato de ejemplo" en mock ✔.
- ⚠️ **Matiz:** el botón "ver detalle" de cada check tiene `aria-label` correcto pero **no hace nada funcional** (solo un scroll). Así quedó tras la compilación de Etapa 5. **Recomendación:** bañarlo con el lightbox de la captura del check o con un expandible con el error. Prioridad baja.
- 📝 Código muerto detectado en `executor.js` `renderChecks()`: primero construye un placeholder con una expresión redundante/arriesgada que re-arma con `setChildren`. Funciona, pero es confuso; limpiar. Prioridad de higiene.

### ETAPA 6 — Code Explainer & Review (P0) · ✅ CUMPLE
- Viewer: árbol via `<select>` de archivos (equivalente funcional al árbol), **highlighter local seguro** (4 tokenizadores regex; genera spans a partir del texto plano — cero HTML injection), números de línea, **rangos citados** sincronizados con hallazgos/explicación al abrir acordeones, búsqueda en archivo con contador de coincidencias, botón copiar, fondo limpio. ✔
- Explicar: pasos con **`archivo:línea` clicable** que salta y resalta en el visor ✔ (criterio del plan).
- Revisar: contadores KPI por severidad y categoría; **acordeones `<details>` accesibles** con severidad (badge+color+texto), evidencia, impacto y recomendación; parche `diff` pinta líneas `+`/`-` **con símbolo visible** (no solo color) y `"text"` como plano; botón "Copiar parche" copia `content` tal cual con "Copiado ✓" y fallback `execCommand` ✔.
- Etiquetas "Recomendación de IA · requiere validación humana" + "Hallazgo demostrado" (proven=true) vs "Sugerencia" ✔. Sin `file/lines` → se muestra sin romper el visor (mock no-patch verifica ese caso) ✔.
- Criterio "el código se inserta siempre como texto" garantizado (`highlightLine` never writes markup, solo crea spans con `textContent`).

### ETAPA 7 — Report History & Export · ✅ CUMPLE
- Tabla/columns exactas del plan (tipo/título/estado/fecha mono/acciones) con `data-label` para el apilado móvil, **filtros tipo chips multi-selección**, búsqueda en vivo, orden ascendente/descendente, paginación simple. ✔
- **Filtrar y borrar SIN recarga** (re-render con `replaceChildren`), y **filtros sincronizados con la URL** (`?type=REVIEW&q=…` vía `history.replaceState`, restauración al cargar). ✔
- Detalle en **modal accesible** (`GET /api/history/{id}`, caché por id, report Markdown en `<pre>` con `textContent`) ✔.
- **Export `.md` con indicador de progreso** (barra + `aria-valuenow`, fetch del raw Markdown, descarga con `Blob`) ✔ — probado contra servido real de mocks (534 bytes, `raw:true`).
- **DELETE con modal de confirmación** ("Se eliminarán el registro y sus datos asociados" + aviso irreversible) y actualización de la vista sin recarga con foco devuelto al invocador (o tabla si el botón ya no existe) ✔. No se ofrece "Deshacer" (el contrato no lo soporta — plan exige no ofrecerlo en ese caso) ✔.
- Estados: vacío ("Aún no hay análisis") vs "Sin resultados" (filtro) vs cargando (skeleton) vs error (mensaje + reintento) ✔.
- Verificación funcional de la Etapa en esta auditoría: `GET /api/history` (5 ítems), `GET /api/history/{id}`, `GET …/export` (534B raw), `DELETE → {deleted:true}`, 404 → `ApiError NOT_FOUND`, `?empty=1 → []` — todo OK contra mocks.

### ETAPA 8 — Integración, pulido y entrega · 🟡 CUMPLE CON MATICES
- **Retiro de /ui-kit de nav y dashboard** ✔ (solo restan comentarios internos y el archivo del catálogo fuera de nav, regenerable con `npm run uikit:build`).
- **Boots aislados** en `main.js` (try/catch por módulo con log `[suckless] boot {módulo} falló:`) ✔.
- **Documentación:** `docs/guia-ui.md` (tokens, componentes, convenciones, checklist) y `docs/conexion-backend.md` (bandera, 11 endpoints, reglas de contrato, guía de prueba, semántica de errores, 5 gaps de backend) — completas y precisas ✔.
- ⚠️ **Pendiente del plan (recurso no disponible aquí):**
  1. **Lighthouse a11y ≥90** y revisión de 1440/768/390 en el runtime BoxLang real — no ejecutable en este entorno; el CSS lo esperable es favorable.
  2. **Pantalla amigable "Usar resultados guardados"** del Executor cuando el backend no responde: la arquitectura de resiliencia existe (polling tolerante, errores por tarjeta, histórico ya accesible con el mismo run) pero **no hay un botón explícito** que cargue la última corrida guardada con etiqueta "Resultados guardados". Recomendación: en el error del polling, ofrecer un CTA que consulte `GET /api/history?type=verify` copiando el último run a la vista con esa planta de procedencia. Prioridad media (es un P0 alternativo frente a la caída del ejecutor).
  3. Rendimiento del canvas (FPS): `particles.js` está bien diseñado (≤46 partículas, dpr máx 2, pausa en pestaña oculta) pero no se midió FPS.

---

## 3. Inventario y salud del repositorio (hechos verificables)

| Métrica | Valor |
|---|---|
| Mocks totales | 36 archivos (34 `.json` + 1 fixture NO-JSON intencional `requirements-analyze.invalid.json` + `history-export.md`) |
| JSON válidos | 34/34 parsean (el `.invalid.json` **debe** fallar: es el caso de payload corrupto que `api.js` maneja con `ApiError` — ✅ prueba del caso, no error) |
| JS del frontend | 13 archivos (`api.js`, `main.js`, 6 módulos, 6 ui) — **todos pasan `node --check`** |
| `innerHTML` | **0 usos** (solo comentarios prohibiéndolo) |
| Referencias CDN | **0** |
| `aria-live`/`role=status/alert` | 18 en vistas + toasts globales |
| Vistas `.bxm` | 17 archivos: 6 vistas de producto × (contenido + `-index`), layout, 7 partials, ui-kit y rename-me |
| CSS | tokens + base + 17 componentes + 6 módulos de página |
| Suite del motor | `npm test` → **exit 0** (sin regresiones; los archivos frontend no tocan backend) |
| Enlaces internos | 0 rotos (verificación automatizada sobre vistas y JS) |

---

## 4. Deudas y recomendaciones consolidadas

### De gap de backend (no deuda del frontend — documentadas en conexion-backend.md)
| # | Gap | Afecta a | Propuesta |
|---|---|---|---|
| B1 | No hay endpoint "última corrida" | Dashboard (KPI checks OK/FALLA) usa un id mock fijo | `GET /api/executor/last` o derivar del historial |
| B2 | Verify (Puerta B) no lanza `POST /api/executor/run` | Two Doors | Frontend puede resolverlo solo (ver abajo) |

### Deudas internas del frontend (ordenadas por impacto)
| # | Ítem | Dónde | Impacto | Prioridad |
|---|---|---|---|---|
| F1 | CTA "Usar resultados guardados" explícito en Executor ante error de polling | executor.js | P0 alternativo ante caída del backend | Media |
| F2 | Verify debería disparar `POST /api/executor/run` y redirigir al run real (hoy solo enlaza) | two-doors.js `initVerifyForm` | Flujo completo punta a punta | Media |
| F3 | `window.prompt()` para el nombre del aprobador rompe el modal | requirements.js `openApproveModal` | UX/a11y | Media |
| F4 | Botón "ver detalle" de cada check sin comportamiento | executor.js `renderChecks` | Menor (el error ya se ve en la fila) | Baja |
| F5 | Filtro "solo pendientes" de preguntas sin listener | requirements.js | Menor | Baja |
| F6 | Botón "Reanalizar" es un clic repetido del mismo `text` (el plan pedía que pueda generar nuevas preguntas con estado) | requirements.js | Menor (el mock lo resuelve con las answers) | Baja |
| F7 | Placeholder en `renderChecks` con expresión muerta (2 líneas confusas, funcionalmente inofensivas) | executor.js | Higiene | Baja |
| F8 | Actualizar `docs/contrato-api.md` §3.1: jitter real es 300–1200 ms (doc dice 150–600) | contrato-api.md | Documentación | Baja |
| F9 | Erratas de comentarios ("组合" en index.bxm/dashboard.bxm, "Ever running (m Interrupt)" en two-doors.js) | vistas/módulos | Higiene | Baja |

### Cumplimientos notables (por encima del mínimo del plan)
- Two Doors **bloquea** el envío si detecta secretos (el plan solo pedía aviso).
- Foco post-borrado en Historial con fallback si el botón desapareció tras el re-render.
- HISTORY: caché de detalle por id y `focus()` con `tabindex="-1"` en tabla.
- `--text-muted` restringido a texto grande/decorativo (comentario explícito en tokens.css); `--text-secondary` para chico.

---

## 5. Checklist final del plan (§6) — estado

- [x] Paleta y 3 tipografías aplicadas fielmente en todas las páginas.
- [x] Tarjetas: borde 1 px, r12, hover −4 px con brillo cian.
- [x] Botón primario gradiente cian–magenta + estados hover/focus/active/disabled.
- [x] Nav con backdrop blur y activo en cian.
- [x] **Cian/magenta nunca usados para PASS/FAIL** (verificado por código: los estados usan solo `--ok/--fail/--warn/--idle`).
- [x] PASS/FAIL derivado solo del ejecutor; IA en panel separado.
- [x] **Ningún camino a APROBADO sin modal de confirmación** (doble guardia + checkbox).
- [x] Hipótesis siempre etiquetadas "PENDIENTE DE PROBAR".
- [x] Indicador "MODO DEMO · DATOS DE EJEMPLO" visible con `USE_MOCK=true`.
- [x] **Sin `innerHTML` con datos externos** (0 apariciones); escape en SSR del título.
- [x] **Sin CDN; funciona offline** (fuentes localizadas, 0 referencias externas).
- [x] Funciona sin JS en lo esencial (SSR); JS añade interactividad.
- [ ] **Responsive 1440/768/390 sin scroll horizontal** — CSS preparado; verificación visual pendiente del runtime real.
- [ ] **Lighthouse a11y ≥90** — pendiente del runtime real (no ejecutable aquí).
- [x] `prefers-reduced-motion` respetado (partículas incluidas).
- [x] **No se tocó ningún archivo de backend** (verificado con git status en cada etapa).
- [x] Documentación de conexión con backend entregada.

**Resultado: 15/17 verificables desde el código en este entorno; 2 pendientes de verificación en runtime (Lighthouse y los 3 anchos visuales).**

---

*Auditoría realizada en modo solo lectura. No se modificó ningún archivo del repositorio para generar este informe; este documento es el único entregable de la sesión.*
