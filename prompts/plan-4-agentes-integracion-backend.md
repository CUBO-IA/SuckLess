# Plan de Integración Backend → Frontend con 4 Agentes en Paralelo

**Para:** equipo de desarrollo SuckLess (hackathon BoxLang AI)
**Objetivo:** que 4 agentes de IA implementen la conexión frontend ↔ backend de forma independiente, con merges limpios y sin conflictos.
**Estado actual:** frontend SSR BoxLang + JS vanilla completo en modo mock (`USE_MOCK = true`). El backend Node (`panel/server.js`) existe pero expone rutas distintas al contrato normativo (`docs/contrato-api.md`).
**Duración estimada:** 4 agentes en paralelo, ~2-3 horas cada uno + 30 min de integración.

---

## TL;DR

Cada agente trabaja en **una rama propia** desde `main`, creando **archivos nuevos** dentro de `panel/routes/` y modificando **solo sus vistas `.bxm`** asociadas. Nadie toca `assets/js/api.js` ni `panel/server.js` — esos dos archivos los cambia el **integrador final** cuando las 4 ramas ya están mergeadas. Resultado: merge sin conflictos garantizado.

---

## 1. Contexto: qué existe hoy

| Capa | Archivo(s) | Estado |
|---|---|---|
| **Frontend UI** | `assets/js/modules/*.js` (6 módulos) | Completo, consume `api.js` |
| **Capa de datos** | `assets/js/api.js` | Completa, `USE_MOCK = true` |
| **Vistas SSR** | `views/*-index.bxm`, `two-doors.bxm`, `executor.bxm` | Completas, `useMock = true` |
| **Backend Node** | `panel/server.js` + `engine/*.js` | Existe, rutas NO alineadas al contrato |
| **Contrato** | `docs/contrato-api.md` | Normativo, 585 líneas |
| **Guía** | `prompts/guia-backend-frontend.md` | Resumen operativo |
| **Mocks** | `mock/*.json` | Completos por endpoint |

---

## 2. Las 11 rutas del contrato (resumen)

| # | Ruta | Método | Módulo UI que la consume |
|---|---|---|---|
| 1 | `/api/requirements/analyze` | POST | `requirements.js`, `dashboard.js` |
| 2 | `/api/requirements/approve` | POST | `requirements.js` |
| 3 | `/api/debug/analyze` | POST | `two-doors.js` |
| 4 | `/api/executor/run` | POST | `executor.js`, `two-doors.js` |
| 5 | `/api/executor/run/{id}` | GET | `executor.js` (polling) |
| 6 | `/api/code/explain` | POST | `code.js` |
| 7 | `/api/code/review` | POST | `code.js`, `dashboard.js` |
| 8 | `/api/history` | GET | `history.js`, `dashboard.js`, `two-doors.js`, `executor.js` |
| 9 | `/api/history/{id}` | GET | `history.js` |
| 10 | `/api/history/{id}` | DELETE | `history.js` |
| 11 | `/api/history/{id}/export` | GET | `history.js` |

---

## 3. Arquitectura propuesta (cero conflictos)

**Problema:** `panel/server.js` es un único archivo con todas las rutas. Si 4 agentes lo editan, hay conflicto garantizado.

**Solución:** crear una carpeta `panel/routes/` con **un archivo de rutas por módulo de negocio**. Cada agente crea su archivo desde cero y exporta una función `handle(req, url, body)`. El integrador final modifica `panel/server.js` para importar estos archivos.

```
panel/
  server.js              ← INTEGRADOR (merge final)
  routes/                ← NUEVA carpeta (Fase 0)
    requirements.js      ← Agente 1 (crea)
    debug.js             ← Agente 2 (crea)
    executor.js          ← Agente 2 (crea)
    code.js              ← Agente 3 (crea)
    history.js           ← Agente 4 (crea)
```

Cada archivo de rutas exporta:
```js
// panel/routes/<modulo>.js
export async function handle(req, url, body) {
  // retorna { status, data } o lanza { status, message }
}
```

`panel/server.js` final (integrador):
```js
import { handle as requirements } from './routes/requirements.js';
import { handle as debug } from './routes/debug.js';
import { handle as executor } from './routes/executor.js';
import { handle as code } from './routes/code.js';
import { handle as history } from './routes/history.js';

// en route():
if (url.pathname.startsWith('/api/requirements/')) return requirements(req, url, body);
if (url.pathname.startsWith('/api/debug/')) return debug(req, url, body);
if (url.pathname.startsWith('/api/executor/')) return executor(req, url, body);
if (url.pathname.startsWith('/api/code/')) return code(req, url, body);
if (url.pathname.startsWith('/api/history/')) return history(req, url, body);
```

