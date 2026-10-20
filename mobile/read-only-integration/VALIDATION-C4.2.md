# C4.2: entrada responsive y Materias read-only

Implementación local dentro de mobile/read-only-integration/. C1–C3, adaptador C4.1, catálogos originales, prototipo, B y Rules sin cambios. Sin instalaciones, escrituras académicas, listeners Firestore, persistencia adicional, commit o push. No se inicia, reinicia ni detiene un servidor del usuario.

## Archivos nuevos C4.2

- c4-ui.html y c4-main.jsx: entrada independiente de C1 y pantalla manual C3.
- C4App.jsx: dueño de una sesión local y único consumidor permanente de useAcademicRead. Reutiliza C2/C3 y academicViewModel de C4.1; no importa App/useAcademicDemo del prototipo.
- C4Subjects.jsx: filtros por texto, estado y año; lista y detalle read-only con tipos de requisitos separados. Null se muestra como no informado, distinto de una lista vacía. Sin habilitaciones, edición, guardado o transferencias al planificador.
- c4-ui-model.mjs: fixtures seleccionables explícitas, filtros puros, mensajes de estado y clave de remonte del espacio de Materias.
- c4-ui.css: estilos locales, sin fuentes o recursos remotos; navegación lateral en escritorio y barra inferior en móvil. Un solo árbol React; CSS define el breakpoint, sin duplicar la sesión.
- importPolicy.c4-ui.mjs y vite.c4-ui.config.mjs: frontera propia para el grafo aprobado de C2/C3, C4.1 y la nueva UI. No modifica políticas anteriores; mantiene CSP exacta del laboratorio. Los factories existentes de C2 contienen escritores no expuestos; la UI no los invoca ni incorpora APIs de escritura.
- c4-ui.test.mjs: siete tests nuevos de selector, presentación, identidad, aislamiento, arquitectura y SSR.
- Este documento: evidencia y procedimiento Chrome pendiente.

Inicio y Mapa son paneles de próxima integración C4.3/C4.4. Planificar, Proyectar y Comunidad son paneles estáticos que no reciben el modelo académico. No incorporan funcionalidades de producto o acciones de escritura.

## Identidad, consulta y limpieza

Solo C4App llama al hook C3. No se monta/desmonta al navegar entre secciones; el contenedor de Materias usa hidden para conservar el consumidor y sus filtros dentro del mismo contexto. Las otras secciones no reciben el snapshot.

Cada acción de conectar/reconectar/desconectar avanza una época local. La clave React del espacio de Materias incluye esa época y la identidad completa uid/model/id/catalogId; cambia al cambiar carrera/usuario/conexión y reinicia búsqueda, filtros y selección antes de mostrar contenido nuevo. La conexión C3 y la vigencia se verifican nuevamente en el adaptador C4.1. Los diagnósticos de conexiones tardías también se filtran por intento vigente. La UI no conserva filas durante loading, ausencia, error, archivo, bloqueo o desconexión; los errores y la carga de conexión tienen su propio panel sin progreso previo.

El contador de laboratorio mide llamadas iniciadas a client.readProgress, no peticiones HTTP, snapshots de Firestore o renderizados. Sirve para validar en Chrome que navegar, filtrar, abrir detalles y redimensionar no dispara lecturas. Conectar/cambiar contexto y actualizar manualmente sí pueden incrementarlo. No hay polling ni reintentos automáticos. No se promete aborto físico de peticiones Firestore.

## Regresión automatizada ejecutada

- 60 tests unitarios/SSR/imports: 53 previos y 7 nuevos C4.2; 0 fallidos, 0 omitidos.
- Integración real contra B existente: 13 casos C2, 5 C3 y 2 C4.1; todos aprobados. Los tres contenedores elevan el conteo Node a 14+6+3.
- Total sin contenedores: 80 pruebas/casos aprobados, 0 fallidos, 0 omitidos. Total reportado por Node: 83.
- Builds aprobados: C1, C2, biblioteca C3, pantalla manual C3, biblioteca C4.1 y UI C4.2. El último bundle UI es de 793,15 kB (236,18 kB gzip) y CSS de 4,46 kB. Se mantiene la advertencia de chunk mayor a 500 kB en C1 y C4 UI y la advertencia ESM MODULE_TYPELESS_PACKAGE_JSON en Node.
- HTTP: /c4-ui/c4-ui.html, su JS y su CSS responden 200 desde el Preview existente en 127.0.0.1:5187. Los tres conservan la CSP que permite connect-src solo a Auth 9199 y Firestore 8188.
- Los tests verifican: Sistemas 44/4/40; Industrial 45 sin registro y cero Pendiente registrado; búsqueda por nombre/código sin acentos; filtros combinados; separación de todos los estados; detalle que no resuelve códigos de otra carrera; requisitos no informados; claves de remonte por contexto/conexión; sesión inicial SSR sin lecturas; paneles estáticos sin datos; único consumidor y ausencia de consultas/eventos de viewport en el shell; frontera de imports sin App productivo/prototipo ni recursos persistentes.
- El primer intento SSR falló por el cargador previo que alcanzaba rutas /src/ dentro de dependencias. Se corrigió exclusivamente el cargador del nuevo test para limitarlo al src del repositorio. C1–C3 permanecen intactos. La ejecución final pasa.

