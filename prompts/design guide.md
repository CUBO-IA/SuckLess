# Instrucciones de diseño UI/UX — Futuristic Cyberpunk Dashboard

## Objetivo

Desarrollar una interfaz web moderna, profesional y responsiva, utilizando un sistema de diseño **Futuristic Cyberpunk / Sci-Fi Dashboard**, inspirado en interfaces de monitoreo tecnológico, analítica avanzada y sistemas de inteligencia artificial.

El objetivo es reproducir fielmente la identidad visual del diseño de referencia, pero adaptando la arquitectura de información, los componentes y las funcionalidades al nuevo proyecto.

## 1. Identidad visual

La interfaz debe transmitir:

- Tecnología avanzada y precisión.
- Sofisticación visual.
- Entorno de monitoreo en tiempo real.
- Claridad en la presentación de información técnica.
- Estética futurista con iluminación neón controlada.

El diseño debe ser predominantemente oscuro, con superficies diferenciadas, acentos luminosos y abundante espacio entre componentes.

Evitar una estética de videojuegos excesivamente saturada. Priorizar una apariencia de dashboard tecnológico profesional.

## 2. Paleta cromática obligatoria

**Fondos**
- Principal: `#030712`
- Tarjetas: `#0A0F1E`
- Superficies elevadas: `#111827`
- Bordes: `#1F2937`

**Tipografía**
- Texto principal: `#F8FAFC`
- Texto secundario: `#94A3B8`
- Texto atenuado: `#64748B`

**Acentos**
- Cian principal: `#06B6D4`
- Cian brillante: `#22D3EE`
- Magenta principal: `#D946EF`
- Magenta brillante: `#E879F9`
- Ámbar: `#F59E0B`
- Rojo: `#EF4444`
- Verde: `#22C55E`

Utilizar cian como color principal de interacción. Magenta debe funcionar como acento complementario.

Reservar ámbar, rojo y verde para indicadores semánticos, advertencias y estados operativos.

## 3. Tipografías obligatorias

Utilizar Google Fonts:

1. **Orbitron:** encabezados, títulos principales, indicadores KPI y botones destacados.
2. **Space Grotesk:** cuerpo del contenido, descripciones, formularios y textos generales.
3. **JetBrains Mono:** datos técnicos, etiquetas, navegación, identificadores, timestamps y mensajes de sistema.

Utilizar títulos con pesos 700–800 y texto general con pesos 400–500.

Los títulos destacados pueden emplear mayúsculas y efectos de iluminación.

## 4. Componentes visuales

**Tarjetas**
- Fondos oscuros con gradientes discretos.
- Bordes de 1 px.
- Radio de 12 px.
- Hover con desplazamiento vertical de −4 px.
- Borde cian y sombra luminosa durante la interacción.

**Botones**
- Primarios con gradiente cian-magenta.
- Secundarios transparentes con bordes discretos.
- Transiciones suaves de 200–400 ms.
- Estados hover, focus, active y disabled diferenciados.

**Indicadores KPI**
- Números grandes en Orbitron.
- Etiquetas pequeñas en JetBrains Mono.
- Colores semánticos según el estado.
- Distribución en cuadrículas responsivas.

**Navegación**
- Barra superior fija o navegación lateral, según el proyecto.
- Fondo oscuro semitransparente.
- Efecto backdrop blur.
- Estados activos resaltados en cian.

**Tablas y gráficos**
- Superficies oscuras.
- Separadores discretos.
- Encabezados claramente diferenciados.
- Colores de visualización coherentes con la paleta.
- Tooltips y estados interactivos legibles.

## 5. Efectos y animaciones

Implementar de manera moderada:

- Neon glow en títulos y elementos importantes.
- Gradientes cian-magenta.
- Aparición progresiva de secciones.
- Animaciones slide-up y fade-in.
- Microinteracciones en botones y tarjetas.
- Indicadores de progreso animados.
- Elementos geométricos decorativos.
- Fondo Canvas con partículas sutiles cuando sea apropiado.

Evitar animaciones excesivas que dificulten la lectura o reduzcan el rendimiento.

Respetar `prefers-reduced-motion`.

## 6. Layout y responsive design

- Diseño mobile-first.
- Contenedor principal equivalente a `max-w-7xl` (1280 px).
- Separación amplia entre secciones.
- Grid de 1, 2, 3 o 4 columnas según resolución.
- Tarjetas con padding habitual de 24–32 px.
- Jerarquía visual consistente.
- Evitar desplazamiento horizontal no intencional.
- Adaptar tablas y navegación a pantallas pequeñas.

## 7. Requisitos de accesibilidad

- Contraste adecuado para textos y controles.
- Navegación por teclado.
- Indicadores de foco visibles en cian.
- Etiquetas accesibles en formularios.
- Componentes semánticos.
- Estados de error y éxito que no dependan exclusivamente del color.
- Objetivos táctiles suficientemente grandes.
- Compatibilidad con lectores de pantalla.

## 8. Requisitos de implementación

Utilizar el framework y la arquitectura existentes en el proyecto. Si no hay restricciones, Tailwind CSS es una opción preferente.

Centralizar los colores, tipografías, espaciados y estilos compartidos en tokens reutilizables.

Crear componentes reutilizables para tarjetas, botones, indicadores, encabezados, tablas y estados.

Evitar duplicación de CSS y estilos inline innecesarios.

Mantener separación entre lógica de negocio, componentes visuales y configuración del tema.

## 9. Criterios de aceptación

La implementación debe:

1. Mantener fielmente la paleta y las tres tipografías.
2. Reproducir la estética de tarjetas oscuras con bordes y efectos neón.
3. Conservar la jerarquía visual y el lenguaje gráfico futurista.
4. Funcionar correctamente en escritorio, tablet y móvil.
5. Mantener legibilidad y accesibilidad.
6. Presentar animaciones fluidas y de bajo impacto.
7. Permitir extender el diseño mediante componentes y tokens compartidos.

**Regla principal:** reproducir el sistema de diseño del archivo de referencia, no necesariamente su distribución exacta ni su contenido. La identidad visual debe mantenerse consistente en todas las páginas del nuevo proyecto.