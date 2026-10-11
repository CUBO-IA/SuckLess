# SuckLess

**Menos frustración. Más soluciones comprobadas.**

SuckLess convierte requerimientos incompletos en especificaciones verificables y ayuda a diagnosticar, explicar y revisar código. Combina una aplicación de entrevista en BoxLang AI con un motor Node.js que comprueba resultados mediante pruebas ejecutadas.

> **Aclarar → Diagnosticar → Probar → Verificar**
> No adivinamos. Lo demostramos.

Proyecto del reto 10 (*This Sucks*) del hackathon ANIA × BoxLang AI.

## Cómo está organizado el proyecto

El repositorio reúne dos partes complementarias:

1. **Requirement Gate en BoxLang** (`src/`, `config/`, `prompts/`, `schemas/`): entrevista a la persona usuaria, evalúa el requerimiento y genera un reporte Markdown. Usa BoxLang AI y puede conectarse a OpenAI o a Ollama.
2. **Motor de evidencia en Node.js** (`engine/`, `agents/`, `kit/`, `panel/`): administra requisitos, análisis de código, ejecución de pruebas, historial y reportes. Los agentes de BoxLang pueden orquestar este motor, pero la aprobación del requisito sigue siendo humana y el resultado PASS/FAIL lo determina el runner.

La separación entre `prompts/` y `kit/prompts/` es intencional: el primer directorio contiene el prompt de la aplicación BoxLang; el segundo contiene instrucciones para los agentes que operan sobre el motor Node.

## Frontend y API (SSR BoxLang + Node)

La nueva interfaz se construye con plantillas SSR de BoxLang (`.bxm`/`.bxs`) y JS vanilla, **sin framework ni CDN**, con la identidad visual del *Futuristic Cyberpunk Dashboard* ([prompts/design guide.md](prompts/design guide.md)). Está desacoplada del backend mediante contratos y mocks:

| Pieza | Ruta | Descripción |
|---|---|---|
| Contrato de API | [docs/contrato-api.md](docs/contrato-api.md) | Endpoints implementados, shapes, códigos de error y convenciones. |
| Mocks | [mock/](mock/) | JSON para cada endpoint: éxito, vacío, 500, 404, timeout. |
| Capa de datos | [assets/js/api.js](assets/js/api.js) | Único punto de fetch. Demo activa mocks por defecto; `data-suckless-demo="false"` usa el backend real. Provee `api()`, `wrap()`, `pollRun()` y `ApiError` uniformes. |
| API local | [panel/server.js](panel/server.js) | Servidor loopback en `127.0.0.1:4173`; handlers por dominio en `panel/routes/`, con CORS explícito para SSR local. |
| Tokens | [assets/css/tokens.css](assets/css/tokens.css) | Paleta cyberpunk §3.1 + `@font-face` de las 3 fuentes variables vendorizadas. |
| Base | [assets/css/base.css](assets/css/base.css) | Reset, tipografía, foco cian, contenedor 1280 px, reveal y `prefers-reduced-motion`. |
| Componentes | [assets/css/components/](assets/css/components/) | 14 módulos: card, button, badge, kpi, nav, table, tabs, accordion, modal, toast, form, dropzone, skeleton, empty-state, stepper, code-view, demo-banner. |
| Layout SSR | [views/](views/) | `layouts/base.bxm` + partials (nav, badge, toast, modal, empty-state, kpi-card, demo-banner) y `ui-kit.bxm`. |
| UI JS | [assets/js/ui/](assets/js/ui/) | `particles`, `modal`, `toast`, `reveal` (vanilla, ES modules, accesibles). |

El modo demo sigue activo en las vistas que aún no han pasado un smoke test con el API. Requirements Gate (`views/requirements-index.bxm`) ya usa el backend real: el recorrido de entrevista y guardado hasta `LISTO PARA REVISAR` se validó contra el servidor actualizado. History (`views/history-index.bxm`) y Dashboard (`views/index.bxm`) también usan el backend real tras validar carga, filtros, detalle, exportación, borrado e indicadores con SSR y API activos. Executor (`views/executor-index.bxm`) también está conectado al API real: se validaron la carga de requisitos y una corrida completa con polling; una de las comprobaciones sembradas en la versión `buggy` terminó en error de ejecución (`BASE-FRESH-LOAD`), pero la conexión y el polling funcionaron. Para probarlas, inicia el API (`npm run panel`) en `127.0.0.1:4173` y el servidor SSR BoxLang en el puerto 8083. Si usas otro puerto, establece `globalThis.SUCKLESS_API_BASE` antes de cargar los módulos. El flujo visual de aprobación requiere confirmación humana; la aprobación y el endpoint se verifican además en las pruebas HTTP.

Verificaciones ya ejecutadas en la Etapa 1:

- Contraste WCAG AA programático: 9/9 pares de color ≥ 4.5:1 sobre `--bg-card` y `--bg-elevated` (muted solo en texto grande/decorativo).
- Las 3 fuentes variables (`Orbitron`, `Space Grotesk`, `JetBrains Mono`) cargan localmente, sin CDN ni red externa.
- Banner **MODO DEMO · DATOS DE EJEMPLO** visible mientras `USE_MOCK=true` (via atributo `data-suckless-demo` en `<html>`).
- `prefers-reduced-motion` desactiva partículas, shimmer y animaciones.
- Sin scroll horizontal a 390 / 768 / 1440 px; nav colapsable a 768.

