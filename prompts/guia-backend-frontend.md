# Guía de conexión Backend → Frontend (SuckLess)

**Para:** equipo de backend / servicio BoxLang.
**Objetivo:** que el frontend SSR BoxLang + JS vanilla deje de ser un mockup y consuma datos reales.
**Estado del frontend:** Etapas 0–8 completas y verificadas. Corre hoy con `USE_MOCK = true` sirviendo los JSON de `/mock`.
**Contrato normativo completo:** [`docs/contrato-api.md`](../docs/contrato-api.md) (585 líneas). Esta guía es el resumen operativo + lo que el backend debe resolver.

---

## 0. TL;DR — los 3 pasos para conectar

1. **El backend expone las 11 rutas de §2** en el mismo origin que la UI (o con proxy). Todas las respuestas son JSON `application/json; charset=utf-8` salvo el export Markdown.
2. **Se apaga la bandera:** en [`assets/js/api.js`](../assets/js/api.js) línea 14, `export const USE_MOCK = true;` → `false`.
3. **Se apaga el banner demo:** en cada `views/*-index.bxm`, `bx:set useMock = true` → `false`.

Con eso, `api.js` deja de resolver contra `/mock` y hace `fetch` real contra las rutas del contrato. **Ningún módulo de UI llama a `fetch` por su cuenta** — todo pasa por `api()`, así que no hay que tocar ningún `assets/js/modules/*.js` si las rutas y los shapes coinciden.

---

## 1. Cómo funciona la capa de datos hoy

El único punto de entrada a datos es [`assets/js/api.js`](../assets/js/api.js). Expone:

| Export | Uso |
|---|---|
| `api(path, { method, body, timeoutMs })` | Llamada única. Resuelve `{ status, data }` o rechaza con `ApiError`. |
| `apiGet` / `apiPost` / `apiDelete` | Azúcar sobre `api()`. |
| `pollRun(runId, onSnapshot, { intervalMs, maxDurationMs })` | Polling del executor (solo vive aquí). |
| `wrap(promise)` | Devuelve `{ loading, error, data, isEmpty }` para render declarativo. |
| `USE_MOCK` | Bandera maestra mock/real. |
| `ApiError` | Error uniforme con `code`, `message`, `httpStatus`, `body`. |

Modo real (`USE_MOCK=false`), `api.js` ya aplica:
- `timeoutMs` por petición con `AbortController` (default **15 000 ms**) → `ApiError('TIMEOUT')`.
- Rechazo de respuestas que **no** son `application/json` → `ApiError(mapHttpStatusToCode(...))`. Nunca hace `JSON.parse` sobre HTML de un proxy caído.
- Cuerpo vacío o JSON malformado → `ApiError('EMPTY_RESPONSE')`.
- Cuerpo de error `{ error: { code, message } }` → se convierte en `ApiError` con ese `code`/`message`.
- POST > 1 MB se corta en el cliente → `ApiError('OVERSIZED_BODY')`.
- El endpoint de export se detecta por la ruta `/export` y devuelve `{ text, raw: true }` sin parsear JSON.

**Consecuencia para backend:** respetar exactamente el sobre de error y el `Content-Type` es todo lo que se necesita para que el frontend no rompa.

---

## 2. Las 11 rutas que el backend debe exponer

> `requirementId` es siempre opcional (`string | null`). Los IDs son **strings opacos**: el frontend los memoriza y los devuelve, nunca los construye ni los interpreta.

### 2.1 `POST /api/requirements/analyze` — entrevista de requisitos
Consumido por: `requirements.js` (y `dashboard.js` para el resumen).

**Request**
```json
{ "text": "El carrito debe aplicar descuentos" }
```
Validación: `text` string 1–5000 chars (mín. 1 tras trim). El frontend también manda `answers` (mapa `{id: valor}`) en la re-consulta; el backend decide el nuevo `status`.