---

## 4. Fases del plan

### Fase 0 — Preparación (integrador, 5 min)

1. Crear la carpeta `panel/routes/` (vacía, con un `.gitkeep`).
2. Crear una rama base si es necesario: `git checkout main && git pull`.
3. Notificar a los 4 agentes que pueden crear sus ramas.

### Fase 1 — Trabajo en paralelo (4 agentes, simultáneo)

Cada agente:
1. Crea su rama: `git checkout -b feat/agent-N-<modulo>` desde `main`.
2. Implementa sus rutas en `panel/routes/<modulo.js>`.
3. Verifica que sus rutas responden correctamente (script de prueba propio).
4. Cambia `bx:set useMock = false` en sus vistas asignadas.
5. **Solo hace commit de sus archivos.**
6. Notifica al integrador al terminar.

### Fase 2 — Integración y merge (integrador, 30 min)

1. Mergear las 4 ramas en orden (ver §7).
2. Modificar `panel/server.js` para importar los archivos de rutas.
3. Cambiar `USE_MOCK = true` → `false` en `assets/js/api.js`.
4. Ejecutar `npm run test`.
5. Levantar el servidor y verificar el flujo completo (checklist en §8).
6. Commit final de integración.

---

## 5. Instrucciones por agente

> **Regla de oro para todos:** solo commiteas los archivos de tu módulo. Si necesitas tocar otro archivo, NO lo haces — lo reportas al integrador.

---

### Agente 1 — Requirements Gate

**Rama:** `feat/agent-1-requirements`

**Rutas a implementar (2):**
- `POST /api/requirements/analyze` — analiza un texto de requisito, genera preguntas
- `POST /api/requirements/approve` — aprueba un requisito

**Archivos que creas:**
- `panel/routes/requirements.js`

**Archivos que modificas (vistas):**
- `views/requirements-index.bxm` — cambiar `bx:set useMock = true` → `false`

**Archivos de mock que validas (solo lectura):**
- `mock/requirements-analyze.{ok,ready,empty,500,timeout,validation,invalid}.json`
- `mock/requirements-approve.{ok,error}.json`

**Lógica existente que puedes importar:**
- `engine/requirements.js` — funciones `startRequirement()`, `answerRequirement()`, `approveRequirement()`, `getRequirement()`, `listRequirements()`

**Contrato (resumen):**
- `analyze`: request `{ text, answers? }`, response `{ id, status, questions[], missingFields[], document }`
- `approve`: request `{ id, approvedBy }`, response `{ id, status, approvedAt, approvedBy, document }`
- Errores: 404 id inexistente, 400 validación (approvedBy vacío o ya aprobado)

**Cómo verificar:**
```bash
node -e "
import('./panel/routes/requirements.js').then(m => {
  // simular POST /api/requirements/analyze
  const result = await m.handle({ method: 'POST' }, new URL('http://x/api/requirements/analyze'), { text: 'test' });
  console.log(JSON.stringify(result, null, 2));
});
"
```

**Criterios de aceptación:**
- [ ] `panel/routes/requirements.js` existe y exporta `handle()`
- [ ] `POST /api/requirements/analyze` responde 200 con `{ id, status, questions[] }`
- [ ] `POST /api/requirements/approve` responde 200 con `{ id, status: 'APPROVED' }`
- [ ] `views/requirements-index.bxm` tiene `bx:set useMock = false`
- [ ] Solo commiteaste: `panel/routes/requirements.js`, `views/requirements-index.bxm`

---

### Agente 2 — Debug & Executor

**Rama:** `feat/agent-2-debug-executor`

**Rutas a implementar (3):**
- `POST /api/debug/analyze` — diagnóstico de errores (Puerta A de Two Doors)
- `POST /api/executor/run` — lanzar corrida de checks
- `GET /api/executor/run/{id}` — polling en vivo

**Archivos que creas:**
- `panel/routes/debug.js`
- `panel/routes/executor.js`

**Archivos que modificas (vistas):**
- `two-doors.bxm` — cambiar `bx:set useMock = true` → `false`
- `executor.bxm` — cambiar `bx:set useMock = true` → `false`

**Archivos de mock que validas (solo lectura):**
- `mock/debug-analyze.{ok,empty,500,validation}.json`
- `mock/executor-run.{queued,ok,empty,500}.json`
- `mock/executor-run.{running,ok,get.404}.json`

**Lógica existente que puedes importar:**
- `engine/service.js` — funciones `runDebug()`, `runVerify()`
- `engine/runner.js` — lógica de ejecución de checks
- `engine/history.js` — `getAnalysis()`, `listAnalyses()` (para historial de runs)

