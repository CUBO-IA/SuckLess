# SuckLess — Plan de Frontend UI/UX por etapas
**Para: agente de desarrollo (frontend)** · Hackathon ANIA × BoxLang AI · Reto 10
**Stack:** BoxLang SSR (plantillas) + HTML + CSS + JavaScript vanilla
**Estética:** Futuristic Cyberpunk / Sci-Fi Dashboard (ver sección 3)

---

## 0. Cómo usar este documento

Eres un agente de desarrollo encargado **únicamente del frontend**. Trabaja etapa por etapa, en orden, y no avances a la siguiente sin cumplir el **criterio de aceptación** de la actual. Al terminar cada etapa, entrega un resumen breve: qué hiciste, qué archivos tocaste, qué queda pendiente.

### 0.1 Alcance permitido y prohibido

**Puedes crear/modificar:**
- Plantillas SSR de BoxLang (`.bxm` / `.bxs`): layouts, vistas y parciales.
- `/assets/css`, `/assets/js`, `/assets/fonts`, `/assets/img`, `/vendor`.
- `/mock` (JSON simulados) y `/docs`.

**PROHIBIDO tocar:**
- Agentes `bx-ai`, ejecutor de Playwright, SQLite, rutas/handlers de backend, configuración del servidor.
- Si algo requiere backend: documéntalo en `docs/contrato-api.md` y simúlalo en `/mock`. **No lo implementes.**

### 0.2 Contexto del producto (resumen)

SuckLess es un flujo de IA que **aclara requisitos, investiga errores, ejecuta pruebas reales y entrega evidencia**. Principio rector: **"No adivinamos. Lo demostramos."**

Flujo: `ACLARAR → DIAGNOSTICAR → PROBAR → VERIFICAR`.

Seis módulos:
1. Panel Principal
2. Requirements Gate
3. Two Doors (Debug / Verify)
4. Test & Evidence Executor
5. Code Explainer & Code Review
6. Report History & Export

---

## 1. Reglas globales (innegociables)

### 1.1 Integridad de la evidencia (la más importante)
- El badge **PASS/FAIL** se pinta **solo** desde `run.status` y `check.status` devueltos por el ejecutor. Ningún texto de IA puede alterarlo.
- El texto de IA siempre va en un panel aparte etiquetado: **"Interpretación de la IA (no determina el resultado)"**.
- Una **hipótesis** nunca se presenta como causa confirmada. Etiqueta fija: `HIPÓTESIS · PENDIENTE DE PROBAR`.
- Un **parche** es una sugerencia de IA: `Recomendación de IA · requiere validación humana`. Nunca se aplica solo.
- El estado del requisito (`INCOMPLETO` / `LISTO PARA REVISAR` / `APROBADO`) **lo decide el backend**. El frontend solo lo muestra. No hay forma de llegar a `APROBADO` sin pasar por el modal de confirmación.
- **Datos de ejemplo:** mientras `USE_MOCK = true`, un indicador global visible dice **"MODO DEMO · DATOS DE EJEMPLO"** y cada resultado mock lleva la etiqueta "Dato de ejemplo". Nunca debe parecer evidencia real.

### 1.2 Seguridad en el cliente
- Logs, código, stack traces y respuestas de IA son **contenido no confiable**.
- Usa `textContent` / `createElement`. **Nunca `innerHTML` con datos de usuario, de IA o del proyecto.**
- En SSR, escapa toda salida dinámica con la función de encode de BoxLang.
- Advertencia en cliente al detectar patrones como `password=`, `api_key`, `secret`, `token`, `Bearer ` antes de enviar. Aviso permanente: *"Evita pegar secretos o credenciales"*.

### 1.3 Arquitectura técnica
- HTML semántico renderizado por BoxLang. JS vanilla con ES modules. **Sin frameworks SPA y sin paso de build obligatorio.**
- **Progressive enhancement:** las páginas cargan y navegan sin JS; el JS añade interactividad.
- **Capa de datos única** `assets/js/api.js` con `USE_MOCK = true|false`. Los módulos **solo** llaman a esa capa. Conectar el backend = cambiar la bandera y ajustar rutas.
- Librerías de terceros (resaltado de sintaxis, etc.) **vendorizadas localmente** en `/vendor`. Sin CDN. La demo debe funcionar **offline**.
- CSS con **variables (tokens)**, sin build. Si el equipo ya usa Tailwind, se reutiliza el mismo set de tokens.
- Separación estricta: lógica (`/assets/js/modules`), componentes visuales (`/assets/css/components`), tema (`tokens.css`).
- Evita duplicar CSS y estilos inline innecesarios.