**Response 200**
```json
{
  "id": "req_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "INCOMPLETE",
  "questions": [
    { "id": "q_scope_discount", "text": "¿Los descuentos se acumulan con coupons?",
      "category": "business", "answered": false, "answer": null,
      "type": "choice", "options": { "yes": "Sí", "no": "No" } }
  ],
  "missingFields": ["scope_discount", "percentages"],
  "document": {
    "objective": "...", "actor": "...", "behavior": "...",
    "inputs": ["..."], "rules": ["..."], "errors": ["..."],
    "acceptanceCriteria": ["..."], "edgeCases": ["..."]
  }
}
```

| Campo | Valores | Nota |
|---|---|---|
| `status` | `INCOMPLETE` \| `READY_FOR_REVIEW` \| `APPROVED` | La UI pinta badge según esto, no lo calcula. |
| `questions[].category` | `business` \| `technical` \| `scope` \| `acceptance` | |
| `questions[].type` | p. ej. `choice` | Con `options` para `choice`. |
| `document` | claves **fijas**: `objective`, `actor`, `behavior`, `inputs`, `rules`, `errors`, `acceptanceCriteria`, `edgeCases` | Puede venir parcial si `INCOMPLETE`. **Obligatorios al aprobar:** `objective`, `acceptanceCriteria`, `edgeCases`. |

### 2.2 `POST /api/requirements/approve` — aprobación humana
Consumido por: `requirements.js` (modal de aprobación).
**Única vía** para pasar a `APPROVED`. El frontend nunca lo pinta por su cuenta.

**Request** `{ "id": "req_...", "approvedBy": "Beatriz Fuentes" }`
**Response 200** `{ "id": "req_...", "status": "APPROVED", "approvedAt": "2026-10-10T14:05:12Z", "approvedBy": "Beatriz Fuentes", "document": { "title": "...", "objective": "..." } }`

Errores: `404 NOT_FOUND` id inexistente; `400 VALIDATION` si `approvedBy` vacío o el requisito ya está aprobado.

### 2.3 `POST /api/debug/analyze` — diagnóstico (Puerta A de Two Doors)
Consumido por: `two-doors.js`.

**Request** `{ "log": "TypeError: ...\n    at addItem (cart.js:27)", "requirementId": null }`
Validación: `log` 1–50 000 chars.

**Response 200**
```json
{
  "id": "dbg_...",
  "status": "HYPOTHESIS",
  "ladderLevel": 1,
  "logSummary": "TypeError: leer .find de undefined",
  "hypotheses": [
    { "id": "hyp_...", "text": "addItem escribe en this.items pero lee this.cart",
      "status": "hypothesis",
      "evidence": [ { "file": "demo-store/src/cart.js", "lines": [27, 31], "snippet": "this.cart.find(...)" } ],
      "reproduceWith": "POST /api/executor/run con check: BASE-FRESH-LOAD" }
  ]
}
```

| Campo | Valores |
|---|---|
| `status` | `HYPOTHESIS` \| `REPRODUCED` \| `CORRECTION_VERIFIED` |
| `ladderLevel` | 1..3, sincronizado con `status` |
| `hypotheses[].status` | `hypothesis` \| `reproduced` \| `correction_verified` |
| `evidence[].lines` | `[inicio, fin]`, 1-based |
| `reproduceWith` | `string | null` |

> **Regla de honestidad:** la UI nunca dice "causa confirmada" a nivel hipótesis. Respetar `status`/`ladderLevel`.

### 2.4 `POST /api/executor/run` — lanzar corrida de checks
Consumido por: `executor.js`, `two-doors.js` (Puerta B).

**Request** `{ "target": "both", "requirementId": null }`
`target`: `buggy` \| `fixed` \| `both` (default `both`).

