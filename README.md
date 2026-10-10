# SuckLess

**Menos frustración. Más soluciones comprobadas.**

SuckLess es un agente construido con BoxLang AI que transforma requerimientos incompletos en especificaciones verificables. Detecta información faltante o ambigua, formula preguntas concretas, genera criterios de aceptación y conecta esos criterios con pruebas ejecutables.

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

## Tecnología

- BoxLang
- BoxLang AI / BX Agents
- Playwright para pruebas ejecutables

## Inicio rápido

### Requisitos

- BoxLang 1.18 o posterior.
- Una API key de OpenAI.

### Instalación

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

1. Instala Ollama en macOS desde <https://ollama.com/download/mac>.
2. Descarga el modelo recomendado para este proyecto:

```bash
ollama pull qwen3:4b
```

3. Comprueba que Ollama esté activo:

```bash
ollama list
```

4. Ejecuta SuckLess con la configuración local:

```bash
boxlang --bx-config config/boxlang.ollama.json src/SuckLess.bxs
```

La primera descarga ocupa aproximadamente 2.5 GB. Si el equipo tiene poca
memoria, cambia `qwen3:4b` por `qwen3:1.7b` en
`config/boxlang.ollama.json` y descarga ese modelo en su lugar.

La aplicación entrevista al usuario hasta completar el requerimiento y guarda el resultado en `output/`.

## Estructura

```text
config/       Configuración de BoxLang AI
docs/         Arquitectura y decisiones del proyecto
examples/     Requerimientos para la demostración
prompts/      Instrucciones reutilizables del agente
schemas/      Contrato estructurado de evaluación
src/          Aplicación BoxLang
```

## Estado

MVP en desarrollo para el Hackathon ANIA × BoxLang AI.
