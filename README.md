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