### 1.4 Accesibilidad (WCAG AA)
- Navegación completa por teclado; foco visible en cian.
- Etiquetas accesibles en todos los formularios.
- Estados de error/éxito **nunca solo por color**: siempre color + ícono + texto (✓ OK, ✗ FALLA, ⚠ ADVERTENCIA).
- `aria-live="polite"` en actualizaciones dinámicas (checks en vivo, toasts).
- Modales con focus trap, `Esc` para cerrar y retorno de foco.
- Objetivos táctiles ≥ 44×44 px.
- Respetar `prefers-reduced-motion` (desactivar partículas y reducir animaciones).

### 1.5 Responsive
- **Mobile-first**, contenedor máximo 1280 px (`max-w-7xl`).
- Grids de 1, 2, 3 o 4 columnas según resolución.
- Sin desplazamiento horizontal no intencional. Tablas y navegación se adaptan a pantallas pequeñas (tabla → tarjetas apiladas; nav → menú colapsable).
- Verificar en 1440 / 768 / 390 px.

---

## 2. Estructura de archivos sugerida

```
/views/layouts/base.bxm
/views/partials/{nav,badge,toast,modal,empty-state,kpi-card,demo-banner}.bxm
/views/{dashboard,requirements,two-doors,executor,code,history}.bxm
/views/ui-kit.bxm                      (solo desarrollo)
/assets/css/tokens.css
/assets/css/base.css
/assets/css/components/{card,button,badge,kpi,nav,table,tabs,accordion,modal,toast,form,dropzone,skeleton,progress}.css
/assets/css/modules/{dashboard,requirements,two-doors,executor,code,history}.css
/assets/js/api.js
/assets/js/store.js
/assets/js/ui/{modal,toast,tabs,accordion,clipboard,dropzone,particles,secrets-check}.js
/assets/js/modules/{dashboard,requirements,two-doors,executor,code,history}.js
/assets/fonts/                         (Orbitron, Space Grotesk, JetBrains Mono, .woff2)
/vendor/                               (resaltador de sintaxis local)
/mock/*.json
/docs/{contrato-api.md,guia-ui.md,conexion-backend.md}
```

---

## 3. Sistema de diseño — Futuristic Cyberpunk Dashboard

**Objetivo estético:** dashboard tecnológico profesional, oscuro, con acentos luminosos **controlados**. Evitar apariencia de videojuego saturada. Transmite: precisión, monitoreo en tiempo real, claridad técnica.

### 3.1 Paleta obligatoria (`tokens.css`)

```css
:root {
  /* Fondos */
  --bg-main:      #030712;
  --bg-card:      #0A0F1E;
  --bg-elevated:  #111827;
  --border:       #1F2937;

  /* Texto */
  --text-primary:   #F8FAFC;
  --text-secondary: #94A3B8;
  --text-muted:     #64748B;

  /* Acentos de marca */
  --cyan:          #06B6D4;
  --cyan-bright:   #22D3EE;
  --magenta:       #D946EF;
  --magenta-bright:#E879F9;

  /* Semánticos (SOLO estados) */
  --warn: #F59E0B;
  --fail: #EF4444;
  --ok:   #22C55E;

  /* Fuentes */
  --font-display: 'Orbitron', system-ui, sans-serif;
  --font-body:    'Space Grotesk', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  /* Forma y movimiento */
  --radius: 12px;
  --space-card: 24px;          /* hasta 32px en tarjetas grandes */
  --t-fast: 200ms;
  --t-slow: 400ms;
  --container: 1280px;
}
```

### 3.2 Reglas de uso del color
| Color | Uso |
|---|---|
| **Cian** | Color principal de interacción: enlaces, foco, tab activa, nav activa |
| **Magenta** | Acento complementario (gradientes, decoración). **Nunca** indica estado |
| **Verde** | OK / PASS / APROBADO / criterio cumplido |
| **Rojo** | FALLA / FAIL / severidad ALTA / error |
| **Ámbar** | Advertencia / INCOMPLETO / hipótesis pendiente / severidad MEDIA |

