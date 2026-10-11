# Criterios de revisión de SuckLess

| Regla | Categoría | Severidad base | Qué busca |
|---|---|---|---|
| acceso-sin-proteccion | lógica | alta si hay un productor del estado incompleto, si no baja | `param.prop.método()` sin validar la forma |
| carga-devuelve-objeto-vacio | lógica | alta | `load*/get*` que devuelve `{}` |
| serializacion-parcial | lógica | alta | `save*` que no escribe todas las claves del estado |
| expiracion-ignorada | lógica | alta | `expires` definido y nunca leído |
| porcentaje-sin-calcular | lógica | alta | rama `percent` que devuelve el valor crudo |
| cupones-sin-regla | lógica | media | `coupons.push` sin regla de combinación |
| cantidad-sin-validar | lógica | media | `qty` sin comprobar entero ≥ 1 |
| dinero-sin-redondeo | calidad | media | aritmética monetaria sin redondeo |
| json-parse-sin-try | seguridad | media | `JSON.parse` sin `try` |
| cuerpo-sin-limite | seguridad | media | cuerpo HTTP acumulado sin tamaño máximo |
| ejecucion-dinamica | seguridad | alta | `eval`, `new Function`, `exec` con plantilla |

Estados: **potencial** (regla estática) y **demostrado** (una prueba ejecutada con la misma etiqueta falla).
Para añadir una regla: agrega un bloque en `engine/review.js`, una fila aquí y una prueba en `test/engine.test.js`.
