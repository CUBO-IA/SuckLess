# Conexión con el backend — checklist Etapa 8

Cómo apagar `USE_MOCK` y conectar el frontend SSR + vanilla JS con el backend
real (servicio BoxLang o `panel/server.js` ampliado). Contrato completo y shapes:
[docs/contrato-api.md](contrato-api.md).

---

## 1. Encender el backend real

```js
// assets/js/api.js — línea 12
export const USE_MOCK = true;   // ← cambiar a false
```

Eso es todo: **ningún módulo de UI llama a fetch por su cuenta**; todos pasan
por `api()`. Con la bandera en `false`, `api.js` hace `fetch` real contra las
rutas del contrato con los helpers ya montados (timeout por petición con
`AbortController`, mapeo HTTP → `ApiError.code`, rechazo de respuestas que no
son JSON, `EMPTY_RESPONSE` si el cuerpo llega vacío). El banner
"MODO DEMO · DATOS DE EJEMPLO" desaparece solo (lo controla `data-suckless-demo`
en `<html>`, que cada wrapper `.bxm` fija vía `bx:set useMock`).

Otras banderas derivadas que conviene revisar en el mismo commit:

| Dónde | Qué cambia |
|---|---|
| `assets/js/modules/exec-reqid / debug-reqid / code-*` | Ya no dependen de mocks: elimina seeds de ejemplo (dashboard usa `/api/executor/run/{id}` fijo mock; necesitará "última corrida" del backend — ver §5). |
| `views/*-index.bxm` (`bx:set useMock = true`) | Con backend real entre `false` para retirar el banner. |
| `panel/server.js` (opcional) | Si sirve la UI estática, añadir proxies a los endpoints del contrato. |

---

## 2. Rutas que debe exponer el backend (resumen del contrato §2)

| Método y ruta | Consumido por |
|---|---|
| `POST /api/requirements/analyze` | requirements.js (entrevista) |
| `POST /api/requirements/approve` | requirements.js (aprobar en modal) |
| `POST /api/debug/analyze` | two-doors.js (puerta A) |
| `POST /api/executor/run` | executor.js, two-doors.js (puerta B) |
| `GET /api/executor/run/{id}` | executor.js (polling 1,2 s, máx 2 min) |
| `POST /api/code/explain` | code.js |
| `POST /api/code/review` | code.js |
| `GET /api/history?type=` | history.js, dashboard.js (resumen) |
| `GET /api/history/{id}` | history.js (modal de detalle) |
| `DELETE /api/history/{id}` | history.js (borrado con confirmación) |
| `GET /api/history/{id}/export` | history.js (Markdown crudo → Blob) |

Reglas de comportamiento no negociables (detalle en contrato §2.4–2.5 y §1):

- **Toda respuesta de error (HTTP ≥ 400) es** `{ error: { code, message } }`
  con los códigos del contrato — el frontend nunca dibuja mensajes crudos ni
  inventa texto de error.
- **`status` del ejecutor es la única fuente del badge global y de cada check**
  (`PASS/FAIL/EXECUTOR_ERROR`); el frontend no recalcula nada. El global solo
  es `PASS` cuando TODOS los checks son `PASS`.
- Cada `GET /api/executor/run/{id}` devuelve el `status` + **todos** los
  `checks[]` acumulados (no eventos incrementales: el frontend re-renderiza completo).
- `GET /api/history/{id}/export` responde `text/markdown` y
  `Content-Disposition: attachment` — el frontend lo toma como texto, no JSON.
- El `Content-Type` de éxito es `application/json; charset=utf-8` (salvo el export).

---

## 3. Cómo probar la conexión paso a paso

1. `USE_MOCK = false` en `assets/js/api.js`.
2. Levantar el backend que expone las rutas (esperado en el mismo origin; si
   difiere, añade un proxy en tu servidor para no romper la regla same-origin).