**Response 200 (inmediato: corrida creada)**
```json
{ "id": "run_...", "status": "QUEUED", "target": "both", "requirementId": null,
  "checks": [], "summary": { "pass": 0, "fail": 0, "error": 0 },
  "durationMs": null, "trace": { "steps": [], "downloadUrl": null },
  "screenshots": [], "aiInterpretation": null }
```

### 2.5 `GET /api/executor/run/{id}` — polling en vivo
Consumido por: `executor.js` (vía `pollRun()`, intervalo 1–1,5 s, máx 2 min).

**Mismo shape que 2.4.** Cada respuesta trae el `status` global + **todos** los `checks[]` acumulados.

```json
{ "id": "run_...", "status": "FAIL", "target": "both", "requirementId": null,
  "checks": [
    { "name": "BASE-FRESH-LOAD", "status": "FAIL", "durationMs": 142,
      "error": "TypeError: Cannot read properties of undefined (reading 'find') at addItem (cart.js:27)" },
    { "name": "DISCOUNT-10", "status": "PASS", "durationMs": 52, "error": null }
  ],
  "summary": { "pass": 3, "fail": 4, "error": 1 },
  "durationMs": 2140,
  "trace": { "steps": [ { "action": "goto", "selector": "/", "durationMs": 210, "error": null } ],
             "downloadUrl": "/api/executor/run/{id}/trace.zip" },
  "screenshots": [ { "checkName": "BASE-FRESH-LOAD", "url": "/mock/screenshots/BASE-FRESH-LOAD.png" } ],
  "aiInterpretation": "..." }
```

**Reglas no negociables del polling:**
- `status` (global y por check): `QUEUED` · `RUNNING` · `PASS` · `FAIL` · `EXECUTOR_ERROR`. **Solo el ejecutor lo determina**; el frontend lo pinta tal cual, sin remapeos.
- El global es `PASS` **solo si TODOS** los checks son `PASS`. Un solo `FAIL`/`EXECUTOR_ERROR` → global `FAIL`/`EXECUTOR_ERROR`. El frontend **no** recalcula el global.
- `durationMs` = `null` mientras corre; total real al terminar.
- El frontend detiene el polling al llegar a estado terminal, al vencer 2 min, o al cancelar (cancelar = dejar de consultar, no interrumpe el backend).
- `trace.steps` y `screenshots` pueden venir `[]` (checks Node sin Playwright). Ambos opcionales.
- `aiInterpretation` es opcional y va **solo** en el panel "Interpretación de la IA (no determina el resultado)", nunca junto al badge.

### 2.6 `POST /api/code/explain` — explicar un símbolo
Consumido por: `code.js`.

**Request** `{ "symbol": "addItem" }`
**Response 200**
```json
{ "id": "exp_...", "status": "OK", "symbol": "addItem",
  "summary": "Agrega un producto al carrito y recalcula totales.",
  "steps": [ { "text": "Lee la lista de items", "file": "demo-store/src/cart.js", "lines": [22, 24] } ] }
```
`steps[]` puede omitir `file`/`lines` (`null`): se muestra igual, sin enlace. `404 NOT_FOUND` si el símbolo no existe.

### 2.7 `POST /api/code/review` — revisión de código
Consumido por: `code.js` (y `dashboard.js`).

**Request** `{ "files": ["demo-store/src/cart.js"], "requirementId": null }`
Validación: `files[]` ≥ 1 y ≤ 20 rutas relativas.

**Response 200**
```json
{ "id": "rev_...", "status": "FINDINGS",
  "findings": [
    { "id": "fin_01", "severity": "ALTA", "category": "LOGICA",
      "file": "demo-store/src/cart.js", "lines": [27, 31],
      "evidence": "this.cart.find(...) — no existe this.cart en el scope",
      "impact": "TypeError en runtime al agregar producto",
      "recommendation": "Usar this.items en lugar de this.cart",
      "patch": { "format": "diff", "language": "javascript", "content": "- this.cart.find(...)\n+ this.items.find(...)" },
      "proven": false }
  ] }
```

