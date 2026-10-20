# C5 — Informe técnico del laboratorio aislado

Fecha: 2026-10-20. Rama: mobile/stage2-4-4-b-emulator-infrastructure. HEAD de referencia: 78b57aa1a71b832cc73119ee960d30e31efa9145. C4.1–C4.3 y este informe permanecen sin commit. No se inició integración con la aplicación principal.

## Resultado y alcance

La regresión automática C1–C4.3 y los seis builds aprobaron. La evidencia manual comunicada por el usuario acredita los recorridos móviles descritos abajo. Se recomienda aceptar el cierre técnico del alcance read-only validado en laboratorio, conservando los límites y pendientes de este informe. Esto no certifica integración productiva, seguridad exhaustiva del sistema, escrituras académicas ni funcionalidades futuras.

Se mantuvieron el proyecto demo, los usuarios ficticios, los catálogos originales y las Rules del laboratorio. No se instalaron dependencias ni se iniciaron, reiniciaron, detuvieron o limpiaron emuladores. No se hicieron commits, push, merges o despliegues. El parche previo de mobile/emulator-lab/run.cjs se conserva; no forma parte de los cambios de documentación de C5.

## Preverificación ejecutada

- Node v24.22.0; npm 11.19.1; Java Temurin 21.0.12.1+1-LTS.
- Firebase CLI local instalada: 15.30.2; firebase-functions del lab: 7.4.0; firebase-admin: 14.5.0, verificados en sus manifiestos. No se atribuye retrospectivamente una versión de ejecutable a cada proceso activo.
- GET Auth 127.0.0.1:9199: HTTP 200 y ready true; Firestore :8188: HTTP 200/Ok.
- GET Functions :5101/demo-correlativas-244b/us-central1/backendHarness/health: HTTP 200, proyecto correcto, emulatorOnly true, creación de carrera y guardado académico no implementados.
- http://127.0.0.1:5187/c4-ui.html: HTTP 200. Su CSP efectiva contiene connect-src http://127.0.0.1:9199 http://127.0.0.1:8188, sin destinos remotos. La disponibilidad en esta ruta actualiza el impedimento histórico 404 consignado para otras rutas en VALIDATION-C4.3.md.

## Regresión automática ejecutada en el segundo bloque C5

No son cifras inferidas de documentación anterior: se ejecutaron en la conversación, en orden y con salida cero antes del bloque de builds.

| Etapa | Aprobadas efectivas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Diez archivos locales C1–C4.3 | 69 | 0 | 0 |
| Integración C2 con Emulator | 13 | 0 | 0 |
| Integración C3 con Emulator | 5 | 0 | 0 |
| Integración C4 con Emulator | 2 | 0 | 0 |
| Total | 89 | 0 | 0 |

Node informa 92 aprobadas si se incluyen los tres tests contenedores de integración. No se suman los casos manuales como tests automáticos.

Cobertura: políticas C1; decoders y aislamiento C2; identidad completa uid/model/id/catalogId, identidad de conexión y generaciones C3; resultados tardíos A→B→A, cierre y reconexión; adaptador C4, tres catálogos, estados registrados frente a ausencia de registro, errores y referencias inválidas; render SSR de Inicio/Materias/Mapa y fronteras de imports. La integración C4 prueba snapshots y adaptador con datos reales del Emulator, no la interacción DOM de las pantallas.

| Guard del proceso | Solicitudes | Sockets | Intentos denegados |
|---|---:|---:|---:|
| C2 | 301 | 218 | 0 |
| C3 | 114 | 86 | 0 |
| C4 | 47 | 37 | 0 |

Los destinos observados fueron exclusivamente 127.0.0.1:9199 y :8188. C2 acredita separadamente OWNER_MISMATCH en la fachada y permission-denied de Rules para una lectura ajena directa. La indisponibilidad se simula reversiblemente dentro del proceso de tests; no se apaga Firestore. Estos guards no auditan Chrome ni son un firewall del sistema. No se modifican ni siembran fixtures en estas integraciones.

Comandos ejecutados, desde la raíz en PowerShell:

```powershell
node --test mobile/read-only-integration/isolation.test.mjs mobile/read-only-integration/academicRead.test.mjs mobile/read-only-integration/academicDecoders.test.mjs mobile/read-only-integration/academicQueryController.test.mjs mobile/read-only-integration/academicSessionController.test.mjs mobile/read-only-integration/useAcademicRead.test.mjs mobile/read-only-integration/academicViewModel.test.mjs mobile/read-only-integration/c4-imports.test.mjs mobile/read-only-integration/c4-ui.test.mjs mobile/read-only-integration/c4-overview.test.mjs
node mobile/read-only-integration/run-integration.cjs
node mobile/read-only-integration/run-c3-integration.cjs
node mobile/read-only-integration/run-c4-integration.cjs
git diff --check
```

## Seis builds ejecutados en este bloque

Se inspeccionaron las seis configuraciones existentes y se ejecutaron secuencialmente. Todos finalizaron con código 0 e incluyeron sus plugins de control de imports. Se informó antes de comenzar que C1 recrea dist/ y puede dejar temporalmente sin recursos a la vista previa. No se reinició el servidor.

