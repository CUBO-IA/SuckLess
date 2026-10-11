# SuckLess

**Menos frustración. Más soluciones comprobadas.**

SuckLess es un agente construido con BoxLang AI que transforma requerimientos incompletos en especificaciones verificables. Detecta información faltante o ambigua, formula preguntas concretas, genera criterios de aceptación y conecta esos criterios con pruebas ejecutables. El proyecto combina una capa de agentes con un motor Node controlado que exige evidencia antes de afirmar que algo funciona.

## Reto

Challenge 10 — **THIS SUCKS**

## Equipo

- Beatriz Fuentes
- Kevin Fonseca
- Felicito Escobar
- Diego Novoa

## MVP

1. Recibir un requerimiento en texto libre.
2. Evaluar su claridad y completitud.
3. Preguntar por la información faltante.
4. Generar un requerimiento estructurado.
5. Solicitar aprobación humana.
6. Producir criterios de aceptación verificables.
7. Ejecutar pruebas y generar un reporte con evidencia.

## Filosofía del proyecto

```text
Aclarar → Diagnosticar → Probar → Verificar
No adivinamos. Lo demostramos.
```

El sistema no “cree” que una solución funciona. Primero define el requisito, valida la información faltante, genera pruebas desde ese criterio aprobado y solo después ejecuta el runner para comprobar el resultado real.

## Inicio rápido

### Requisitos

- Node >= 22.13
- BoxLang 1.18 o posterior (para la capa de agentes)
- Si se usa OpenAI, tener API key disponible

### Instalación y pruebas del motor

```bash
node -v
npm test
npm run demo
npm run panel
```

CLI del motor (`npm run cli -- <comando>`):

| Comando | Qué hace |
|---|---|
| `req start "<texto>"` | Abre un requisito y muestra las preguntas pendientes |
| `req answer <id> --set combinable=no …` | Registra respuestas del equipo |
| `req approve <id> --by "Nombre"` | Solo una persona aprueba |
| `verify [--req <id>] [--target buggy\|fixed\|both]` | Ejecuta pruebas antes/después |
| `trace` / `debug --log <archivo>` | Traza real con diagnóstico basado en evidencia |
| `explain <función>` / `review <archivo>… [--req <id>]` | Explicador y revisión del código |
| `history list\|show\|delete` / `report <id>` | Historial y reportes `.md` |

### Instalación de BoxLang AI

```bash
install-bx-module bx-ai --local
cp .env.example .env
```

Agrega tu API key en `.env` y ejecuta:

```bash
boxlang --bx-config config/boxlang.json src/SuckLess.bxs
```

### Alternativa local con Ollama

Ollama permite ejecutar SuckLess sin una API key ni créditos de OpenAI.

```bash
ollama pull qwen3:4b-instruct
ollama list
boxlang --bx-config config/boxlang.ollama.json src/SuckLess.bxs
```

La aplicación entrevista al usuario hasta completar el requerimiento y guarda el resultado en `output/`.

## Qué hace cada pieza y cómo se comprueba

| Función | Implementación | Verificación |
|---|---|---|
| Requirements Gate | `engine/requirements.js` recoge preguntas por campo faltante y decisión de negocio | tests 2–4 |
| Pruebas desde criterios aprobados | Solo se generan si el requisito está aprobado y no cambió | tests 4–5 |
| Ejecutor controlado | `engine/runner.js` + `check-host.mjs` con proceso hijo, tiempo límite y entorno mínimo | tests 5–6 |
| Debug | `engine/debug.js` parsea trazas reales y localiza `archivo:línea` sospechosos | tests 7–10 |
| Code Explainer | `engine/explain.js` analiza flujo y llamadas | test 11 |
| Code Review | `engine/review.js` aplica reglas con severidad, evidencia e impacto | tests 12–14 |
| Historial | `engine/history.js` guarda registros y artefactos en SQLite | test 15 |
| Privacidad | `engine/redact.js` oculta tokens, claves, JWT, passwords y URLs con credenciales | tests 1, 10, 17 |
| Panel | `panel/` muestra requisitos, debug, explicar, revisar y verificar | validación manual de la API |

## Demo

`demo-store/` es una tienda con errores sembrados a propósito; `demo-store-fixed/` es su versión corregida de referencia. Tras aprobar el requisito de descuentos, la versión con error reporta 3 PASS, 4 FAIL y 1 ERROR; la versión corregida llega a 8/8 PASS.

## Capa de agentes BoxLang (`agents/`)

`agents/suckless.bxs` define tres agentes (`RequirementsGate`, `DebugTriage`, `CodeReviewer`) y un orquestador `SuckLess` con `aiAgent()` / `aiTool()` de [bx-ai](https://github.com/ortus-boxlang/bx-ai). Las herramientas son envoltorios acotados sobre la CLI; los agentes no tienen herramienta de aprobación.

## Tecnología

- BoxLang
- BoxLang AI / BX Agents
- Node.js puro para el motor de prueba
- SQLite para historial
- Playwright opcional para pruebas ejecutables de UI cuando se desee ampliar el dominio

## Estructura

```text
agents/        Agentes BoxLang AI
config/        Configuración de BoxLang AI
engine/        Núcleo del proyecto: requisitos, runner, debug, explain, review, historial y reportes
kit/           Prompts y criterios reutilizables
demo-store/    Mini tienda con errores sembrados
demo-store-fixed/  Versión corregida
panel/         Servidor local + interfaz de evidencia
scripts/       Demo guiada
src/           Aplicación BoxLang del repositorio remoto
test/          Pruebas del motor
```

## Estado

MVP en desarrollo para el Hackathon ANIA × BoxLang AI, con un motor verificable funcionando por pruebas ejecutadas, y una capa de agentes que ayuda a clarificar, priorizar y describir, pero nunca reemplaza la evidencia.
>>>>>>> 32751f3 (Initial import of SuckLess project)
