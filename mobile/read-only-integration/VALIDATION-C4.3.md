# C4.3 — Inicio y Mapa read-only

## Alcance implementado

Se integran Inicio y Mapa por autorización de C4.3. Materias conserva su integración previa. Planificar, Proyectar y Comunidad continúan como demostraciones estáticas sin datos académicos.

La sesión única y el único consumidor de useAcademicRead permanecen en C4App. Las tres vistas reciben el mismo view model vigente de C4.1. Navegar, seleccionar una materia o cambiar el ancho no incorpora llamadas académicas. Las vistas ocultas permanecen montadas; el detalle de Mapa se reinicia con la clave de contexto completo y la generación de conexión existentes. No se modificaron contratos C1–C3, catálogos originales, fixtures ni políticas de imports C1–C3.

Inicio muestra carrera y plan de la selección explícita del laboratorio. Los descriptores locales se cotejaron con src/data/careers.js, sin importar ese módulo: Sistemas 2023, Industrial I-23 (2023), Industrial 2007. Un catálogo desconocido no recibe un nombre sustituto. El resumen cuenta exclusivamente estados registrados: Aprobada, Regularizada, Cursando y Pendiente. Las actividades sin registro se cuentan por separado. No se calcula un porcentaje de avance.

Mapa agrupa las actividades por el año original, conservando el orden del catálogo dentro de cada grupo. Muestra estados registrados y ausencia de registro con texto además de color. Reutiliza el detalle read-only de Materias y preserva los tres tipos de requisitos, ALL, listas vacías y campos omitidos representados por null. No expande ALL ni calcula habilitaciones, bloqueos o elegibilidad; tampoco dibuja relaciones inferidas.

Los estados idle, loading, absent, error, blocked y archived no muestran filas, estadísticas de progreso ni detalles anteriores. Una defensa adicional de presentación rechaza un modelo loaded cuya identidad completa no coincida con la selección actual. La vigencia de conexión y generación continúa siendo responsabilidad de C3 y C4.1. La cancelación de consultas sigue siendo lógica, no una cancelación física de Firestore.

## Archivos de esta etapa

Nuevos: C4AcademicState.jsx, C4Home.jsx, C4Map.jsx, c4-overview.test.mjs y este documento.

Ajustados respecto de C4.2: C4App.jsx, C4Subjects.jsx, c4-ui-model.mjs, c4-ui.css, c4-ui.test.mjs e importPolicy.c4-ui.mjs. El estado no-loaded compartido se extrajo de Materias, sin cambiar su contrato. La frontera C4 UI incorpora explícitamente los nuevos componentes.

Los documentos C4.1/C4.2 describen sus etapas históricas. El usuario informó que C4.2 fue validada en Chrome; eso no acredita las nuevas vistas C4.3.

## Validación ejecutada — 2026-10-20

- 69 tests locales aprobados, 0 fallidos, 0 omitidos. Incluyen regresión C1–C4.2 y nueve tests nuevos de C4.3.
- C2 contra emuladores existentes: 13 casos aprobados.
- C3 contra emuladores existentes: cinco casos aprobados.
- C4 contra emuladores existentes: dos casos aprobados.
- Total: 89 tests/casos efectivos aprobados, 0 fallidos. Node informa 92 entradas aprobadas al contar también los tres tests padre de integración. No se iniciaron, detuvieron ni reiniciaron emuladores ni se sembraron datos.

Los nueve tests nuevos verifican descriptores, resumen de Sistemas (44 actividades, cuatro registradas y 40 sin registro), Industrial 2023 (45 sin registro y cero estados registrados), agrupación completa por año, nodos y estados de Mapa, detalle con ALL/null, estados sin progreso retenido, rechazo de identidades cruzadas y ausencia de nuevos lectores o consumidores del hook.

Las pruebas de renderizado usan React SSR en Node con dependencias ya instaladas. No prueban efectos DOM, foco real, interacción táctil ni navegación en Chrome. La ausencia de lecturas al navegar se acredita estructuralmente por el único consumidor y los paneles sin APIs de lectura; no se midió una navegación real en el navegador.

La integración mantiene separados el rechazo de propietario de la fachada C2 y la denegación directa por Rules. Los guards observaron únicamente los endpoints locales de Auth y Firestore: C2 registró 302 solicitudes/217 sockets, C3 115/86 y C4 47/37; cero intentos denegados. Es evidencia de esos procesos, no auditoría de red de Chrome ni firewall del sistema.