> **Regla crítica:** cian y magenta son colores de marca, **nunca** se usan para indicar PASS/FAIL. Así, el color de un resultado solo puede venir del ejecutor.

Mapa de severidad: **ALTA = rojo**, **MEDIA = ámbar**, **BAJA = cian** (informativo, no es un resultado de prueba).

### 3.3 Tipografías (alojadas localmente)
- **Orbitron** (700–800): encabezados, títulos, KPI, botones destacados. Mayúsculas y neón permitidos en títulos.
- **Space Grotesk** (400–500): cuerpo, descripciones, formularios.
- **JetBrains Mono**: datos técnicos, etiquetas, navegación, IDs, timestamps, logs, código, mensajes de sistema.

La guía pide Google Fonts. **Para que la demo funcione offline**, descarga los `.woff2` y sírvelos con `@font-face`, `font-display: swap` y respaldo de fuentes del sistema. El resultado visual es idéntico.

### 3.4 Componentes base

**Tarjetas:** fondo `--bg-card` con gradiente discreto, borde 1 px `--border`, radio 12 px, padding 24–32 px. Hover: `translateY(-4px)`, borde cian y sombra luminosa (`box-shadow: 0 0 24px rgba(6,182,212,.25)`).

**Botones**
- Primario: gradiente cian → magenta, texto Orbitron.
- Secundario: transparente, borde discreto, hover con borde cian.
- Peligro: borde/relleno rojo, con ícono.
- Estados diferenciados: hover, focus (anillo cian), active, disabled. Transiciones 200–400 ms.

**KPI:** número grande en Orbitron, etiqueta pequeña en JetBrains Mono, color semántico según estado, grid responsivo.

**Navegación:** barra superior fija (o lateral), fondo semitransparente + `backdrop-filter: blur(12px)`, ítem activo en cian.

**Tablas:** superficie oscura, separadores discretos, encabezados diferenciados (mono, mayúsculas, `--text-secondary`), tooltips legibles.

**Badges de estado** (siempre ícono + texto + color):
`INCOMPLETO` (ámbar) · `LISTO PARA REVISAR` (cian) · `APROBADO` (verde) · `PASS` (verde ✓) · `FAIL` (rojo ✗) · `EN COLA` (gris) · `EJECUTANDO` (cian, giratorio) · `ERROR DEL EJECUTOR` (rojo ⚠) · `ALTA/MEDIA/BAJA`.

### 3.5 Efectos y animación (moderados)
- Neón (`text-shadow`) solo en títulos principales y elementos clave.
- Aparición progresiva de secciones (fade-in + slide-up, con `IntersectionObserver`).
- Microinteracciones en botones y tarjetas.
- Barras de progreso animadas.
- Elementos geométricos decorativos (líneas, esquinas con corte, rejillas tenues).
- **Canvas de partículas** sutil en el fondo: pocas partículas, baja opacidad, pausa si la pestaña no está visible y **desactivado con `prefers-reduced-motion`**.

### 3.6 Zonas "limpias" (sin efectos)
Para garantizar legibilidad, en **visor de código, visor de trazas, logs y textareas de entrada** usa fondo sólido `--bg-card`, **sin glow, sin gradientes y sin animación**.