Reglas sintetizadas (detalle en `docs/contrato-api.md`):

- HTML semántico renderizado en SSR; JS solo agrega interactividad (progressive enhancement).
- Logs, código y respuestas de IA son contenido no confiable: siempre `textContent`, nunca `innerHTML`.
- El badge PASS/FAIL proviene **únicamente** del campo `status` del ejecutor; ningún texto de IA lo modifica.
- Accesibilidad WCAG AA: navegación por teclado, `aria-live` para updates, color nunca como único indicador (✓/✗ además del verde/rojo).
- Responsive desktop-first para el jurado, usable en tablet y móvil.

## Inicio rápido

### Motor Node.js

Requiere Node.js **22.13 o posterior**. No necesita instalar dependencias npm.

```bash
node -v
npm test
npm run demo
```

Para abrir el panel local:

```bash
npm run panel
```

El panel escucha en `http://127.0.0.1:4173`.
El origen SSR `http://localhost:8083` y `http://127.0.0.1:8083` está autorizado por CORS. Para un origen de presentación diferente, establece `SUCKLESS_FRONTEND_ORIGINS` como lista de orígenes explícitos (sin comodín `*`).

### CLI del motor

Los comandos se ejecutan desde la raíz:

```bash
npm run cli -- <comando>
```

| Comando | Qué hace |
|---|---|
| `req start "<texto>"` | Abre un requisito y muestra la información pendiente |
| `req answer <id> --set combinable=no` | Registra respuestas explícitas del equipo |
| `req approve <id> --by "Nombre"` | Registra la aprobación humana |
| `verify [--req <id>] [--target buggy\|fixed\|both]` | Ejecuta las pruebas disponibles |
| `trace` / `debug --log <archivo>` | Analiza una traza o un error |
| `explain <función>` | Explica estáticamente el flujo de una función |
| `review <archivo>… [--req <id>]` | Revisa código y presenta hallazgos con evidencia |
| `history list\|show\|delete` / `report <id>` | Consulta el historial o genera un reporte |

## Ejecutar el Requirement Gate de BoxLang

Requiere BoxLang y el módulo `bx-ai`. Para OpenAI, configura `OPENAI_API_KEY` en `.env` a partir del ejemplo:

```bash
install-bx-module bx-ai --local
cp .env.example .env
boxlang --bx-config config/boxlang.json src/SuckLess.bxs
```

Como alternativa, con Ollama instalado y activo:

```bash
ollama pull qwen3:4b-instruct
boxlang --bx-config config/boxlang.ollama.json src/SuckLess.bxs
```

La configuración de Ollama usa `qwen3:4b-instruct`; ajusta el modelo en `config/boxlang.ollama.json` si necesitas uno más pequeño. La aplicación conduce una entrevista y guarda el resultado en `output/`.

## Ejemplo de evidencia

`demo-store/` contiene errores intencionales y `demo-store-fixed/` la versión de referencia corregida. En la demo documentada, la versión defectuosa obtuvo **3 PASS, 4 FAIL y 1 ERROR**; la corregida obtuvo **8/8 PASS**.

El runner ejecuta las comprobaciones en un proceso hijo con límite de tiempo y entorno acotado. PASS/FAIL proviene de la ejecución, no de una respuesta generada por el modelo. Debug, Explain y Review son análisis estáticos deterministas; sus hallazgos no sustituyen las pruebas.

## Estructura

```text
agents/             Agentes BoxLang AI que orquestan el motor Node
assets/             Frontend Etapa 0: css/ (tokens, módulos) y js/ (api.js, ui/, modules/)
config/             Configuración del módulo bx-ai para OpenAI y Ollama
demo-store/         Mini tienda con fallos sembrados y sus checks
demo-store-fixed/   Referencia corregida para la comparación
docs/               arquitectura + contrato-api.md (contratos Etapa 0)
engine/             CLI y núcleo Node: requisitos, runner síncrono/asíncrono, debug y review
examples/           Requerimientos de ejemplo para la entrevista
kit/                Prompts y criterios de revisión del motor Node
mock/               JSON de mocks para todos los endpoints del contrato
panel/              API local, handlers por dominio e interfaz de evidencias
prompts/            Prompt del Requirement Gate de BoxLang + design guide.md
schemas/            Esquema de respuesta estructurada de BoxLang AI
scripts/            Demo guiada
src/                Aplicación Requirement Gate de BoxLang
test/               Pruebas del motor y de los endpoints HTTP
```

## Alcance y estado

- Las pruebas ejecutables incluidas se enfocan en la demo de descuentos/cupones; el Requirement Gate puede documentar otros dominios, pero no genera checks automáticamente para todos ellos.
- El runner usa Node y `node:assert`; Playwright no es una dependencia del MVP.
- El panel es local y escucha solo en `127.0.0.1`. El proyecto no ofrece autenticación multiusuario ni integración directa con GitHub o Jira.
- No se aplican correcciones automáticamente; las recomendaciones requieren revisión humana.
- La aplicación `src/SuckLess.bxs` y la configuración de proveedores forman el prototipo de entrevista. La orquestación `agents/` sobre el motor Node debe considerarse experimental hasta validarse en el runtime BoxLang objetivo.

## Equipo

- Beatriz Fuentes
- Kevin Fonseca
- Felicito Escobar
- Diego Novoa