Los seis builds aprobaron, en orden: C1, C2, C3, pantalla manual C3, adaptador C4.1 y UI C4.3. El build ejecuta las fronteras de imports; también pasan sus pruebas de aislamiento. La UI compilada mide 798.76 kB de JS (237.40 kB gzip). Se mantienen advertencias de chunks mayores de 500 kB en C1/UI y MODULE_TYPELESS_PACKAGE_JSON al ejecutar módulos existentes; no se modificó configuración fuera del alcance para silenciarlas.

Los artefactos se generan en dist/, ignorado por Git. git diff --check y el control adicional de espacios de los archivos C4 sin seguimiento aprobaron. La rama continúa siendo mobile/stage2-4-4-b-emulator-infrastructure. Existe una modificación previa en mobile/emulator-lab/run.cjs correspondiente al parche autorizado del launcher; esta etapa no la modifica ni la incorpora.

## Disponibilidad local y limitación detectada

La entrada compilada existe en dist/c4-ui/c4-ui.html junto con sus recursos. Sin embargo, al verificar el servicio existente en http://127.0.0.1:5187, las rutas /, /c4-ui/c4-ui.html y /dist/c4-ui/c4-ui.html devolvieron HTTP 404. No se acredita que el servicio actual publique los artefactos. No se cambió su configuración ni se inició/reinició ningún servidor. Es necesario identificar y autorizar por separado cualquier ajuste del servicio antes de la validación visual si el 404 persiste.

## Pruebas Chrome pendientes

Cuando el servidor autorizado publique la entrada, abrir http://127.0.0.1:5187/c4-ui/c4-ui.html. Repetir en escritorio 1440×900 y móvil 390×844:

1. Sin conectar, visitar Inicio, Materias y Mapa: idle sin progreso y contador de lecturas cero.
2. Conectar lab-instances/Sistemas: Inicio debe mostrar 44 actividades, cuatro registradas, 40 sin registro y un estado de cada tipo. Mapa debe mostrar 44 actividades en cinco años. Materias debe coincidir. No debe existir porcentaje de avance.
3. Abrir detalles en Mapa: requisitos originales de solo lectura. Comparar Industrial (ALL y requisitos no informados) sin interpretarlos como habilitaciones; cerrar detalle y comprobar foco.
4. Industrial 2023: 45 actividades sin registro y cero en cada estado explícito. Volver a Sistemas; hacer cambios rápidos Sistemas → Industrial → Sistemas. Durante loading no deben verse datos ni detalles anteriores.
5. Con detalle abierto, cambiar usuario, carrera y conexión; desconectar y reconectar. El detalle debe desaparecer. Legacy debe mostrar revisión null; Sistemas instances revisión 7. No deben aparecer datos del contexto anterior ni durante la transición.
6. Industrial 2007 archivada, lab-blocked y lab-empty: archived, blocked y absent respectivamente, sin nodos o resumen académico. Legacy/Industrial también debe mostrar absent.
7. Navegar por las seis secciones, abrir/cerrar detalles y cambiar el ancho: el contador de lecturas no debe aumentar. Actualizar explícitamente desde Inicio debe iniciar una lectura, limpiar el progreso durante loading y recuperar el resultado vigente.
8. Si se prueba error, bloquear temporalmente Firestore 127.0.0.1:8188 solo en DevTools de esa pestaña y actualizar. Debe aparecer error sin progreso retenido. Quitar el bloqueo y actualizar manualmente; no detener B.
9. Verificar teclado, foco, zoom 200%, desplazamiento horizontal/táctil de Mapa y navegación móvil sin tapar controles o la última materia. Las tres demostraciones deben seguir estáticas.

Estas comprobaciones C4.3 no fueron ejecutadas en Chrome. No se declara cerrada la validación visual ni se avanza a C5. No se realizaron commits, push, merge ni instalaciones.

## Reproducción automatizada

Desde la raíz, con las dependencias ya instaladas y B ya funcionando:

```powershell
node --test mobile/read-only-integration/isolation.test.mjs mobile/read-only-integration/academicRead.test.mjs mobile/read-only-integration/academicDecoders.test.mjs mobile/read-only-integration/academicQueryController.test.mjs mobile/read-only-integration/academicSessionController.test.mjs mobile/read-only-integration/useAcademicRead.test.mjs mobile/read-only-integration/academicViewModel.test.mjs mobile/read-only-integration/c4-imports.test.mjs mobile/read-only-integration/c4-ui.test.mjs mobile/read-only-integration/c4-overview.test.mjs
node mobile/read-only-integration/run-integration.cjs
node mobile/read-only-integration/run-c3-integration.cjs
node mobile/read-only-integration/run-c4-integration.cjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c2.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3-manual.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c4.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c4-ui.config.mjs
git diff --check
```