| Configuración | Artefacto principal | Tamaño JS | Resultado |
|---|---|---:|---|
| vite.config.mjs | dist/assets/index-CvgcMICz.js | 683.21 kB | Aprobado |
| vite.c2.config.mjs | dist/c2/academic-client.mjs | 777.71 kB | Aprobado |
| vite.c3.config.mjs | dist/c3/academic-consumer.mjs | 6.58 kB | Aprobado |
| vite.c3-manual.config.mjs | dist/c3-manual/assets/c3-manual-D1Wf7j2l.js | 2256.20 kB | Aprobado |
| vite.c4.config.mjs | dist/c4/academic-view-model.mjs | 27.93 kB | Aprobado |
| vite.c4-ui.config.mjs | dist/c4-ui/assets/c4-ui-CkrNfOdU.js | 798.76 kB | Aprobado |

La pantalla manual C3 incluye React de desarrollo y no está minificada. La UI C4 tiene además 6.03 kB de CSS. Los tamaños no constituyen una medición de rendimiento móvil.

```powershell
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c2.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3-manual.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c4.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c4-ui.config.mjs
```

Después de los builds, se comprobó por GET HTTP 200 para /c4-ui.html y sus recursos /assets/c4-ui-CkrNfOdU.js y /assets/c4-ui-WMbNfPaA.css en 127.0.0.1:5187. La cabecera CSP local seguía presente. Esto acredita publicación HTTP, no un nuevo recorrido interactivo del agente en Chrome.

## Validación manual en Chrome móvil — comunicada por el usuario

Viewport 390 × 844. Fuente: observaciones del usuario en esta conversación; no automatización del agente. No se adjunta una captura de red exhaustiva ni se presume una prueba en dispositivo físico.

| Comprobación | Resultado observado |
|---|---|
| Sistemas 2023 | 44 materias, 4 registradas, 40 sin registro |
| Industrial 2023 | 45 materias, 0 registradas, 45 sin registro |
| Inicio → Materias → Mapa | Sin nuevas lecturas; contador permanece en 2 |
| Desconexión | Desaparecen los datos académicos |
| Reconexión | Se recuperan las 45 materias; contador pasa a 3 |
| Local Storage / Session Storage | Vacíos |
| IndexedDB | Registros técnicos de Firebase Heartbeat |
| Network | Solicitudes observadas hacia servicios locales |

El usuario había comunicado también detalles de correlatividades y navegación de Inicio/Mapa. Las once comprobaciones manuales históricas de C3 se mantienen en VALIDATION-C3.md; no se atribuyen automáticamente a la UI C4 ni se suman a los 89 casos.

Los registros Heartbeat son una excepción explícita a cualquier afirmación de ausencia total de IndexedDB. La configuración de Auth y caché académica es en memoria; la observación comunicada no identifica progreso o sesión persistidos, pero tampoco equivale a una auditoría exhaustiva de todos los registros y su contenido. La afirmación aceptada se limita a sesión/progreso en memoria, no a cero almacenamiento técnico del SDK. El contador de lecturas mide invocaciones académicas, no todas las solicitudes SDK.

## Advertencias, límites y pendientes

- Mapa móvil utiliza desplazamiento horizontal. Se conserva como limitación de presentación; no se acredita aquí accesibilidad exhaustiva por teclado, zoom, lectores de pantalla ni facilidad de descubrimiento del desplazamiento. Cualquier mejora requiere otra autorización.
- Vite advierte chunks mayores de 500 kB en C1 y UI C4. Los tests Node emitieron MODULE_TYPELESS_PACKAGE_JSON para módulos existentes; no se cambiaron manifiestos para silenciarlo.
- SSR no monta efectos DOM. Las pruebas deterministas y manuales son evidencias complementarias; no existe automatización integral de Chrome en este cierre.
- Sin listeners ni polling, loaded refleja la última lectura explícita. No hay detección inmediata de una revocación o archivo externo. Las comprobaciones previas/posteriores de autoridad no son un snapshot atómico; cancelación lógica no significa aborto físico de RPC.
- Persisten pendientes la auditoría exhaustiva de red/almacenamiento de Chrome, variantes completas de Rules, caída física durante RPC, cambios reales concurrentes de autoridad/lifecycle y fixtures corruptas o instancia activa sin progreso. No se fabricaron esos casos cambiando datos.
- Las suites completas B son evidencia histórica de Windows, no se repitieron con B activo. El parche de readiness/diagnóstico se conserva; no se acredita aquí una prueba nueva de arranque, timeout o cierre de B.
- La validación no cubre Google Sign-In, dispositivos físicos, rendimiento bajo red móvil, escrituras académicas, elegibilidad, producción ni integración con la navegación principal. Planificar, Proyectar y Comunidad permanecen estáticas.

## Control de cambios y recomendación

El único archivo fuente/documental creado en este bloque es VALIDATION-C5.md. Los seis builds recrean artefactos ignorados bajo mobile/read-only-integration/dist/. El estado esperado al cierre es 26 archivos C4/C5 sin seguimiento dentro de esa carpeta, más la modificación previa de mobile/emulator-lab/run.cjs, sin staged. git diff --check y el control de espacios del documento nuevo se verifican al cerrar este bloque.

Recomendación: conservar este cierre como evidencia del laboratorio read-only y revisar su alcance antes de preparar cualquier publicación. Una integración futura con Correlativas necesita autorización y diseño específicos para autenticación real, propiedad de sesión, Rules productivas, fronteras de imports y tratamiento de cambios externos. No sustituir los endpoints locales ni conectar producción como continuación implícita de C5. No se autoriza commit, push ni despliegue mediante este informe.