| Campo | Valores | Nota |
|---|---|---|
| `status` | `OK` (sin hallazgos) \| `FINDINGS` | |
| `severity` | `ALTA` · `MEDIA` · `BAJA` | La UI ordena por severidad y agrupa. |
| `category` | `LOGICA` · `SEGURIDAD` · `CALIDAD` | |
| `lines` | `[int,int] \| null` | Un hallazgo sin `file`/`lines` se muestra igual, sin romper el visor. |
| `patch` | `object \| null` | `format`: `"diff"` → se pintan `+`/`-` con símbolo visible; `"text"` → código plano. **Nunca se aplica solo.** |
| `proven` | boolean | `true` = "Hallazgo demostrado" (una prueba lo comprobó); `false` = "Sugerencia". |

### 2.8 `GET /api/history?type=&q=` — listado de historial
Consumido por: `history.js`, `dashboard.js`, `two-doors.js` y `executor.js` (para poblar los selects de requisitos aprobados).

**Query params:** `type` (`debug` \| `explain` \| `review` \| `verify` \| `requirements` \| vacío=todos), `q` (búsqueda en título/status).

**Response 200**
```json
[ { "id": "hist_...", "type": "verify", "title": "Cupón -10% · versión buggy",
    "status": "FAIL", "createdAt": "2026-10-10T14:03:00Z" } ]
```
`[]` cuando no hay historial → el frontend pinta el empty-state (distingue "sin datos" de "falló"). El `status` sigue el enum de cada módulo; el frontend lo usa para el chip, no lo interpreta.

### 2.9 `GET /api/history/{id}` — detalle
El shape **depende del `type`** del registro:
- `verify` → shape de §2.4/2.5 (un run).
- `debug` → shape de §2.3.
- `review` → shape de §2.7.
- `explain` → shape de §2.6.
- `requirements` → shape de §2.1 (con `status` actualizado).

Además el frontend lee `type`, `title`, `status`, `createdAt` a nivel raíz para la cabecera del modal. `404 NOT_FOUND` si el id no existe.

### 2.10 `DELETE /api/history/{id}` — borrado
Consumido por: `history.js` (con confirmación humana previa en modal).
**Response 200** `{ "deleted": true, "id": "hist_..." }`
`404` si el id no existe. **Idempotencia a definir:** un segundo DELETE sobre el mismo id puede ser `404` o `{ deleted: false }`; la UI tolera ambas.

### 2.11 `GET /api/history/{id}/export` — reporte Markdown
Consumido por: `history.js` (descarga como Blob).
- `200` con `Content-Type: text/markdown; charset=utf-8` y `Content-Disposition: attachment; filename="<id>.md"`. **No es JSON**; `api.js` lo detecta por la ruta `/export` y lo entrega como texto crudo.
- `404 NOT_FOUND` si el id no existe.

---

## 3. Sobre de error uniforme (obligatorio)

**Toda** respuesta HTTP ≥ 400 usa:
```json
{ "error": { "code": "TIMEOUT", "message": "..." } }
```

| `code` | HTTP | Cuándo |
|---|---|---|
| `TIMEOUT` | 504 | El trabajo excedió el tiempo tolerado (o el cliente cortó a los 15 s). |
| `EMPTY_RESPONSE` | 502 | Respuesta sin cuerpo útil o `{}` vacío. |
| `NOT_FOUND` | 404 | Recurso de historia/análisis/ejecución inexistente. |
| `VALIDATION` | 400 | Payload mal formado o campo obligatorio ausente. |
| `OVERSIZED_BODY` | 413 | Cuerpo supera `MAX_BODY` del backend. |
| `UPSTREAM_5XX` | 502 | Fallo transitorio de un proveedor aguas abajo (IA, ejecutor). |
| `INTERNAL` | 500 | Error no clasificado del servidor. |

`message` se muestra **tal cual** al usuario en `role=alert` / `aria-live=assertive`. El frontend no lo procesa ni lo reescribe — puede localizarse en el backend.

