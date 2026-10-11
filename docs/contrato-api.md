# Contrato de API — SuckLess FrontEnd

Versión: `1.1.0` (contrato integrado con el motor Node)

Este documento define el contrato entre el frontend SSR BoxLang (`.bxm`/`.bxs`, vanilla JS en `assets/js/`) y el backend Node (`panel/server.js`). Las rutas tienen handlers en `panel/routes/`; `data-suckless-demo` controla el modo por vista. Requirements Gate ya conecta con el API real y su entrevista se validó visualmente hasta el estado listo para revisión. History y Dashboard también usan el API real tras smoke tests en navegador con SSR y backend activos. Executor está conectado al API real y se validó una corrida completa con polling; las vistas restantes siguen en modo demo mientras se completan sus smoke tests.

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
| `UPSTREAM_5XX` | `502` o `503` | Fallo transitorio o límite de concurrencia del ejecutor. |
| `INTERNAL` | `500` | Error no clasificado del servidor. |

### 1.3 Regla visual PASS/FAIL

La fuente de verdad del badge es el campo `status`. NO lo altera ningún texto generado por IA. Los valores posibles del ejecutor:

```
PASS · FAIL · EXECUTOR_ERROR
```

Para otros módulos, un enum propio.

### 1.4 Seguridad

- El **frontend** nunca usa `innerHTML` con datos de entrada (logs, código, respuestas de IA, campos del contrato). Siempre `textContent` o, para listas, `document.createElement`.
- En SSR BoxLang, todo dato dinámico va por la función de encode (`encodeForHTML` o equivalente). Nunca interpolación cruda en plantilla.
- `api.js` valida por `Content-Type` antes de `JSON.parse`. Si el backend responde HTML (ej. de un proxy que falló), se produce `code: "UPSTREAM_5XX"` y el frontend no intenta parsear.

---

## 2. Endpoints

> **Estado:** implementados en `panel/routes/` y despachados por `panel/server.js`. El modo demo sigue siendo el default para las vistas no validadas; Requirements Gate usa el API real.

### 2.1 `POST /api/requirements/analyze`

Recibe el texto libre del requerimiento, devuelve la entrevista sugerida.

**Request**

```json
{
  "text": "El carrito debe aplicar descuentos",
  "id": "REQ-a1b2c3",
  "answers": { "actor": { "answered": true, "answer": "Persona compradora" } }
}
```

| Campo | Tipo | Validación |
|---|---|---|
| `text` | string | `1–5000` caracteres tras trim. En una reentrevista, se vuelve a enviar el texto junto con el ID estable. |
| `id` | string·opcional | `REQ-` + seis caracteres hexadecimales; se usa para actualizar el mismo requisito. Si se omite, crea uno nuevo. |
| `answers` | object·opcional | Respuestas con clave igual a `questions[].id`; cada valor es texto o `{ answered, answer }`, donde `answered` es booleano y `answer` es texto. `answered: false` no registra una respuesta; claves desconocidas o valores de otro tipo se rechazan con `400 VALIDATION`. |

**Response 200**

