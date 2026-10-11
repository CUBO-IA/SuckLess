# Plan de integración Backend → Frontend (4 agentes)

**Objetivo:** entregar una integración comprobable entre el frontend SSR de BoxLang, la capa de datos JavaScript y el motor Node, sin presentar mocks como resultados reales.

## Estado

El backend anterior exponía rutas distintas y respuestas internas en español. La integración de esta rama incorpora adaptadores HTTP, errores uniformes, una cola asíncrona de corridas, CORS local restringido y pruebas HTTP. El modo mock sigue siendo el predeterminado; las vistas no se deben cambiar a modo real hasta completar el smoke test del frontend en el entorno de presentación.

La cola de corridas vive en memoria del proceso: reiniciar Node pierde los IDs de polling, y no se debe presentar como servicio persistente o multiinstancia.

## Arquitectura y contrato de trabajo

```text
BoxLang SSR (8083) ── assets/js/api.js ── HTTP/CORS ── Node API (4173)
                                                           │
                               panel/routes/* ── engine/*
                                                           │
                                              SQLite + data/
```

- `panel/server.js` conserva las protecciones HTTP: loopback, Host permitido, JSON, límite de 1 MB, CSP y `nosniff`.
- `panel/routes/shared.js` fija el formato de resultado y errores `{ error: { code, message } }`.
- `assets/js/api.js` es el único cliente HTTP. `data-suckless-demo` mantiene los mocks activos salvo que una vista se habilite explícitamente tras la aceptación final.
- El backend solo permite por defecto `http://localhost:8083` y `http://127.0.0.1:8083`. Si la demo usa otro origen, configúrese `SUCKLESS_FRONTEND_ORIGINS` con orígenes exactos, separados por coma; no usar `*`.
- `SUCKLESS_API_BASE` puede fijar la URL de API en despliegues distintos. En localhost:8083 se deriva el puerto 4173.

### Rutas implementadas

| Método y ruta | Propósito |
|---|---|
| `GET /api/requirements` | Requisitos locales y su estado |
| `POST /api/requirements/analyze` | Crear/actualizar entrevista; `id` opcional para continuar una existente |
| `POST /api/requirements/approve` | Aprobación humana |
| `POST /api/debug/analyze` | Diagnóstico adaptado al contrato |
| `POST /api/executor/run` | Encolar verificación y devolver `QUEUED` |
| `GET /api/executor/run/{id}` | Snapshot acumulado para polling |
| `GET /api/executor/run/latest` | Última corrida para el dashboard |
| `POST /api/code/explain` | Explicación con referencias a archivo/línea |
| `POST /api/code/review` | Hallazgos normalizados |
| `GET /api/files` | Índice de fuentes y símbolos |
| `GET /api/history[?type=&q=]` | Búsqueda del historial |
| `GET /api/history/{id}` | Detalle |
| `DELETE /api/history/{id}` | Borrado y limpieza de artefactos |
| `GET /api/history/{id}/export` | Markdown descargable sin envoltorio JSON |

`GET /api/requirements` y `GET /api/executor/run/latest` son adiciones necesarias para el selector de requisitos y el dashboard; no confundir sus datos con el historial de análisis. Los IDs de historia se serializan como strings opacos, aunque el almacenamiento local actual usa enteros.

## División del trabajo

Antes de abrir ramas, el integrador publica el contrato compartido de handlers (`handle(req, url, body) → { status, data }`, o `{ status, text, contentType, headers }` para export) y crea una rama base de integración. Los tres agentes de dominio parten del mismo commit de esa rama; no mezclan commits directo a `main`.

| Agente | Propietario exclusivo | Entrega |
|---|---|---|
| **1. Requirements Gate** | `panel/routes/requirements.js`, cambios acotados en `engine/requirements.js`, tests asociados | Adaptar las preguntas y estados, preservar el ID entre respuestas, mapear `expectedBehavior → behavior` y exigir los campos obligatorios reales (incluidos casos límite); cubrir aprobación |
| **2. Debug & Executor** | `panel/routes/debug.js`, `panel/routes/executor.js`, `engine/runner.js`, `engine/service.js`, tests asociados | Adaptar la escalera de evidencia y ejecutar el trabajo fuera del ciclo síncrono HTTP; verificar polling y estados terminales |
| **3. Code & History** | `panel/routes/code.js`, `panel/routes/history.js`, tests asociados | Mapear explain/review, filtrar historial, entregar detalle/delete/export con shape y Content-Type correctos |
| **4. Integración y UI** | `panel/server.js`, `panel/routes/shared.js`, `assets/js/api.js`, `assets/js/modules/*`, fixtures/mock, smoke tests y este plan | Dispatcher, límites HTTP/CORS, base URL configurable, eliminar IDs mock fijos de dashboard y conectar clientes a `/api/requirements`; integrar y probar |