**Comportamiento de la UI por código** (ya implementado):

| `code` | La UI hace |
|---|---|
| `TIMEOUT` | "La petición excedió N s" + botón reintentar en la tarjeta afectada. |
| `EMPTY_RESPONSE` | "El servidor respondió sin contenido" (distinto del estado vacío). |
| `NOT_FOUND` | Mensaje del contrato; típico al abrir detalle/borrado de un id ya eliminado. |
| `VALIDATION` | Mensaje del backend junto al campo. |
| `OVERSIZED_BODY` | El cliente ya corta a 1 MB en POST; si llega, es límite del backend. |
| `UPSTREAM_5XX` | Error local de la tarjeta, sin tumbar la página. |
| `INTERNAL` | Mensaje genérico tal cual del backend. |

En el polling del executor, los errores transitorios de red se toleran hasta 3 reintentos (`maxNetworkErrors` en `api.js`); `NOT_FOUND` **aborta el polling al instante**.

---

## 4. Mapa pantalla → endpoints → campos que lee

| Pantalla | Endpoints | Campos que consume |
|---|---|---|
| **Panel** (`views/index.bxm` → `dashboard.js`) | `GET /api/history?type=requirements`, `GET /api/executor/run/{id}` (última corrida), `POST /api/code/review`, `GET /api/history` | `list[].status === 'APPROVED'` (KPI), `run.summary.{pass,fail,error}`, `run.status`, `run.durationMs`, `review.findings[]`, últimos 5 de history con `status`/`title` |
| **Requirements Gate** (`views/requirements-index.bxm` → `requirements.js`) | `POST /api/requirements/analyze`, `POST /api/requirements/approve` | `id`, `status`, `questions[]`, `missingFields[]`, `document` (8 claves), `approvedBy`, `approvedAt` |
| **Two Doors** (`two-doors.bxm` → `two-doors.js`) | `POST /api/debug/analyze`, `POST /api/executor/run`, `GET /api/history?type=requirements` | `status`, `ladderLevel`, `logSummary`, `hypotheses[].{text,status,evidence[].{file,lines,snippet}}`, `reproduceWith` |
| **Executor** (`executor.bxm` → `executor.js`) | `POST /api/executor/run`, `GET /api/executor/run/{id}` (polling), `GET /api/history?type=requirements` | `id`, `status`, `checks[].{name,status,durationMs,error}`, `summary`, `durationMs`, `trace.steps[].{action,selector,durationMs,error}`, `trace.downloadUrl`, `screenshots[].{checkName,url}`, `aiInterpretation` |
| **Código** (`views/code-index.bxm` → `code.js`) | `POST /api/code/explain`, `POST /api/code/review`, `GET /mock/code-view.json` (estático, ver §7) | `steps[].{text,file,lines}`, `findings[].{severity,category,file,lines,evidence,impact,recommendation,patch,proven}` |
| **Historial** (`views/history-index.bxm` → `history.js`) | `GET /api/history`, `GET /api/history/{id}`, `DELETE /api/history/{id}`, `GET /api/history/{id}/export` | `[].{id,type,title,status,createdAt}`, detalle según type, `{deleted,id}`, Markdown crudo |

---

## 5. Estado actual: mock vs. real

Hoy `panel/server.js` (motor Node) expone un conjunto de rutas **distinto** al del contrato del frontend. El frontend **no** las consume (usa mocks). El backend nuevo debe implementar las rutas de §2.

Rutas que existen hoy en `panel/server.js` (referencia, **no** son las del contrato):
```
GET  /api/history            DELETE /api/history/{id}
GET  /api/req                POST /api/req/start
GET  /api/req/{REQ-xxxxxx}   POST /api/req/{id}/answer
POST /api/req/{id}/approve   GET  /api/files
GET  /api/trace              POST /api/verify
POST /api/debug              POST /api/explain
POST /api/review
```