### 3.7 Contraste
- `--text-muted` (#64748B) solo en texto secundario grande o decorativo. **Verificar** ≥ 4,5:1 sobre `--bg-card` y `--bg-elevated` antes de usarlo en texto pequeño; si no llega, usar `--text-secondary`.
- Los brillos neón no pueden reducir el contraste del texto adyacente.

### 3.8 Tema de resaltado de sintaxis propio
Sobre `--bg-card`: palabras clave **cian**, funciones **magenta**, cadenas **ámbar**, comentarios **gris (`--text-muted`) o verde tenue**, números **cian brillante**. Verificar contraste AA.

---

## 4. Plan por etapas

### Resumen

| Etapa | Contenido | Horas aprox. | Depende de |
|---|---|---|---|
| 0 | Contratos, mocks y `api.js` | 0,5 | — |
| 1 | Sistema de diseño y layout base | 2 | 0 |
| 2 | Panel Principal | 1,5 | 1 |
| 3 | Two Doors | 2 | 1 |
| 4 | Requirements Gate | 3 | 1 |
| 5 | Test & Evidence Executor | 3 | 1 |
| 6 | Code Explainer & Review | 3 | 1 |
| 7 | Report History & Export | 2 | 1 |
| 8 | Integración, pulido y entrega | 2,5 | Todas |

**Prioridad si el tiempo aprieta (según P0 del PDF):** 4 → 3 → 5 → 6 → 2 → 7. El historial es bonus.
Las etapas 3 a 7 pueden ir en paralelo.

---

### ETAPA 0 — Contratos y andamiaje (≈ 0,5 h)

**Objetivo:** desacoplar el frontend del backend pendiente.

**Entregables**
1. `docs/contrato-api.md` con endpoints propuestos y ejemplos JSON (ver sección 5).
2. Archivos `/mock/*.json` para cada endpoint, **incluyendo casos de error**: timeout, 500, respuesta vacía, JSON inválido.
3. `assets/js/api.js`:
   - `USE_MOCK = true`.
   - `fetch` envuelto con timeout, errores uniformes y estados `loading / error / empty`.
   - Función de polling aislada (para poder cambiarla sin tocar la UI).
4. Simulación de latencia en mock (300–1200 ms) para ver los estados de carga.

**Criterio de aceptación:** cada módulo se puede desarrollar y probar sin backend.

---

### ETAPA 1 — Sistema de diseño y layout base (≈ 2 h)

**Objetivo:** identidad Cyberpunk coherente y componentes reutilizables.

**Entregables**
- `tokens.css` (sección 3.1), `@font-face` locales, `base.css` (reset, tipografía, foco visible en cian).
- Componentes (sección 3.4): botones, badges, tarjetas, KPI, tabs, acordeón, modal accesible, toasts, skeletons, estado vacío, barra de progreso, tabla, dropzone.
- `base.bxm`:
  - Header fijo con logo **SUCKLESS** (Orbitron + neón), navegación a los 6 módulos, backdrop blur.
  - Banner/indicador global **"MODO DEMO · DATOS DE EJEMPLO"** (visible mientras `USE_MOCK = true`).
  - Slot de contenido, contenedor 1280 px.
  - Fondo con canvas de partículas sutil (`particles.js`), con pausa y desactivación por `prefers-reduced-motion`.
- Animaciones de entrada (fade-in / slide-up) reutilizables mediante una clase utilitaria.
- Página `/ui-kit` (solo desarrollo) con todos los componentes en todos sus estados.

**Criterio de aceptación:** contraste AA verificado, navegación por teclado completa, componentes independientes entre sí, `prefers-reduced-motion` funcionando, sin scroll horizontal en 390 px.

---

### ETAPA 2 — Panel Principal (≈ 1,5 h)

**Objetivo:** punto de entrada que comunica el flujo `ACLARAR → DIAGNOSTICAR → PROBAR → VERIFICAR`.

**Contenido**
- **Hero:** "Menos frustración. Más soluciones comprobadas." en Orbitron con neón moderado + subtítulo + CTA primario hacia **Two Doors**.
- **Stepper del flujo** de 4 pasos con el estado del trabajo en curso.
- **Grid de KPI** (1/2/4 columnas): requisitos aprobados, checks OK, checks FALLA, hallazgos abiertos por severidad. Números en Orbitron, etiquetas en JetBrains Mono, color semántico.
- **Accesos rápidos** a los 6 módulos (tarjetas con descripción de una línea).
- Tarjetas de resumen: último requisito (estado), última ejecución (PASS/FAIL + tiempos), últimos 5 elementos del historial.

**Estados:** primera visita sin datos (vacío orientativo), cargando (skeletons), error **por tarjeta** (una tarjeta caída no tumba el panel).

**Criterio de aceptación:** SSR entrega el panel completo sin JS; el JS solo refresca las tarjetas de resumen.

---

### ETAPA 3 — Módulo "Two Doors" (≈ 2 h)

**Objetivo:** elegir el modo y capturar la entrada correcta.

**SSR (BoxLang):** layout con dos "puertas" grandes tipo tarjeta:
- **A / Modo Debug — "Ya tengo un error"** (log · stack trace · código).
- **B / Modo Verify — "Quiero probar mi app"** (requisito · criterios · app).

**Cliente (HTML/CSS/JS)**
- Selector de pestañas (`role="tablist"`), selección persistida en la URL (`?mode=debug|verify`).
- **Formulario dinámico por modo**
  - *Debug:* textarea para stack trace/log (fuente mono, fondo limpio), zona **drag-and-drop** (`.log`, `.txt`, `.js`, `.bx`, `.bxm`, `.json`) y campo opcional de archivos del proyecto.
  - *Verify:* selector del requisito **aprobado** + URL/identificador de la app demo. **Si no hay requisito aprobado:** bloqueo visible con enlace al Requirements Gate.
- **Dropzone:** estados hover / aceptado / rechazado; lista de archivos con nombre, tamaño y botón quitar; **validación de tipo y tamaño en cliente** (aviso: "el servidor volverá a validar"); alternativa accesible con `<input type="file">` y teclado.
- Aviso de privacidad y detección de secretos (regla 1.2).
- Botón **"Analizar"** con estado de carga, cancelación y manejo de error.
- **Resultado Debug:** resumen del fallo + lista **ordenada de hipótesis**, cada una con etiqueta `HIPÓTESIS · PENDIENTE DE PROBAR` (ámbar), archivo/líneas citados y botón **"Reproducir con prueba"** que lleva al Executor.

**Criterio de aceptación:** cambiar de pestaña no pierde lo escrito; la UI nunca presenta una hipótesis como causa confirmada.

---

### ETAPA 4 — Requirements Gate (≈ 3 h) · **P0**

**Objetivo:** que ningún requisito avance sin preguntas respondidas y aprobación humana.

**Pantalla en 3 zonas**
1. **Entrada:** textarea para el requisito en lenguaje natural, ejemplo precargable (*"El carrito debe aplicar descuentos"*) y botón "Analizar".
2. **Lista de verificación interactiva** de preguntas del agente:
   - Cada pregunta: categoría (regla de negocio, excepción, datos), campo de respuesta, marca de "respondida".
   - Barra de progreso (n/total) y filtro "solo pendientes".
   - Botón **"Reanalizar"** (puede generar nuevas preguntas).
3. **Documento estructurado en vivo:** Objetivo, Actor, Comportamiento esperado, Entradas, Reglas, Errores posibles, **Criterios de Aceptación**, **Casos Límite**.
   - **Campos obligatorios:** Objetivo, Criterios de Aceptación, Casos Límite → indicador ✓/✗ de completitud; bloquean la aprobación si faltan.
   - Los demás son opcionales y se muestran con indicador de completitud.

**Máquina de estados visual:** `INCOMPLETO` (ámbar) → `LISTO PARA REVISAR` (cian) → `APROBADO` (verde). Badge siempre visible, **sin saltos**. El frontend muestra solo el estado que devuelve el backend.

**Aprobación**
- Botón **"Aprobar Requisitos"** deshabilitado hasta `LISTO PARA REVISAR`.
- Abre **modal de confirmación**: resumen del documento, criterios en lista y checkbox *"Revisé y confirmo"*.
- Tras aprobar: toast, estado `APROBADO`, documento en solo lectura (opción "Reabrir") y CTA **"Ir a verificar"**.

**Estados límite:** JSON de IA inválido o vacío (mensaje claro + reintento), pérdida de conexión (borradores en `sessionStorage`), error al aprobar.

**Criterio de aceptación:** no existe ningún camino en la UI para llegar a `APROBADO` sin pasar por el modal.

---

### ETAPA 5 — Test & Evidence Executor (≈ 3 h) · **P0**

**Objetivo:** mostrar resultados reales de pruebas de forma clara y verificable.

**Cabecera de ejecución:** id de corrida, requisito asociado, botón "Ejecutar", estado global (`EN COLA`, `EJECUTANDO`, `PASS`, `FAIL`, `ERROR DEL EJECUTOR`) y duración total.

**Lista de comprobaciones en vivo (polling)**
- Se consulta `GET /api/executor/run/{id}` cada **1–1,5 s** mientras el estado sea `EN COLA` o `EJECUTANDO`; se detiene en `PASS`, `FAIL` o `ERROR DEL EJECUTOR`. Límite de 2 minutos y botón cancelar.
- Cada respuesta trae el `status` global y **todos** los `checks[]` acumulados (el frontend no depende de eventos intermedios).
- Fila por check: ícono + color (verde ✓ OK, rojo ✗ FALLA, gris pendiente, giratorio ejecutando), nombre, tiempo en ms, botón "ver detalle".
- Región `aria-live="polite"`.
- Contadores `n OK / n FALLA` y filtro "solo fallas".
- La lógica de polling vive solo en `api.js` (permite cambiar a SSE sin tocar la UI).

**Visor de trazas y capturas** (zona limpia, sin efectos)
- **Capturas:** galería con miniaturas, lightbox, zoom, navegación por teclado, etiqueta del check al que pertenecen.
- **Traza:** línea de tiempo de pasos (acción, selector, duración, error) con el paso fallido destacado y enlace/descarga del archivo de traza de Playwright. **No se reimplementa el Trace Viewer.**
- Mensaje de error y pasos para reproducir, con botón copiar.

**Procedencia:** cada check lleva el rótulo *"Resultado producido por el ejecutor de pruebas"*. En mock cambia a *"Dato de ejemplo"* con estilo distinto.

**Panel de IA separado:** *"Interpretación de la IA (no determina el resultado)"*.

Botón **"Enviar a reporte/historial"**.

**Criterio de aceptación:** una ejecución con 1 check fallido **nunca** muestra el estado global como PASS, aunque el texto de IA lo describa como correcto. Color y badge dependen solo de `check.status` y `run.status`.

---

### ETAPA 6 — Code Explainer & Code Review (≈ 3 h) · **P0**

**Objetivo:** leer código real y presentar hallazgos accionables.

**Layout de dos paneles**
- **Izquierda — Code Viewer:** árbol de archivos del proyecto demo (solo lectura), resaltado de sintaxis local con el tema de la sección 3.8, números de línea, **resaltado de rangos citados**, búsqueda en archivo y botón copiar. Fondo limpio.
- **Derecha — resultados con tabs:** *Explicar* y *Revisar*.

**Explicar:** campo "¿Qué quieres entender?" o selección de función. Muestra el flujo en pasos con **referencias `archivo:línea` clicables** que saltan y resaltan en el visor.

**Revisar**
- Resumen: contadores por severidad (Alta/Media/Baja) y por categoría (Lógica, Seguridad, Calidad) en estilo KPI.
- **Tarjetas desplegables** (acordeón accesible) por hallazgo: severidad (color + texto + ícono), categoría, ubicación, evidencia, impacto posible, **recomendación concreta** y bloque de parche.
- **Parche:** `patch.format = "diff"` → líneas `+` en verde y `-` en rojo **con símbolo visible, no solo color**; `"text"` o vacío → código plano. Botón **"Copiar parche"** copia `patch.content` tal cual, con feedback "Copiado ✓" y fallback si falla el portapapeles. Sin parche, la tarjeta sigue mostrando la recomendación.
- Filtros por severidad y categoría; orden por severidad.
- Etiquetas: *"Recomendación de IA · requiere validación humana"* y distinción **"Hallazgo demostrado"** (con prueba asociada) vs **"Sugerencia"**.
- Acción "Guardar en historial".

**Criterio de aceptación:** el código se inserta siempre como texto, nunca como HTML. Un hallazgo sin `file/lines` se muestra igual sin romper el visor.

---

### ETAPA 7 — Report History & Export (≈ 2 h) · bonus

**Objetivo:** recuperar y gestionar análisis previos sin recargar la página.

**Tabla/grid interactiva**
- Columnas: tipo (`DEBUG`, `REVIEW`, `EXPLAIN`, `VERIFY`), título, estado/resultado, fecha (mono), acciones. En móvil, tarjetas apiladas.
- **Filtro por tipo** con chips multi-selección, búsqueda de texto, orden por fecha, paginación simple.
- **Abrir:** detalle (resumen, hallazgos, archivos referenciados, evidencia) en panel lateral o modal.
- **Exportar:** descarga del reporte `.md` desde el endpoint, con indicador de progreso.
- **Borrar:** modal de confirmación (*"Se eliminarán el registro y sus datos asociados"*), `DELETE` por `fetch`, actualización de la vista **sin recarga**.
  - Opcional: eliminación optimista con rollback y toast de error.
  - Foco accesible tras borrar. "Deshacer" solo si el backend lo soporta; si no, no se ofrece.
- Estados: vacío ("Aún no hay análisis"), sin resultados del filtro, cargando, error.
- Filtros sincronizados con la URL (`?type=REVIEW`).

**Criterio de aceptación:** filtrar y borrar no recargan la página; contador y grid quedan consistentes.

---

### ETAPA 8 — Integración, pulido y entrega (≈ 2,5 h)

- **Flujo completo navegable de punta a punta:** requisito vago → preguntas → aprobación → debug → ejecución → review → historial.
- Consistencia de textos, badges, vacíos, errores y tiempos de carga.
- **Auditoría:** Lighthouse accesibilidad ≥ 90, teclado, lector de pantalla básico, 3 anchos (1440 / 768 / 390), rendimiento del canvas (sin caídas visibles de FPS).
- **Resiliencia:** pantalla amigable cuando el backend no responde, con opción **"Usar resultados guardados"** (plan B: resultados auténticos de una ejecución previa, **siempre etiquetados como tal**).
- Retirar/desactivar `/ui-kit`.
- Documentación: `docs/guia-ui.md` (tokens, componentes, convenciones) y `docs/conexion-backend.md` (checklist: endpoints a cambiar, cómo apagar `USE_MOCK`).

---

## 5. Contrato de API propuesto (para mocks y para el ingeniero de backend)

```
POST   /api/requirements/analyze
       → { status, questions:[{id,text,category,answered,answer}],
           missingFields:[], document:{objective,actor,behavior,inputs,rules,errors,acceptanceCriteria,edgeCases} }
POST   /api/requirements/approve
POST   /api/debug/analyze
       → { summary, hypotheses:[{id,text,file,lines,evidence,status:"pending"}] }
POST   /api/executor/run
GET    /api/executor/run/{id}
       → { id, status, durationMs,
           checks:[{name,status,durationMs,error?}],
           trace:{steps:[{action,selector,durationMs,error?}], downloadUrl},
           screenshots:[{checkName,url}],
           aiInterpretation? }
POST   /api/code/explain
       → { steps:[{text,file,lines}] }
POST   /api/code/review
       → { findings:[{id,severity:"ALTA|MEDIA|BAJA",category:"LOGICA|SEGURIDAD|CALIDAD",
           file,lines,evidence,impact,recommendation,
           patch:{format:"diff|text",language,content}, proven:boolean}] }
GET    /api/history?type=
GET    /api/history/{id}
DELETE /api/history/{id}
GET    /api/history/{id}/export        (devuelve .md)
```

### Decisiones ya tomadas
- **Ejecución en vivo:** polling cada 1–1,5 s sobre `GET /api/executor/run/{id}`. Cambiar a SSE solo implica modificar `api.js`.
- **Parche:** `{format:"diff"|"text", language, content}`; legible y copiable, no necesita ser aplicable.
- **Fuentes:** locales (`@font-face`), mismo resultado visual que Google Fonts, funciona offline.
- **CSS:** variables/tokens sin build.

---

## 6. Definición de "hecho" (checklist final)

- [ ] Paleta y las tres tipografías aplicadas fielmente en todas las páginas.
- [ ] Tarjetas oscuras con borde 1 px, radio 12 px y hover −4 px con brillo cian.
- [ ] Botón primario con gradiente cian–magenta; estados hover/focus/active/disabled.
- [ ] Navegación con backdrop blur y activo en cian.
- [ ] Cian/magenta **nunca** usados para PASS/FAIL.
- [ ] PASS/FAIL derivado solo del ejecutor; texto de IA en panel separado.
- [ ] Ningún camino a `APROBADO` sin modal de confirmación.
- [ ] Hipótesis siempre etiquetadas como pendientes.
- [ ] Indicador "MODO DEMO · DATOS DE EJEMPLO" visible con `USE_MOCK = true`.
- [ ] Sin `innerHTML` con datos externos; escape en SSR.
- [ ] Sin dependencias de CDN; funciona offline.
- [ ] Funciona sin JS en lo esencial (SSR); JS añade interactividad.
- [ ] Responsive 1440 / 768 / 390 sin scroll horizontal.
- [ ] Lighthouse accesibilidad ≥ 90; foco visible; `aria-live` en vivo.
- [ ] `prefers-reduced-motion` respetado (partículas incluidas).
- [ ] No se tocó ningún archivo de backend.
- [ ] Documentación de conexión con backend entregada.