Los agentes 1–3 no modifican `server.js`, `api.js`, vistas `.bxm` ni la bandera demo. El agente 4 integra después de acordar shapes y no cambia `useMock` solo porque una ruta ya existe. No se asignan vistas por módulo a ramas paralelas: el indicador de demo y el modo del cliente HTTP deben cambiar coordinadamente.

### Dependencias reales

1. Integrador define el convenio de handler y envelope de errores antes de empezar.
2. Agentes 1–3 implementan sus rutas en archivos separados y añaden pruebas.
3. Integrador conecta dispatcher y cliente UI después de que los handlers compilen.
4. Integrador ejecuta suite completa y el recorrido en navegador; solo entonces habilita modo real en las vistas acordadas.

El trabajo de Agente 2 no se puede declarar terminado al solo usar `setImmediate()` alrededor de `runVerify()`: ese servicio bloquea el event loop. El proceso hijo debe lanzarse asíncronamente, devolver snapshots observables, imponer timeout/límite de salida y no anunciar `PASS` hasta acabar todas las pruebas. Si una ejecución todavía no reporta checks individuales, mantener `checks: []` es correcto; no inventar avance.

## Reglas de implementación

- Validar método, tipos, límites y campos requeridos en el borde HTTP. No convertir errores inesperados en éxito ni ocultar errores con catches vacíos.
- Errores de contrato: 400 `VALIDATION`, 404 `NOT_FOUND`, 413 `OVERSIZED_BODY`, 502/503 `UPSTREAM_5XX`, 504 `TIMEOUT`, 500 `INTERNAL`.
- Los estados externos son enums del contrato, no los estados internos del motor. PASS/FAIL provienen exclusivamente de checks ejecutados.
- Guardar respuestas/hallazgos con `textContent` y nodos DOM; no introducir `innerHTML` para datos del backend.
- Revisar que los datos de debug, los reportes y las trazas sigan redactando secretos.
- History export retorna Markdown crudo; todos los demás éxitos API retornan JSON.
- No activar mocks por módulo ni remover el rótulo demo hasta que todos los flujos previstos se hayan probado con el backend real.
- No publicar ni mergear a `main` sin decisión explícita del propietario del repositorio.

## Pruebas y aceptación

Desde la raíz del proyecto:

```sh
npm test
npm run panel
```

La suite debe probar handlers/HTTP sin depender de un puerto fijo, y cubrir al menos:

- requisitos incompletos → listos → aprobación; errores por ID o nombre inválidos;
- debug con hipótesis no confirmada y con reproducción verificada;
- `POST run` devuelve `QUEUED`; GET devuelve snapshots acumulados y solo finaliza con `PASS`, `FAIL` o `EXECUTOR_ERROR`;
- `both` no devuelve `PASS` si una versión falla; IDs inexistentes y target inválido;
- explain/review, paths fuera de demo, empty/findings y formas de sus campos;
- filtros, detalle, delete/artefactos y export Markdown;
- cuerpo mal formado/grande, Content-Type, Host y CORS permitido/denegado;
- cliente `api.js` en modo real usando URL configurable y envelope de errores.

Antes de cambiar `useMock`, hacer un smoke test en navegador con backend y SSR activos: analizar y responder un requisito, aprobarlo con confirmación humana, ejecutar contra `fixed` y `both`, observar el polling, revisar y exportar historial. Guardar el resultado en el resumen de entrega (no en fixtures presentados como datos reales).

## Checklist de integración

- [x] Handlers separados por dominio y dispatcher HTTP.
- [x] Adaptador de estados/shape del Requirements Gate; casos límite obligatorios.
- [x] Cola de ejecución asíncrona y `runChecksAsync`; límites de concurrencia/retención.
- [x] CORS local explícito y base de API configurable; mocks conservados por defecto.
- [x] GET requirements separado del historial y endpoint de última corrida para dashboard.
- [x] Pruebas de HTTP, adaptadores, polling terminal, history export y cliente real.
- [ ] Probar flujo visual real en el navegador con los dos servidores activos.
- [ ] Cambiar las vistas de modo demo únicamente después de esa prueba.
- [ ] Revisar personalmente el resultado real antes de presentarlo como integración final.
