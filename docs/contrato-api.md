# Contrato de API — SuckLess FrontEnd

Versión: `1.0.0` (Etapa 0 · contratos y andamiaje)

Este documento une el **frontend futuro** (SSR BoxLang: `.bxm`/`.bxs`, vanilla JS en `assets/js/`) con el **backend pendiente** (`panel/server.js` hoy; servicio BoxLang mañana). Mientras el backend no expone estas rutas, `assets/js/api.js` con `USE_MOCK = true` sirve los JSON de `/mock`. Al conectar el backend, se cambia la bandera a `false` y solo se ajustan rutas, sin tocar módulos de UI.

---

## 1. Convenciones generales

### 1.1 Formato

- Todas las respuestas —de éxito y de error— son JSON con `Content-Type: application/json; charset=utf-8`.
- Sin envoltorio tipo `{ data: ... }`: la raíz del objeto es el recurso directamente.
- Fechas y horas en ISO 8601 con zona (ej. `2026-10-10T14:03:00Z`).
- Duraciones en milisegundos enteros (`durationMs`).
- IDs de historia: `string` opaco que el frontend **nunca** construye ni interpreta; solo lo memoriza y lo devuelve.

### 1.2 Errores: uniformes

Toda respuesta de error HTTP (`status >= 400`) usa:

```json
{ "error": { "code": "TIMEOUT", "message": "..." } }
```

| Campo | Tipo | Descripción |
|---|---|---|
| `code` | string | Uno de `TIMEOUT` \| `EMPTY_RESPONSE` \| `NOT_FOUND` \| `VALIDATION` \| `OVERSIZED_BODY` \| `UPSTREAM_5XX` \| `INTERNAL` |
| `message` | string | Texto para mostrar a la persona (podría localizarse en el backend). El frontend lo muestra tal cual en `role=alert` `aria-live=assertive`; no lo procesa. |

Códigos y mapeo HTTP esperado:

| `code` | HTTP | Cuándo |
|---|---|---|
| `TIMEOUT` | `504` | El trabajo tomó más de lo tolerado o el cliente cortó a los `timeoutMs` de `api.js`. |
| `EMPTY_RESPONSE` | `502` | El backend respondió sin cuerpo útil o `{}` vacío. |
| `NOT_FOUND` | `404` | Recurso de historia/análisis/ejecución no existe. |
| `VALIDATION` | `400` | Payload mal formado o campo obligatorio ausente. |
| `OVERSIZED_BODY` | `413` | Cuerpo supera `MAX_BODY` (backend) o límite de caracteres (frontend). |
| `UPSTREAM_5XX` | `502` | Fallo transitario de un proveedor (IA, ejecutor) aguas abajo. |
| `INTERNAL` | `500` | Error no clasificado del servidor. |

### 1.3 Regla visual PASS/FAIL

La fuente de verdad del badge es el campo `status`. NO lo altera ningún texto generado por IA. Los valores posibles del ejecutor:

```
PASS · FAIL · ERROR
```

Para otros módulos, un enum propio.

### 1.4 Seguridad

- El **frontend** nunca usa `innerHTML` con datos de entrada (logs, código, respuestas de IA, campos del contrato). Siempre `textContent` o, para listas, `document.createElement`.
- En SSR BoxLang, todo dato dinámico va por la función de encode (`encodeForHTML` o equivalente). Nunca interpolación cruda en plantilla.
- `api.js` valida por `Content-Type` antes de `JSON.parse`. Si el backend responde HTML (ej. de un proxy que falló), se produce `code: "UPSTREAM_5XX"` y el frontend no intenta parsear.

---

## 2. Endpoints

> **Estado:** propuesta. No están implementados en `panel/server.js`. Los mocks de `/mock` son la única fuente de datos hoy.

### 2.1 `POST /api/requirements/analyze`

Recibe el texto libre del requerimiento, devuelve la entrevista sugerida.

**Request**

```json
{ "text": "El carrito debe aplicar descuentos" }
```

| Campo | Tipo | Validación |
|---|---|---|
| `text` | string | `1–5000` chars (mín. 1 tras trim). |

**Response 200**