**Contrato (resumo):**
- `debug/analyze`: request `{ log, requirementId? }`, response `{ id, status, ladderLevel, logSummary, hypotheses[] }`
- `executor/run` POST: request `{ target, requirementId? }`, response `{ id, status: 'QUEUED', checks[], summary, ... }`
- `executor/run/{id}` GET: mismo shape, avanza `QUEUED → RUNNING → PASS/FAIL/EXECUTOR_ERROR`

**Cómo verificar:**
```bash
node -e "
import('./panel/routes/debug.js').then(async m => {
  const r = await m.handle({ method: 'POST' }, new URL('http://x/api/debug/analyze'), { log: 'TypeError: ...' });
  console.log(JSON.stringify(r, null, 2));
});
"
```

**Criterios de aceptación:**
- [ ] `panel/routes/debug.js` y `panel/routes/executor.js` existen
- [ ] `POST /api/debug/analyze` responde 200 con hypotheses
- [ ] `POST /api/executor/run` responde 200 con `status: 'QUEUED'`
- [ ] `GET /api/executor/run/{id}` responde con checks acumulados
- [ ] `two-doors.bxm` y `executor.bxm` tienen `bx:set useMock = false`
- [ ] Solo commiteaste: tus 2 archivos de rutas + tus 2 vistas

---

### Agente 3 — Code & Review

**Rama:** `feat/agent-3-code`

**Rutas a implementar (3):**
- `POST /api/code/explain` — explicar un símbolo
- `POST /api/code/review` — revisión de código
- `GET /api/files` — listar archivos fuente (opcional, para el visor de código)

**Archivos que creas:**
- `panel/routes/code.js`

**Archivos que modificas (vistas):**
- `views/code-index.bxm` — cambiar `bx:set useMock = true` → `false`
- `mock/code-view.json` — mover a `assets/code-view.json` (o dejar donde está y documentarlo)

**Archivos de mock que validas (solo lectura):**
- `mock/code-explain.{ok,404}.json`
- `mock/code-review.{ok,empty,no-patch,500}.json`
- `mock/code-view.json`

**Lógica existente que puedes importar:**
- `engine/code.js` — función `readSource()`
- `engine/service.js` — funciones `runExplain()`, `runReview()`
- `engine/util.js` — `listSourceFiles()`, `relPath()`, `TARGETS`

**Contrato (resumo):**
- `code/explain`: request `{ symbol }`, response `{ id, status, symbol, steps[] }`
- `code/review`: request `{ files[], requirementId? }`, response `{ id, status, findings[] }`
- `files`: response `{ files[], symbols[] }`

**Criterios de aceptación:**
- [ ] `panel/routes/code.js` existe y exporta `handle()`
- [ ] `POST /api/code/explain` responde 200 con steps
- [ ] `POST /api/code/review` responde 200 con findings
- [ ] `views/code-index.bxm` tiene `bx:set useMock = false`
- [ ] Solo commiteaste: tu archivo de rutas + tu vista (+ `mock/code-view.json` si lo mueves)

---

### Agente 4 — History & Dashboard

**Rama:** `feat/agent-4-history`

**Rutas a implementar (4):**
- `GET /api/history` — listado de historial (con query params `type`, `q`)
- `GET /api/history/{id}` — detalle (shape según `type`)
- `DELETE /api/history/{id}` — borrado
- `GET /api/history/{id}/export` — reporte Markdown

**Archivos que creas:**
- `panel/routes/history.js`

**Archivos que modificas (vistas):**
- `views/history-index.bxm` — cambiar `bx:set useMock = true` → `false`
- `views/index.bxm` — cambiar `bx:set useMock = true` → `false`

**Archivos de mock que validas (solo lectura):**
- `mock/history.{ok,empty}.json`
- `mock/history-detail.{verify,debug,requirements,404}.json`
- `mock/history-delete.ok.json`
- `mock/history-export.md`

**Lógica existente que puedes importar:**
- `engine/history.js` — funciones `listAnalyses()`, `getAnalysis()`, `deleteAnalysis()`

**Contrato (resumo):**
- `history` GET: query `type`, `q`; response `[{ id, type, title, status, createdAt }]`
- `history/{id}` GET: shape según `type` (verify/debug/review/explain/requirements)
- `history/{id}` DELETE: response `{ deleted, id }`
- `history/{id}/export` GET: response `text/markdown`, headers `Content-Disposition: attachment; filename="<id>.md"`

**Nota especial sobre el export:** el `Content-Type` debe ser `text/markdown; charset=utf-8`, NO `application/json`. Tu función `handle()` debe retornar algo que permita al servidor enviar texto crudo. Puedes retornar `{ status: 200, text: '...', contentType: 'text/markdown' }` y el integrador lo manejará.