**Mapeo mock → endpoint real** (lo que hoy sirve cada archivo de `/mock`):

| Endpoint del contrato | Mock(s) actuales |
|---|---|
| `POST /api/requirements/analyze` | `requirements-analyze.{ok,ready,empty,500,timeout,validation,invalid}.json` |
| `POST /api/requirements/approve` | `requirements-approve.{ok,error}.json` |
| `POST /api/debug/analyze` | `debug-analyze.{ok,empty,500,validation}.json` |
| `POST /api/executor/run` | `executor-run.{queued,ok,empty,500}.json` |
| `GET /api/executor/run/{id}` | `executor-run.{running,ok,get.404}.json` (ciclo simulado: 1.º GET → running, siguientes → ok) |
| `POST /api/code/explain` | `code-explain.{ok,404}.json` |
| `POST /api/code/review` | `code-review.{ok,empty,no-patch,500}.json` |
| `GET /api/history` | `history.{ok,empty}.json` |
| `GET /api/history/{id}` | `history-detail.{verify,debug,requirements,404}.json` |
| `DELETE /api/history/{id}` | `history-delete.ok.json` |
| `GET /api/history/{id}/export` | `history-export.md` (Markdown crudo) |

**Integridad con el código real:** los mocks se derivan de la demo real (`demo-store/`, `demo-store-fixed/`). `executor-run.ok.json` (3 PASS / 4 FAIL / 1 ERROR) y la traza de `debug-analyze.ok.json` corresponden al escenario real. Si el backend devuelve esos mismos números, el resultado visible no cambia al apagar el mock.

---

## 6. Lo que el backend DEBE resolver antes del corte (P0)

1. **"Última corrida" para el Panel.** Hoy `dashboard.js` usa un `run_01J8Z3F2…` fijo. Se necesita un endpoint "last run" (recomendado: `GET /api/executor/last`) **o** que `GET /api/history?type=verify` traiga el registro más reciente con su `id` para consultarlo.
2. **Requisitos aprobados en los selects** (Two Doors / Executor): la vía actual (`GET /api/history?type=requirements` + filtro `status === 'APPROVED'` en el cliente) funciona **si** el historial contiene esos registros. Validar que los haya.
3. **Persistencia del requisito entre pantallas.** Si el servicio BoxLang no guarda estado por sesión, sostener el `id` del requisito en la URL (p. ej. `?req=...`). El requisito aprobado es estado de backend, no de frontend.
4. **CORS / same-origin.** Si el backend corre en otro puerto, añadir proxy en el servidor web o cabeceras CORS solo para el origin de la UI. No hay auth en el MVP (no se necesitan cookies ni credenciales).
5. **Idempotencia de DELETE** (§2.10): definir si el segundo DELETE responde `404` o `{ deleted: false }`.
6. **`Content-Disposition` del export** (§2.11): fijar `attachment; filename="<id>.md"`.
7. **Fixtures de screenshots/traza.** `mock/screenshots/*.png` y la descarga de traza se referencian por URL. Si el executor real genera capturas/traza, exponer esas URLs; si no, dejar `screenshots: []` y `trace.downloadUrl: null`.

---

## 7. Caso especial: el visor de código estático

`code.js` **no** obtiene el código fuente por `/api`. Hace `fetch('/mock/code-view.json')` directo, porque el código es contenido del repo (`demo-store/`), no un análisis. Shape:

```json
{ "files": [ { "path": "demo-store/src/cart.js", "language": "javascript", "size": "1.6 KB" } ],
  "sources": { "demo-store/src/cart.js": "// contenido del archivo..." } }
```

**Decisión pendiente del backend:** si el código indexado pasa a ser dinámico, hay que definir un endpoint (p. ej. `GET /api/files` + `GET /api/files/{path}`) y ajustar `code.js` — hoy no existe en el contrato. Mientras el código siga siendo la demo fija, `code-view.json` puede quedarse como estático (renombrar y reubicar al retirar `/mock`).