```json
{
  "id": "REQ-a1b2c3",
  "status": "INCOMPLETE",
  "questions": [
    {
      "id": "actor",
      "text": "¿Quién usa esta función (actor)?",
      "category": "business",
      "answered": false,
      "answer": null,
      "type": "input"
    }
  ],
  "missingFields": ["actor", "expectedBehavior", "inputs", "errors", "acceptance", "edgeCases"],
  "document": {
    "objective": "El carrito aplica descuentos...",
    "actor": "Persona compradora",
    "behavior": "El carrito recalcula el total al aplicar el descuento o cupón.",
    "inputs": ["productos", "porcentaje de descuento", "código de cupón"],
    "rules": [
      "Los descuentos no se aplican a productos con precio ya rebajado.",
      "Un cupón no puede combinarse con otro cupón."
    ],
    "errors": ["cupón vencido", "porcentaje no soportado"],
    "acceptanceCriteria": [
      "Dado un carrito con 2 productos de 100 y un cupón -10%, el total debe ser 180."
    ],
    "edgeCases": ["carrito vacío con cupón", "descuento sobre producto ya rebajado"]
  }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID estable del requisito. Sirve para `POST /api/requirements/approve` y para `POST /api/executor/run`. |
| `status` | string | `INCOMPLETE` \| `READY_FOR_REVIEW` \| `APPROVED` |
| `questions[]` | array | Conjunto estable de preguntas aplicables a la entrevista, incluso después de responderlas. |
| `questions[].id` | string | Campo del modelo o decisión de dominio; estable durante la entrevista. |
| `questions[].text` / `.category` | string | category = `business` \| `technical` \| `scope` \| `acceptance`. |
| `questions[].answered` / `.answer` | bool / string·null | Estado; el frontend no los recalcula. |
| `missingFields[]` | array de strings | IDs de preguntas todavía pendientes; puede estar vacío aunque `questions[]` conserve el cuestionario y sus respuestas. Una respuesta actualiza el mismo requisito usando `id` en la próxima llamada. |
| `document` | object | Síntesis estructurada del requisito con claves **fijas**: `objective`, `actor`, `behavior`, `inputs`, `rules`, `errors`, `acceptanceCriteria`, `edgeCases`. Puede venir parcial (`null`/`[]`) si `status=INCOMPLETE`. `READY_FOR_REVIEW` requiere contestar las preguntas generadas por el Gate (incluidas decisiones de dominio o reglas); para aprobar también se validan `objective`, `acceptanceCriteria` y `edgeCases`. |

### 2.2 `POST /api/requirements/approve`

Registra la aprobación humana de un requisito. **Es la única vía para cambiar el status a `APPROVED`**; el frontend nunca lo pinta por sí mismo.

**Request**

```json
{ "id": "REQ-a1b2c3", "approvedBy": "Beatriz Fuentes" }
```

**Response 200**

```json
{
  "id": "REQ-a1b2c3",
  "status": "APPROVED",
  "approvedAt": "2026-10-10T14:05:12Z",
  "approvedBy": "Beatriz Fuentes",
  "document": {
    "objective": "El carrito debe aplicar descuentos",
    "actor": "Persona compradora",
    "behavior": "Aplica el cupón al carrito",
    "inputs": ["Código de cupón"],
    "rules": [],
    "errors": ["Cupón vencido"],
    "acceptanceCriteria": ["El total aplica el descuento"],
    "edgeCases": ["Carrito vacío"]
  }
}
```

> El `document` de la respuesta de approve sigue el mismo esquema de claves fijas que en §2.1 (puede resumirse).

**Errores típicos**

- `404 NOT_FOUND` si el id no existe.
- `400 VALIDATION` si `approvedBy` tiene menos de dos caracteres tras trim, si el requisito aún está incompleto o si ya está aprobado.

### `GET /api/requirements`

Lista requisitos persistidos, separado del historial de análisis. El selector del Executor y Two Doors consume este endpoint.

```json
[{ "id": "REQ-a1b2c3", "type": "requirements", "title": "El carrito debe aplicar descuentos",
   "status": "APPROVED", "createdAt": "2026-10-10T14:05:12.000Z", "approvedBy": "Equipo QA" }]