3. Recorrer el flujo completo y verificar en Network:
   - Requirements Gate: analizar → responder → `status` pasa a `READY_FOR_REVIEW`
     solo tras los responses del backend → aprobar en modal → `APPROBADO` verde.
   - Two Doors A: pegar un trace real de la demo → hipótesis etiquetadas como
     pendientes; nunca "causa confirmada".
   - Executor: Ejecutar → `EN COLA` (badge gris) → `EJECUTANDO` (cian giratorio)
     → `PASS/FAIL/ERROR` con los colores exactos que devolvió el ejecutor.
     Verificar que la UI se detiene sola al llegar a terminal (polling).
   - Code & Review: hallazgos, `proven=true` ("Hallazgo demostrado") sin pruebas
     en exec-P0 demo (verificar contra `kind` del análisis real).
   - Historial: filtrar por `?type=REVIEW`, abrir detalle (`GET /{id}`), exportar
     `.md` (bajarlo y abrirlo), borrar uno (`DELETE`, confirmación) y refrescar
     sin recarga.
4. Regresión de etiquetas: con `USE_MOCK=false` **ninguna** pantalla debe mostrar
   "Dato de ejemplo", ni "MODO DEMO", ni "interpretación de la IA" mezclada con
   el badge de resultado.

---

## 4. Errores comunes y su semántica en la UI

| `error.code` | La UI hace |
|---|---|
| `TIMEOUT` (504) | Mensaje "La petición excedió N s" en `role=alert` + botón reintentar en la tarjeta afectada. |
| `EMPTY_RESPONSE` (502) | Texto "El servidor respondió sin contenido" — distinguir del estado vacío (con backend real: arreglo de 0 ítems). |
| `NOT_FOUND` (404) | Mensaje de contrato, típicamente al abrir detalle/borrado de un id ya eliminado. |
| `VALIDATION` (400) | Mensaje tal cual del backend junto al campo; no lo reescribe la UI. |
| `OVERSIZED_BODY` (413) | El cliente ya corta a 1 MB en POST; si llega, es límite del backend. |
| `UPSTREAM_5XX` (502/503) | "Fallo del proveedor aguas abajo" (IA/ejecutor); la tarjeta muestra error local sin tumbar la página. |
| `INTERNAL` (500) | Error genérico de servidor; el mensaje del backend se muestra tal cual. |

En el executor, los transitorios de red de polling se toleran hasta 3 reintentos
(`maxNetworkErrors` en `api.js`); `NOT_FOUND` aborta el polling al instante.

---

## 5. Cosas que el backend debe resolver antes del corte (P0 del hackathon)

1. **"Última corrida" para el dashboard:** hoy los KPI de checks OK/FALLA usan un
   `run_01J8Z3F2…` fijo (mock). Necesitas either un endpoint "last run"
   (recomendado: `GET /api/executor/last`) o filtrar `GET /api/history?type=verify`
   de mayor `createdAt` cuya BadId luego consultes.
2. **Requisitos aprobados en selects** (Two Doors / Executor): la vía actual
   (`GET /api/history?type=requirements` + filtro `status === 'APPROVED'` en el
   cliente) sigue funcionando, pero valida que el historial tenga esos registros.
3. **Persistencia del requisito entre pantallas:** los mock hoy quedan en
   memoria del backend del plan; en el real, sosten `id` del requisito en URL
   (p. ej. `?req=...`) si tu servicio BoxLang no guarda estado por sesión
   (revisar §0.2 — el requisito aprobado ES TOQUE DE BACKEND, no frontend).
4. **CORS/same-origin:** si el backend BoxLang corre en otro puerto, añade proxy
   en tu servidor web o cabeceras CORS solo para el origin de la UI (cookies con
   `SameSite=Lax` + `Access-Control-Allow-Credentials` no son necesarias hoy,
   no hay auth en el MVP).
5. **Idempotencia de DELETE:** primera llamada borra; segunda sobre el mismo id
   responde 404 o `{deleted:false}` (a definir en backend; la UI tolera ambas).

---

## 6. Recordatorio del alcance

Cualquier cambio más allá de la bandera y de las rutas que cambien semántica del
contrato es **alcance de backend** (§0.2 del plan): documenta el gap en
`docs/contrato-api.md` y pide el ajuste al equipo backend en lugar de
implementarlo en el frontend. El frontend con backend real NO puerta jamás la
separación: los datos crudos que llegan del ejecutor pasan tal cual al badge,
sin remapeos defensivos que escondan estados (§1.1).

Inicial de mantenimiento: si al conectar el backend un módulo rompe, primero
revisar el mensaje de consola `[suckless] boot {módulo} falló:` y el
`errorBody.error.code` en Network antes de tocar la UI.
