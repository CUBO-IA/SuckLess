# Arquitectura de SuckLess

## Vista general

El repositorio contiene dos aplicaciones relacionadas:

- El **Requirement Gate** en `src/SuckLess.bxs` usa BoxLang AI para entrevistar a la persona responsable, evaluar completitud y producir un reporte Markdown. Su configuración y recursos están en `config/`, `prompts/` y `schemas/`.
- El **motor de evidencia** en `engine/` implementa el ciclo de requisitos, análisis de código, ejecución de checks, historial y reportes. La CLI y el panel (`panel/`) son interfaces para este motor.
- La capa experimental `agents/` define agentes bx-ai que invocan la CLI del motor con una lista de operaciones permitidas. Sus instrucciones están en `kit/prompts/`.

Las dos aplicaciones comparten el objetivo de mejorar requisitos y decisiones de desarrollo, pero tienen puntos de entrada y dependencias distintos. `prompts/` pertenece al Requirement Gate; `kit/prompts/` pertenece a los agentes del motor Node.

## Flujo del Requirement Gate

1. La persona introduce un requerimiento en texto libre.
2. BoxLang AI evalúa claridad, faltantes, ambigüedades, contradicciones y criterios de aceptación usando una respuesta estructurada (`schemas/`).
3. La aplicación presenta preguntas priorizadas y registra respuestas.
4. El requerimiento se reevalúa con el historial de la entrevista.
5. Una regla tradicional aplica las condiciones para marcarlo listo para desarrollo.
6. El resultado se guarda como Markdown en `output/`.

La IA interpreta lenguaje natural y propone contenido. El código mantiene el flujo de entrevista, evita preguntas repetidas y aplica el gate de calidad.

## Flujo del motor de evidencia

1. `engine/requirements.js` registra el requisito y determina los datos o decisiones pendientes.
2. La aprobación del requisito la realiza una persona por la CLI o el panel. La capa de agentes no ofrece una herramienta para aprobar.
3. `engine/runner.js` ejecuta los checks permitidos en un proceso hijo, con límite de tiempo y entorno acotado.
4. `engine/debug.js`, `engine/explain.js` y `engine/review.js` aportan evidencia estática y diagnósticos relacionados con los checks.
5. `engine/history.js` conserva el historial y `engine/report.js` produce reportes.

El PASS/FAIL procede del ejecutor de checks, no de una respuesta del modelo. Los hallazgos estáticos se presentan como potenciales salvo que una prueba ejecutada demuestre el mismo problema.

## Demo y pruebas

`demo-store/` contiene la mini tienda con errores deliberados y sus checks; `demo-store-fixed/` es la referencia corregida. `test/` valida el motor Node y `scripts/demo.mjs` guía la comparación antes/después.

El alcance de los checks incluidos se centra en descuentos y cupones. El runner usa Node y `node:assert`; Playwright no forma parte de las dependencias actuales.

## Límites y estado

- El panel está diseñado para uso local, no multiusuario.
- El MVP no aplica parches automáticamente.
- El Requirement Gate BoxLang se ejecuta con la configuración de `config/` y requiere BoxLang más bx-ai.
- `agents/` está escrito contra la API documentada de bx-ai, pero debe validarse en el runtime BoxLang objetivo antes de considerarse una integración estable.