```

`status` usa `INCOMPLETE` \| `READY_FOR_REVIEW` \| `APPROVED`. Devuelve `[]` si no hay requisitos.

### 2.3 `POST /api/debug/analyze`

Recibe un log o stack-trace crudo. Devuelve hipótesis con evidencia (archivo + líneas) y un nivel de ladder (`hypothesis` → `reproduced` → `correction`).

**Request**

```json
{
  "log": "TypeError: Cannot read properties of undefined (reading 'find')\n    at addItem (cart.js:27)",
  "requirementId": "REQ-a1b2c3"
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

**Response 200 (inmediato: la corrida se creó y está en cola o ya avanzó)**

```json
{
  "id": "run_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "QUEUED",
  "target": "both",
  "requirementId": null,
  "checks": [],
  "summary": { "pass": 0, "fail": 0, "error": 0 },
  "durationMs": null,
  "trace": { "steps": [], "downloadUrl": null },
  "screenshots": [],
  "aiInterpretation": null
}
```

**Mismo shape en `GET /api/executor/run/{id}`** — cada respuesta trae el `status` global y todos los `checks[]` disponibles hasta el momento; no depende de eventos parciales.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID de la corrida; sirve para el polling de §2.5. |
| `status` | string | `QUEUED` · `RUNNING` · `PASS` · `FAIL` · `EXECUTOR_ERROR` — **solo** desde el ejecutor; el frontend lo pinta tal cual. |
| `checks[]` | array | Cada check con `status` individual (`QUEUED` · `RUNNING` · `PASS` · `FAIL` · `EXECUTOR_ERROR`), `durationMs` (`null` mientras corre) y `error` (`string·null`, primer mensaje del fallo). |
| `summary` | object | `pass`/`fail`/`error`; el frontend lo muestra, no lo recalcula. |
| `durationMs` | int·null | `null` mientras corre; duración total al terminar. |
| `trace` | object | `{ steps: [{action, selector, durationMs, error}], downloadUrl }` — pasos de la corrida y descarga de la traza. Puede venir vacío en MVP (checks de Node, sin Playwright). El frontend lo muestra en zona limpia; **no reimplementa el Trace Viewer**. |
| `screenshots[]` | array | `{checkName, url}` por captura; puede ser `[]`. |
| `aiInterpretation` | string·null | Texto de IA, opcional. Se muestra **solo** en el panel "Interpretación de la IA (no determina el resultado)", nunca junto al badge. |


### 2.5 `GET /api/executor/run/{id}`

Reconsulta una corrida. **Es el endpoint del polling en vivo**: el frontend lo consulta cada 1–1,5 s mientras `status` sea `QUEUED` o `RUNNING`, y se detiene al llegar a `PASS`, `FAIL` o `EXECUTOR_ERROR`. La función `pollRun()` vive solo en `api.js` (cambiar a SSE en el futuro no toca la UI).

**Response 200 en curso (ejemplo de respuesta del ciclo de polling):**

```json
{
  "id": "run_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "RUNNING",
  "target": "both",
  "requirementId": null,
  "checks": [
    { "name": "buggy:BASE-FRESH-LOAD", "status": "PASS", "durationMs": 142, "error": null },
    { "name": "buggy:DISCOUNT-10", "status": "RUNNING", "durationMs": null, "error": null }
  ],
  "summary": { "pass": 1, "fail": 0, "error": 0 },
  "durationMs": 1420,
  "trace": { "steps": [], "downloadUrl": null },
  "screenshots": [],
  "aiInterpretation": null
}
```

**Response 200 terminada (estado final del ejemplo de la demo):**

```json
{
  "id": "run_01J8Z3F0Y9Q2GBD9X3V5Q8N7B2",
  "status": "FAIL",
  "target": "both",
  "requirementId": null,
  "checks": [
    { "name": "buggy:BASE-FRESH-LOAD", "status": "EXECUTOR_ERROR", "durationMs": 142,
      "error": "TypeError: Cannot read properties of undefined (reading 'find') at addItem (cart.js:27)" },
    { "name": "DISCOUNT-10", "status": "PASS", "durationMs": 52, "error": null },
    { "name": "COUPON-EXCLUSIVE", "status": "FAIL", "durationMs": 61,
      "error": "Two active coupons were applied; only one is allowed" }
  ],
  "summary": { "pass": 3, "fail": 4, "error": 1 },
  "durationMs": 2140,
  "trace": {
    "steps": [
      { "action": "goto", "selector": "/", "durationMs": 210, "error": null },
      { "action": "click", "selector": "button[data-add='SKU-1']", "durationMs": 45, "error": null },
      { "action": "click", "selector": "button[data-coupon]", "durationMs": 38,
        "error": "TypeError: Cannot read properties of undefined (reading 'find')" }
    ],
    "downloadUrl": "/api/executor/run/{id}/trace.zip"
  },
  "screenshots": [
    { "checkName": "BASE-FRESH-LOAD", "url": "/mock/screenshots/BASE-FRESH-LOAD.png" }
  ],
  "aiInterpretation": "El check COUPON-EXCLUSIVE sugiere que..." 
}
```

**Reglas de negocio del polling (para backend y frontend):**

- Cada respuesta trae el `status` global y todos los checks disponibles; el frontend re-renderiza la lista completa en cada ciclo.
- El `status` global solo es `PASS` cuando todos los checks de todos los targets ejecutados están en `PASS`. Si hay un check en `FAIL`, el global es `FAIL`; si el runner falla o no puede ejecutar, es `EXECUTOR_ERROR`. El frontend nunca calcula el global por su cuenta.
- Mientras el proceso hijo ejecuta las pruebas, el snapshot puede tener `checks: []`; no se inventan estados parciales. Al completarse, aparecen los checks con sus resultados reales.
- El runner asíncrono puede devolver `checks: []` mientras el proceso hijo está corriendo. No se fabrican estados parciales: al completarse, cada check aparece con el resultado real.
- `durationMs` es `null` mientras corre y el total real al terminar.
- El frontend detiene el polling al llegar a estado terminal, tras un límite de 2 minutos, o al pulsar cancelar (cancelar = dejar de consultar, no interrumpe el backend).
- `aiInterpretation` es opcional y siempre llega en el campo dedicado; el frontend lo muestra en el panel "Interpretación de la IA (no determina el resultado)", nunca junto al badge.
- `trace.steps` y `screenshots` pueden venir vacíos en checks de Node (el MVP no usa Playwright); ambas son opcionales.

### 2.5.1 `GET /api/executor/run/latest`

Devuelve el último run persistido para el dashboard con el mismo shape de snapshot. `404 NOT_FOUND` si todavía no hay corridas. Esta ruta no sustituye `GET /api/history`.

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
  "summary": "Agrega un producto al carrito y recalcula totales.",
  "steps": [
    { "text": "Lee la lista de items del carrito", "file": "demo-store/src/cart.js", "lines": [22, 24] },
    { "text": "Busca el producto por id", "file": "demo-store/src/cart.js", "lines": [26, 26] },
    { "text": "Agrega el producto al array items", "file": "demo-store/src/cart.js", "lines": [28, 30] },
    { "text": "Recalcula totales", "file": "demo-store/src/pricing.js", "lines": [12, 18] }
  ]
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `steps[]` | array | Pasos ordenados con `{text, file, lines}`. El frontend construye la referencia `archivo:línea` y la hace clicable hacia el visor de código. Un paso puede omitir `file/lines` (`null`); se muestra igual, sin enlace. |

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
      "severity": "ALTA",
      "category": "LOGICA",
      "file": "demo-store/src/cart.js",
      "lines": [27, 31],
      "evidence": "this.cart.find(...) — no existe this.cart en el scope",
      "impact": "TypeError en runtime al agregar producto",
      "recommendation": "Usar this.items en lugar de this.cart",
      "patch": { "format": "diff", "language": "javascript", "content": "- this.cart.find(p => p.id === id)\n+ this.items.find(p => p.id === id)" },
      "proven": false
    }
  ]
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `status` | string | `OK` (sin hallazgos) \| `FINDINGS` |
| `findings[].severity` | string | `ALTA` · `MEDIA` · `BAJA` (mapa visual: ALTA=rojo, MEDIA=ámbar, BAJA=cian informativo).|
| `findings[].category` | string | `LOGICA` · `SEGURIDAD` · `CALIDAD` |
| `findings[].lines` | [int, int]·null | `[inicio, fin]`, 1-based; `null` si no aplica. **Un hallazgo sin `file/lines` se muestra igual sin romper el visor.** |
| `findings[].patch` | object·null | `{format, language, content}`. `format = "diff"` → el frontend pinta `+`/`-` con símbolo visible (no solo color); `"text"` → código plano. El botón "Copiar parche" copia `content` tal cual; feedback "Copiado ✓" + fallback si falla el portapapeles. **Nunca se aplica solo:** etiqueta fija "Recomendación de IA · requiere validación humana". Sin parche, la tarjeta sigue mostrando la recomendación. |
| `findings[].proven` | boolean | `true` si una prueba ejecutada demuestra el mismo problema ("Hallazgo demostrado"); `false` = "Sugerencia" (potencial hasta que una prueba lo pruebe). |

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
    "id": "42",
    "type": "verify",
    "title": "Cupón -10% · versión buggy",
    "status": "FAIL",
    "summary": "buggy: 2 PASS, 1 FAIL, 1 ERROR",
    "createdAt": "2026-10-10T14:03:00Z"
  }
]
```

- Array vacío `[]` cuando no hay historial — el frontend lo detecta por `Array.isArray && length === 0` y pinta el empty-state.
- `id` se devuelve como string opaco, aunque el almacenamiento local asigna enteros.
- `status` sigue los enums externos (`PASS`/`FAIL`/`EXECUTOR_ERROR` para verify; los demás módulos tienen enums propios), no los estados internos en español.

### 2.9 `GET /api/history/{id}`

Detalle persistido de un análisis. La respuesta común es `{ id, type, title, status, summary, createdAt, report, data, artifacts }`. `data` contiene los datos serializados del motor; no es la misma forma que la respuesta inmediata de creación. El status se normaliza al enum público, por ejemplo `FALLA → FAIL`, `APROBADO → APPROVED` y `HIPOTESIS → HYPOTHESIS`.

- `404 NOT_FOUND` si el id no existe.

### 2.10 `DELETE /api/history/{id}`

Elimina un análisis (y sus datos asociados: trace, screenshots, reporte). **Requiere confirmación humana en la UI**; el frontend pide confirmación antes del DELETE.

**Response 200**

```json
{ "deleted": true, "id": "42" }
```

- `404 NOT_FOUND` si el id no existe; la UI solicita confirmación antes de borrar.

### 2.11 `GET /api/history/{id}/export`

Descarga el reporte Markdown listo para pegar en GitHub/Jira.

- `200` con `Content-Type: text/markdown; charset=utf-8` y `Content-Disposition: attachment; filename="<id>.md"`. El frontend consume el texto crudo, sin parsear JSON.

Errores:
- `404 NOT_FOUND` si el id no existe.

---

## 3. Capa de datos

`assets/js/api.js`. Empaquetado ES module, importable por los demás `assets/js/modules/*`.

```js
import { api } from './api.js';
const doc = await api('/api/requirements/analyze', { method: 'POST', body: { text: '...' } });
```

### 3.1 Modo mock/real

- El modo demo permanece activo por defecto. `assets/js/api.js` lee el atributo `data-suckless-demo` de `<html>`; solo `data-suckless-demo="false"` activa llamadas reales.
- El cliente deriva localhost:4173 cuando el frontend está en localhost:8083. Para otros despliegues se puede fijar `globalThis.SUCKLESS_API_BASE` antes de cargar los módulos.
- El backend permite CORS únicamente desde `http://localhost:8083` y `http://127.0.0.1:8083` por defecto. Configure `SUCKLESS_FRONTEND_ORIGINS` con orígenes explícitos si hace falta.

```js
// Cada vista selecciona explícitamente el modo según su smoke test.
<html data-suckless-demo="true">
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

### 3.4 Polling aislado: `pollRun()`

La consulta en vivo de una corrida vive **solo** en `api.js`, para poder migrar a SSE (u otro mecanismo) sin tocar la UI:

```js
import { pollRun } from './api.js';

const stop = pollRun(runId, onSnapshot, { intervalMs: 1200, maxDurationMs: 120_000 });
// onSnapshot(data) recibe TODOS los checks acumulados en cada cycle el ciclo completo;
// se detiene al llegar a PASS/FAIL/EXECUTOR_ERROR, al vencer maxDurationMs (2 min)
// o al llamar stop(). Errores transitorios de red se toleran (retry antes de fallar).
```

Cambiar a SSE más adelante = reescribir `pollRun` dentro de `api.js` con la misma firma; ningún módulo de UI cambia.

### 3.6 Protocolo de respuesta: `wrap()`

Helper `wrap()` toma una promise → devuelve `{ loading, error, data, isEmpty }`

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
| `POST /api/requirements/analyze` | `mock/requirements-analyze.ok.json` (document completo 8 claves fijas), `mock/requirements-analyze.empty.json` (todo nulo/vacío), `mock/requirements-analyze.500.json`, `mock/requirements-analyze.timeout.json` (para reproducir timeout/latencia), `mock/requirements-analyze.validation.json` (payload inválido), `mock/requirements-analyze.invalid.json` (**fixture no-JSON** para probar el parser; api.js lo rechaza como EMPTY_RESPONSE en modo real). |
| `POST /api/requirements/approve` | `mock/requirements-approve.ok.json` (status APPROVED + document completo), `mock/requirements-approve.error.json` (404/validación). |
| `POST /api/debug/analyze` | `mock/debug-analyze.ok.json` (hipótesis con evidencia archivo+líneas), `mock/debug-analyze.empty.json` (sin hipótesis), `mock/debug-analyze.500.json`, `mock/debug-analyze.validation.json`. |
| `POST /api/executor/run` | `mock/executor-run.queued.json` (QUEUED inicial; el mock lo devuelve), `mock/executor-run.ok.json` (FAIL real 3/4/1 con trace.steps, screenshots y aiInterpretation), `mock/executor-run.empty.json` (PASS sin checks), `mock/executor-run.500.json`. |
| `GET /api/executor/run/{id}` | **Ciclo simulado de polling:** primer GET → `executor-run.running.json`, siguientes → `executor-run.ok.json`. Excepción: id terminado en `404` → `mock/executor-run.get.404.json`. |
| `GET /api/executor/run/latest` | `mock/executor-run.ok.json`. |
| `GET /api/requirements` | `mock/requirements-list.json`. |
| `POST /api/code/explain` | `mock/code-explain.ok.json` (steps[{text,file,lines}]), `mock/code-explain.404.json` (símbolo inexistente). |
| `POST /api/code/review` | `mock/code-review.ok.json` (ALTA/MEDIA/BAJA, category, patch {format,language,content}, proven), `mock/code-review.empty.json` (0 hallazgos), `mock/code-review.no-patch.json` (hallazgo sin file/lines/patch: la tarjeta se muestra igual), `mock/code-review.500.json`. |
| `GET /api/history?type=` | `mock/history.ok.json` (varios tipos), `mock/history.empty.json` []. |
| `GET /api/history/{id}` | `mock/history-detail.verify.json` (run con trace objeto y screenshots), `mock/history-detail.debug.json`, `mock/history-detail.requirements.json` (requirement con document completo de 8 claves), `mock/history-detail.404.json` (id con terminación "404"). |
| `DELETE /api/history/{id}` | `mock/history-delete.ok.json`. |
| `GET /api/history/{id}/export` | `mock/history-export.md` (texto Markdown, no JSON; api.js lo trae como texto crudo para descarga). |

Nota: `mock/screenshots/*.png` y `mock/executor-trace.zip` son referenciados por URL en los executor mocks; crear fixtures placeholder al implementar la Etapa 5 (galería de capturas y descarga de traza).

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
