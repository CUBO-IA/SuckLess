# Arquitectura de SuckLess

## Objetivo del MVP

Convertir un requerimiento incompleto en una especificación aprobada y verificable.

## Flujo

1. El usuario introduce un requerimiento en texto libre.
2. BoxLang AI evalúa el requerimiento usando una salida estructurada.
3. SuckLess presenta las preguntas prioritarias.
4. Las respuestas se incorporan como información confirmada.
5. El requerimiento se reevalúa.
6. Una regla determinista controla si puede pasar a desarrollo.
7. El resultado se exporta como Markdown.

## Responsabilidades

### Inteligencia artificial

- Interpretar lenguaje natural.
- Detectar ambigüedades y contradicciones.
- Formular preguntas contextuales.
- Redactar el requerimiento normalizado.
- Proponer criterios de aceptación.

### Código tradicional

- Mantener estados y rondas de entrevista.
- Aplicar el puntaje mínimo.
- Exigir criterios de aceptación.
- Guardar el reporte.
- Evitar ciclos infinitos.

## Próxima integración

El siguiente componente será una herramienta `aiTool()` que ejecutará pruebas permitidas sobre una aplicación demo aislada y devolverá resultados JSON. El PASS/FAIL siempre procederá del ejecutor, no del modelo.
