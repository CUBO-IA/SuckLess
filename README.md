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
config/             Configuración del módulo bx-ai para OpenAI y Ollama
demo-store/         Mini tienda con fallos sembrados y sus checks
demo-store-fixed/   Referencia corregida para la comparación
docs/               Documentación de arquitectura
engine/             CLI y núcleo Node: requisitos, runner, debug y review
examples/           Requerimientos de ejemplo para la entrevista
kit/                Prompts y criterios de revisión del motor Node
panel/              Servidor local e interfaz de evidencias
prompts/            Prompt del Requirement Gate de BoxLang
schemas/             Esquema de respuesta estructurada de BoxLang AI
scripts/            Demo guiada
src/                Aplicación Requirement Gate de BoxLang
test/               Pruebas del motor Node
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