---

## 8. Checklist de verificación al conectar

1. `USE_MOCK = false` en `assets/js/api.js`.
2. `bx:set useMock = false` en cada `views/*-index.bxm`.
3. Levantar el backend en el mismo origin (o proxy).
4. Recorrer el flujo completo y verificar en Network:
   - **Requirements:** analizar → responder → `status` pasa a `READY_FOR_REVIEW` → aprobar en modal → `APPROVED`.
   - **Two Doors A:** pegar un trace real → hipótesis etiquetadas como pendientes; nunca "causa confirmada".
   - **Executor:** Ejecutar → `EN COLA` → `EJECUTANDO` → `PASS/FAIL/ERROR` con los colores que devolvió el ejecutor. La UI se detiene sola al llegar a terminal.
   - **Code & Review:** hallazgos, `proven=true` = "Hallazgo demostrado", patch con `format: "diff"`.
   - **Historial:** filtrar por `?type=REVIEW`, abrir detalle (`GET /{id}`), exportar `.md` (bajarlo y abrirlo), borrar uno (confirmación) y refrescar sin recarga.
5. **Regresión de etiquetas:** con `USE_MOCK=false` **ninguna** pantalla debe mostrar "Dato de ejemplo", ni "MODO DEMO", ni "interpretación de la IA" mezclada con el badge de resultado.
6. **Sin scroll horizontal** a 390 / 768 / 1440 px; nav colapsable a 768.

---

## 9. Reglas de diseño que el backend no debe romper

- **`status` es la única fuente de verdad del badge.** Ningún texto de IA lo modifica. El frontend no remapea estados "defensivamente" para esconder valores inesperados.
- **Datos no confiables:** logs, código y respuestas de IA se pintan con `textContent`/`createElement`, nunca `innerHTML`. El backend puede enviarlos crudos.
- **Sin envoltorio `{ data: ... }`:** la raíz de la respuesta es el recurso directamente.
- **Fechas ISO 8601 con zona** (`2026-10-10T14:03:00Z`); duraciones en ms enteros.
- **IDs opacos:** el frontend nunca los construye ni los interpreta.
- **Accesibilidad:** el backend debe respetar `role=alert` para errores (mensaje listo para mostrar) y no depender del color como único indicador.

---

## 10. Referencias

| Documento | Contenido |
|---|---|
| [`docs/contrato-api.md`](../docs/contrato-api.md) | Contrato normativo completo (585 líneas), ejemplos exhaustivos. |
| [`docs/conexion-backend.md`](../docs/conexion-backend.md) | Checklist de corte de Etapa 8, paso a paso. |
| [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) | Arquitectura de las dos apps (Requirement Gate BoxLang + motor Node). |
| [`docs/guia-ui.md`](../docs/guia-ui.md) | Sistema de diseño (tokens, componentes, vistas SSR). |
| [`assets/js/api.js`](../assets/js/api.js) | Capa de datos: `api()`, `pollRun()`, `wrap()`, `ApiError`, `USE_MOCK`. |
| [`mock/`](../mock/) | JSON de ejemplo por endpoint (éxito, vacío, 404, 500, timeout). |

---

## 11. Cómo levantar el mockup hoy (referencia)

```bash
cd /cubo_ai/SuckLess
boxlang-miniserver miniserver.json   # → http://localhost:8083
```

`miniserver.json` en la raíz define `port`, `host`, `webRoot`. Los wrappers `*.bxm` de la raíz (`index.bxm`, `two-doors.bxm`, `executor.bxm`) incluyen las vistas de `views/` para que las rutas sin extensión funcionen.

---

*Generado como guía de handoff frontend → backend. Mantener sincronizado con `docs/contrato-api.md`: si el contrato cambia, esta guía y los mocks deben cambiar en el mismo commit.*