```json
{
  "id": "req_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "INCOMPLETE",
  "questions": [
    {
      "id": "q_scope_discount",
      "text": "¿Los descuentos se acumulan con coupons?",
      "category": "business",
      "answered": false,
      "answer": null,
      "type": "choice",
      "options": { "yes": "Sí, se acumulan", "no": "No, son mutuamente excluyentes" }
    }
  ],
  "missingFields": ["scope_discount", "percentages", "coupon_policy"],
  "document": {
    "title": "Descuentos en el carrito",
    "objective": "El carrito aplica descuentos...",
    "rules": [
      "Los descuentos no se aplican a productos con precio ya rebajado.",
      "Un cupón no puede combinarse con otro cupón."
    ],
    "acceptanceCriteria": [
      "Dado un carrito con 2 productos de 100 y un cupón -10%, el total debe ser 180."
    ]
  }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID estable del requisito. Sirve para `POST /api/requirements/approve` y para `POST /api/executor/run`. |
| `status` | string | `INCOMPLETE` \| `READY_FOR_REVIEW` \| `APPROVED` |
| `questions[]` | array | Preguntas ordenadas por prioridad (las más bloqueantes primero). |
| `questions[].id` | string | Estable a lo largo de la entrevista. |
| `questions[].text` / `.category` | string | category = `business` \| `technical` \| `scope` \| `acceptance`. |
| `questions[].answered` / `.answer` | bool / string·null | Estado; el frontend no los recalcula. |
| `missingFields[]` | array de strings | IDs de `questions[]` aún sin responder. |
| `document` | object | Síntesis del requisito; puede ser parcial si `status=INCOMPLETE`. |

### 2.2 `POST /api/requirements/approve`

Registra la aprobación humana de un requisito. **Es la única vía para cambiar el status a `APPROVED`**; el frontend nunca lo pinta por sí mismo.

**Request**

```json
{ "id": "req_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2", "approvedBy": "Beatriz Fuentes" }
```

**Response 200**

```json
{
  "id": "req_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "APPROVED",
  "approvedAt": "2026-10-10T14:05:12Z",
  "approvedBy": "Beatriz Fuentes",
  "document": { "title": "Descuentos en el carrito", "objective": "..." }
}
```

**Errores típicos**

- `404 NOT_FOUND` si el id no existe.
- `400 VALIDATION` si `approvedBy` viene vacío (short ≤ 1 char tras trim) o si el requisito ya está aprobado.

### 2.3 `POST /api/debug/analyze`

Recibe un log o stack-trace crudo. Devuelve hipótesis con evidencia (archivo + líneas) y un nivel de ladder (`hypothesis` → `reproduced` → `correction`).

**Request**

```json
{
  "log": "TypeError: Cannot read properties of undefined (reading 'find')\n    at addItem (cart.js:27)",
  "requirementId": "req_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2"
}
```

| Campo | Tipo | Validación |
|---|---|---|
| `log` | string | 1–50_000 chars. |
| `requirementId` | string·null | Opcional; vincula la hipótesis a un requisito existente. |

**Response 200**

```json
{
  "id": "dbg_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "HYPOTHESIS",
  "ladderLevel": 1,
  "logSummary": "TypeError: leer .find de undefined",
  "hypotheses": [
    {
      "id": "hyp_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
      "text": "addItem escribe el carrito en this.items, pero lo lee this.cart",
      "status": "hypothesis",
      "evidence": [
        { "file": "demo-store/src/cart.js", "lines": [27, 31], "snippet": "this.cart.find(...)" }
      ],
      "reproduceWith": "POST /api/executor/run con check: BASE-FRESH-LOAD"
    }
  ]
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `status` | string | `HYPOTHESIS` \| `REPRODUCED` \| `CORRECTION_VERIFIED` — nivel de evidencia. |
| `ladderLevel` | int | 1..3, síncrono con `status`. |
| `logSummary` | string | Primera línea útil del log, lista para pintar. |
| `hypotheses[]` | array | Ordenadas por probabilidad. |
| `hypotheses[].status` | string | `hypothesis` · `reproduced` · `correction_verified` |
| `evidence[]` | array | `{file, lines[], snippet}` — `lines` es `[línea inicial, línea final]`, 1-based. |
| `reproduceWith` | string·null | Cómo verificar la hipótesis con el ejecutor; `null` si no hay check asociado. |

### 2.4 `POST /api/executor/run`

Ejecuta los checks definidos en el backend contra una versión del código (la buggy o la fixed).

**Request**

```json
{ "target": "both", "requirementId": null }
```

| Campo | Tipo | Validación |
|---|---|---|
| `target` | string | `buggy` \| `fixed` \| `both` (default `both`). |
| `requirementId` | string·null | Opcional; si viene aprobado, el ejecutor valida checks del requisito. |

**Response 200**

```json
{
  "id": "run_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "PASS",
  "target": "both",
  "checks": [
    { "name": "BASE-FRESH-LOAD", "status": "FAIL", "durationMs": 142 },
    { "name": "COUPON-EXCLUSIVE", "status": "PASS", "durationMs": 38 }
  ],
  "summary": { "pass": 3, "fail": 4, "error": 1 },
  "trace": "TypeError: Cannot read properties of undefined (reading 'find')\n    at addItem (cart.js:27)...",
  "screenshots": []
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID de la ejecución; sirve para `GET /api/executor/run/{id}`. |
| `status` | string | `PASS` \| `FAIL` \| `ERROR` — **solo** desde el ejecutor; el frontend lo pinta tal cual. |
| `checks[]` | array | Cada check con su status individual (`PASS`/`FAIL`/`ERROR`) y `durationMs`. |
| `summary` | object | `pass`/`fail`/`error`. El frontend lo muestra, no lo recalcula. |
| `trace` | string·null | Log crudo de la ejecución; el frontend lo muestra en <pre> con `textContent`. |
| `screenshots[]` | array | Rutas lista; el MVP puede venir vacío. |

### 2.5 `GET /api/executor/run/{id}`

Reconsulta una ejecución previa (excerpt de historial; mismo schema que `2.4` Response 200). Útil si el `POST` tardó y el frontend quiere refrescar sin reejecutar.

- `200` con el mismo shape de `2.4`.
- `404 NOT_FOUND` con `{ "error": { "code": "NOT_FOUND", "message": "..." } }` si el id no existe.

### 2.6 `POST /api/code/explain`

Explica estáticamente el flujo de una función o fichero.

**Request**

```json
{ "symbol": "addItem" }
```

**Response 200**

```json
{
  "id": "exp_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "OK",
  "symbol": "addItem",
  "file": "demo-store/src/cart.js",
  "lines": [21, 45],
  "summary": "Agrega un producto al carrito y recalcula totales.",
  "flow": ["read moreItems", "read find product", "write items", "write totals"]
}
```

- `404 NOT_FOUND` si el símbolo no existe en el código fuente indexado.

### 2.7 `POST /api/code/review`

Revisa código y produce hallazgos con evidencia, impacto, recomendación y patch propuesto.

**Request**

```json
{ "files": ["demo-store/src/cart.js"], "requirementId": null }
```

| Campo | Tipo | Validación |
|---|---|---|
| `files[]` | array de strings | ≥ 1 y ≤ 20 rutas relativas al proyecto. |
| `requirementId` | string·null | Opcional; si es de un requisito aprobado, el review lo toma como criterio. |

**Response 200**

```json
{
  "id": "rev_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "FINDINGS",
  "findings": [
    {
      "id": "fin_01",
      "severity": "high",
      "file": "demo-store/src/cart.js",
      "lines": [27, 31],
      "evidence": "this.cart.find(...) — no existe this.cart en el scope",
      "impact": "TypeError en runtime al agregar producto",
      "recommendation": "Usar this.items en lugar de this.cart",
      "patch": "this.items.find(p => p.id === id)"
    }
  ]
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `status` | string | `OK` (sin hallazgos) \| `FINDINGS` |
| `findings[].severity` | string | `high` \| `medium` \| `low` \| `info` |
| `findings[].lines` | [int, int] | `[inicio, fin]`, 1-based. |
| `patch` | string·null | Sugerencia textual; el frontend lo muestra como texto en `<code>`; **nunca lo aplica** (el MVP no aplica parches). |

### 2.8 `GET /api/history?type=`

**Query params**

| Param | Tipo | Default |
|---|---|---|
| `type` | string·null | `debug` \| `explain` \| `review` \| `verify` \| `requirements` \| vacío (todos). |
| `q` | string·null | Búsqueda de texto libre en título/status. |

**Response 200**

```json
[
  {
    "id": "hist_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
    "type": "verify",
    "title": "Cupón -10% · versión buggy",
    "status": "FAIL",
    "createdAt": "2026-10-10T14:03:00Z"
  }
]
```

- Array vacío `[]` cuando no hay historial — el frontend lo detecta por `Array.isArray && length === 0` y pinta el empty-state.
- El `status` sigue los enums de cada módulo (`PASS/FAIL/ERROR` para verify; dedicados para los demás); el frontend lo usa para el chip, no lo interpreta.

### 2.9 `GET /api/history/{id}`

Detalle completo de un análisis. El shape depende del `type`:

- `verify` → shape de `2.4` (un run).
- `debug` → shape de `2.3`.
- `review` → shape de `2.7`.
- `explain` → shape de `2.6`.
- `requirements` → shape de `2.1` (con `status` ya actualizado).

- `404 NOT_FOUND` si el id no existe.

### 2.10 `DELETE /api/history/{id}`

Elimina un análisis (y sus datos asociados: trace, screenshots, reporte). **Requiere confirmación humana en la UI**; el frontend pide confirmación antes del DELETE.

**Response 200**

```json
{ "deleted": true, "id": "hist_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2" }
```

- `404` si el id no existe (idempotente: un segundo DELETE sobre el mismo id podría ser 404 o `{ deleted: false }`; definir en backend).

### 2.11 `GET /api/history/{id}/export`

Descarga el reporte Markdown listo para pegar en GitHub/Jira.

- `200` con `Content-Type: text/markdown; charset=utf-8` (fijar también `Content-Disposition: attachment; filename="<id>.md"`). El frontend toma el `Blob` y dispara el download, sin parsear JSON.

Errores:
- `404 NOT_FOUND` si el id no existe.

---

## 3. Capa de datos

`assets/js/api.js`. Empaquetado ES module, importable por los demás `assets/js/modules/*`.

```js
import { api } from './api.js';
const doc = await api('/api/requirements/analyze', { method: 'POST', body: { text: '...' } });
```

### 3.1 `USE_MOCK`

- `true` **por defecto en Etapa 0**: todas las llamadas se resuelven con los JSON de `/mock` (con delay jitter 150–600 ms para simular latencia).
- `false`: hace `fetch` real contra las rutas del contrato.

```js
// assets/js/api.js
export const USE_MOCK = true;
```

El módulo resuelve el mock por (method + path), buscando **el mock más específico por ruta**. Si la llamada no tiene mock, lanza `ApiError { code: 'NOT_FOUND', message: 'No hay mock para <ruta>' }` — así el frontend descubre huecos del contrato sin fallar silenciosamente.

### 3.2 Timeout

- `timeoutMs = 15_000` default, configurable per-call vía `api(path, { timeoutMs })`.
- Al vencer: `AbortController.abort()` y lanza `ApiError { code: 'TIMEOUT', message: '...' }`.
- Tiene prioridad sobre la respuesta del servidor: si el backend responde *después* del timeout, el frontend ya mostró estado de error y la respuesta tardía se descarta.

### 3.3 Errores uniformes: `ApiError`

```js
class ApiError extends Error {
  constructor({ code, message, httpStatus, body }) { ... }
}
```

- Toda llamada `api()` resuelve con data o rechaza con `ApiError`. Nunca lanza aún otro tipo de excepción (no `TypeError` de `.json()` sobre HTML, no `SyntaxError` de JSON malformado).
- Tabla de códigos idéntica a §1.2.
- El mapeo HTTP → code está centralizado en `mapHttpStatusToCode`.

### 3.4 Protocolo de respuesta: `wrap()`

Helper `wrap()` toma una promise → devuelve `{ loading, error, data }`

```js
import { api, wrap } from './api.js';

const view = wrap(api('/api/history'));
// view = { loading: true, error: null, data: null }
// → cuando resuelve: { loading: false, error: null, data: [...] }
// → cuando rechaza:  { loading: false, error: ApiError, data: null }
```

El módulo de UI llama `wrap()` y renderiza según el patrón:

1. `loading === true` → placeholder/skeleton + `aria-busy`.
2. `error !== null` → mensaje en `role=alert` + botón "Retry".
3. `data` y `Array.isArray(data) && data.length === 0` → **empty-state** (parcial sin datos parciales: "sin datos" es distinta de "falló").
4. `data` con contenido → render normal.

---

## 4. Mocks (`/mock`)

| Endpoint | Mocks |
|---|---|
| `POST /api/requirements/analyze` | `mock/requirements-analyze.ok.json`, `mock/requirements-analyze.empty.json` (sin questions), `mock/requirements-analyze.500.json`, `mock/requirements-analyze.timeout.json` (para reproducir timeout/latencia). |
| `POST /api/requirements/approve` | `mock/requirements-approve.ok.json`, `mock/requirements-approve.error.json` (404). |
| `POST /api/debug/analyze` | `mock/debug-analyze.ok.json`, `mock/debug-analyze.empty.json` (sin hipótesis), `mock/debug-analyze.500.json`. |
| `POST /api/executor/run` | `mock/executor-run.ok.json` (FAIL real de la demo), `mock/executor-run.empty.json` (sin checks), `mock/executor-run.500.json`. |
| `GET /api/executor/run/{id}` | `mock/executor-run.get.ok.json`, `mock/executor-run.get.404.json`. |
| `POST /api/code/explain` | `mock/code-explain.ok.json`, `mock/code-explain.404.json` (símbolo inexistente). |
| `POST /api/code/review` | `mock/code-review.ok.json`, `mock/code-review.empty.json` (0 hallazgos), `mock/code-review.500.json`. |
| `GET /api/history?type=` | `mock/history.ok.json` (varios tipos), `mock/history.empty.json` []. |
| `GET /api/history/{id}` | `mock/history-detail.verify.json`, `mock/history-detail.debug.json`, `mock/history-detail.requirements.json`, `mock/history-detail.404.json`. |
| `DELETE /api/history/{id}` | `mock/history-delete.ok.json`. |
| `GET /api/history/{id}/export` | `mock/history-export.md` (texto Markdown, no JSON; api.js lo trae como Blob/otro MIME). |

### 4.1 Convención de nombres

- `<modulo>-<operación>.ok.json` — respuesta normal.
- `.empty.json` — respuesta **válida pero sin datos útiles** (no error).
- `.500.json` / `.404.json` — cuerpo de error (§1.2).
- `.timeout.json` — payload para simular timeout: `api.js` no lo resuelve; usa un delay/proxy especial en el fetcher.

### 4.2 Integridad con el código real

Los mocks se derivan de la **demo real** (`demo-store/`, `demo-store-fixed/`): los datos de `executor-run.ok.json` (3 PASS, 4 FAIL, 1 ERROR) y la traza de `debug-analyze.ok.json` corresponden al escenario real de la demo. Así, cuando el backend real exista y el frontend se conecte (cambio de `USE_MOCK` a `false`), el resultado visible no cambia de forma sorpresiva.

---

## 5. Modo offline y vendorización

La Stage 0 no incluye librerías de terceros aún (highlight.js / Prism vendran en la etapa de Code View para resaltado). Cuando se incorporen:

- Se vendorizan en `assets/vendor/` — **sin CDN**.
- Elousel bootstrap de CSS/JS debe funcionar sin red externa.

---

## 6. Verificación de la Etapa 0

Criterio de aceptación: "cada módulo puede desarrollarse y probarse sin backend".

| Verificación | Cómo |
|---|---|
| Todos los mocks son JSON válido y completa | `node -e "...for each .json files parse..."` |
| `api.js` soporta ambos modos | Unit smoke en Node o en navegador: llamada con `USE_MOCK=true` resuelve, timeout y 500 simulan ApiError procesos correctos. |
| `contrato-api.md` cubre los 9 endpoints + export | Revisión manual. |
| `api.js` resuelve mocks por ruta | Smoke test manual en consola del navegador. |
| Contrato refleja el backend actual | Comparar contra `panel/server.js` actual y contra la demo real. |