**Criterios de aceptación:**
- [ ] `panel/routes/history.js` existe y exporta `handle()`
- [ ] `GET /api/history` responde con listado (filtra por `type` y `q`)
- [ ] `GET /api/history/{id}` responde con el shape correcto según `type`
- [ ] `DELETE /api/history/{id}` responde `{ deleted: true, id }`
- [ ] `GET /api/history/{id}/export` responde texto Markdown (no JSON)
- [ ] `views/history-index.bxm` y `views/index.bxm` tienen `bx:set useMock = false`
- [ ] Solo commiteaste: tu archivo de rutas + tus 2 vistas

---

## 6. Qué NO hace cada agente (zona prohibida)

| Archivo | Quién lo toca | Cuándo |
|---|---|---|
| `assets/js/api.js` | Integrador | Fase 2 (merge final) |
| `panel/server.js` | Integrador | Fase 2 (merge final) |
| `assets/js/main.js` | Nadie | Nunca (entry point) |
| `engine/*.js` | Solo lectura | Los agentes importan de aquí, no modifican |
| `docs/contrato-api.md` | Nadie | Es normativo |
| `prompts/guia-backend-frontend.md` | Nadie | Es la guía |

---

## 7. Protocolo de merge

### Orden de merge (integrador)

```bash
git checkout main
git pull origin main

# Merge en orden de menor a mayor complejidad de conflicto
git merge --no-ff feat/agent-1-requirements -m "feat: requirements gate routes"
git merge --no-ff feat/agent-2-debug-executor -m "feat: debug & executor routes"
git merge --no-ff feat/agent-3-code -m "feat: code & review routes"
git merge --no-ff feat/agent-4-history -m "feat: history & dashboard routes"
```

### Por qué no hay conflictos

Cada agente trabaja en **archivos diferentes**:
- Agente 1: `panel/routes/requirements.js` + `views/requirements-index.bxm`
- Agente 2: `panel/routes/debug.js`, `panel/routes/executor.js` + `two-doors.bxm`, `executor.bxm`
- Agente 3: `panel/routes/code.js` + `views/code-index.bxm`
- Agente 4: `panel/routes/history.js` + `views/history-index.bxm`, `views/index.bxm`

**Solapamiento: CERO.** Los únicos archivos compartidos (`api.js`, `server.js`) se tocan en Fase 2, cuando las 4 ramas ya están mergeadas.

### Resolución de emergencia

Si un agente commiteó por error un archivo ajeno:
1. No intentar arreglar en merge.
2. Revertir el commit: `git revert <hash>`.
3. Notificar al agente para que vuelva a hacer commit solo de sus archivos.

---

## 8. Checklist de integración (Fase 2)

Después de mergear las 4 ramas y modificar `server.js` + `api.js`:

- [ ] `USE_MOCK = false` en `assets/js/api.js` línea 14.
- [ ] `bx:set useMock = false` en las 6 vistas.
- [ ] `panel/server.js` importa los 5 archivos de rutas.
- [ ] `npm run test` pasa.
- [ ] Levantar servidor: `node panel/server.js`.
- [ ] **Requirements:** analizar → responder preguntas → `READY_FOR_REVIEW` → aprobar → `APPROVED`.
- [ ] **Two Doors:** pegar log → hipótesis etiquetadas como pendientes.
- [ ] **Executor:** ejecutar → polling → `PASS/FAIL` con checks reales.
- [ ] **Code:** explain + review con hallazgos y patches.
- [ ] **History:** filtrar, ver detalle, exportar `.md`, borrar.
- [ ] **Panel:** dashboard con KPIs reales (requisitos aprobados, última corrida).
- [ ] Sin "Dato de ejemplo" ni "MODO DEMO" en ninguna pantalla.
- [ ] Sin scroll horizontal a 390/768/1440 px.

---

## 9. Referencias

| Documento | Contenido |
|---|---|
| [`docs/contrato-api.md`](../docs/contrato-api.md) | Contrato normativo completo (585 líneas) |
| [`prompts/guia-backend-frontend.md`](./guia-backend-frontend.md) | Resumen operativo de la conexión |
| [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) | Arquitectura de las dos apps |
| [`assets/js/api.js`](../assets/js/api.js) | Capa de datos (modo mock/real) |
| [`panel/server.js`](../panel/server.js) | Servidor Node actual |
| [`engine/`](../engine/) | Lógica de negocio (requirements, service, code, history) |

---

*Plan generado para trabajo en paralelo. Mantener sincronizado con `docs/contrato-api.md`.*