La limpieza real de controles DOM, el recuento real de consultas al navegar y el diseño responsive de C4.2 NO se dieron por aprobados mediante SSR. Son comprobaciones pendientes de Chrome de la siguiente sección. La regresión Emulator acredita la cadena C2/C3/C4.1, no una sesión automatizada de la nueva pantalla en Chrome.

## Reproducción técnica

Desde la raíz, con dependencias y B existentes. Ejecutar en orden y comprobar código cero en cada paso; el primer build recrea dist y por eso precede a los otros.

```powershell
node --test mobile/read-only-integration/isolation.test.mjs mobile/read-only-integration/academicRead.test.mjs mobile/read-only-integration/academicDecoders.test.mjs mobile/read-only-integration/academicQueryController.test.mjs mobile/read-only-integration/academicSessionController.test.mjs mobile/read-only-integration/useAcademicRead.test.mjs mobile/read-only-integration/academicViewModel.test.mjs mobile/read-only-integration/c4-imports.test.mjs mobile/read-only-integration/c4-ui.test.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c2.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3-manual.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c4.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c4-ui.config.mjs
node mobile/read-only-integration/run-integration.cjs
node mobile/read-only-integration/run-c3-integration.cjs
node mobile/read-only-integration/run-c4-integration.cjs
git diff --check
```

Los procesos de integración tienen guard local y entorno sin credenciales productivas heredadas. La red observada está limitada a 127.0.0.1:9199/8188; no es una auditoría de Chrome ni firewall del sistema.

## Validación Chrome pendiente: escritorio y móvil

Abrir http://127.0.0.1:5187/c4-ui/c4-ui.html con B ya en LAB READY. No iniciar otro servidor. Probar primero 1440×900 y después 390×844 con DevTools; repetir los cambios de contexto en ambos tamaños.

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Abrir la página sin conectar | Materias muestra idle, sin filas; sesión idle; contador de lecturas 0. |
| 2 | Conectar / reconectar, usuario lab-instances y Sistemas | loading sin filas previas; después 44 actividades, 4 registradas, 40 sin registro, revisión 7. Anotar contador. |
| 3 | Estado Pendiente y después Sin registro | 1 resultado Pendiente explícito; 40 sin registro. El contador no cambia. |
| 4 | Limpiar filtros, buscar análisis, seleccionar año 1 y abrir una materia | Filtros combinados, detalle de solo lectura con los tres tipos de requisitos. Sin edición ni Agregar al plan. El contador no cambia. Cerrar detalle devuelve el foco a su botón de materia si sigue visible. |
| 5 | Ir por las seis secciones y volver a Materias | Inicio/Mapa anuncian próxima integración; las tres demos son estáticas. Sin nuevas lecturas; Materias conserva sus filtros dentro del mismo contexto. |
| 6 | Cambiar ancho entre escritorio y móvil sin recargar | Navegación lateral/barra inferior y mismo estado; sin incremento del contador. Confirmar que la última materia no queda tapada por la navegación. |
| 7 | Con filtros y detalle abiertos, cambiar a Industrial 2023 | Desaparecen el detalle y los filtros anteriores; loading sin filas; después 45 actividades, 0 registradas, 45 sin registro, revisión 1. No aparecen estados de Sistemas. |
| 8 | Volver a Sistemas y hacer cambios rápidos Sistemas → Industrial → Sistemas | Siempre se muestra la identidad actual. Resultado final 44/4/40 y revisión 7; sin filas/detalles anteriores durante transición. |
| 9 | Actualizar explícitamente | Contador aumenta; loading sin filas; vuelve 44/4/40, revisión 7. |
| 10 | Con filtros activos, conectar lab-legacy | Nueva conexión, filtros y detalle limpios; Sistemas legacy, 44/4/40, revisión null. |
| 11 | Legacy: Industrial (progreso ausente) | absent, explicación de documento ausente; sin tabla, contadores académicos o detalle. |
| 12 | Seleccionar lab-empty | absent, instancia inexistente para ese usuario; sin progreso. No se crea ningún documento. |
| 13 | Seleccionar lab-blocked | blocked / AUTHORITY_UNAVAILABLE; sin progreso. |
| 14 | lab-instances y Industrial 2007 | archived, sin tabla ni progreso; no se ofrece restauración. |
| 15 | Desconectar con detalle/filtros abiertos y reconectar | idle sin datos al desconectar; nueva conexión devuelve datos correspondientes con filtros y detalle limpios. |
| 16 | Navegar por teclado y probar zoom 200%, búsqueda y desplazamiento táctil | Foco visible, labels accesibles, sin solapamientos que impidan controles; corregir si aparece un defecto. |

Si se desea probar error de conexión sin tocar B, bloquear temporalmente http://127.0.0.1:8188/* solo en DevTools de esta pestaña y pulsar Actualizar. Debe mostrarse error sin datos retenidos. Quitar el bloqueo y actualizar manualmente; no reiniciar B. Esta comprobación de Chrome también está pendiente, no acreditada por los tests Node.

No se instala ni ejecuta automatización de navegador en esta etapa. La validación visual/interactiva de C4.2 y la autorización para C4.3 permanecen pendientes.
