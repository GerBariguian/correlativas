# C2: validación local del 20 de octubre de 2026

Rama: `mobile/stage2-4-4-b-emulator-infrastructure`. Se utiliza B ya iniciado por el usuario, con proyecto `demo-correlativas-244b` y fixtures existentes. No se inicia, detiene, reinicia, limpia ni siembra B. No hay escrituras académicas, cambios de Rules, migraciones o instalaciones.

## Reproducción

Desde la raíz en PowerShell, con B en `LAB READY`:

```powershell
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.config.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló build C1' }
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c2.config.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló build C2' }
node --test mobile/read-only-integration/isolation.test.mjs mobile/read-only-integration/academicRead.test.mjs mobile/read-only-integration/academicDecoders.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Fallaron tests unitarios/imports' }
node mobile/read-only-integration/run-integration.cjs
if ($LASTEXITCODE -ne 0) { throw 'Falló integración real C2' }
git diff --check
```

La integración importa el bundle C2 sin modificar y usa SDK/transportes reales contra Auth 9199 y Firestore 8188. Se ejecuta en Node con `globalThis.location` fijado al origen C1 esperado: no sustituye una ejecución automatizada de Chrome ni verifica su CSP o almacenamiento. No necesita que la página C1 esté abierta. El caso separado de Rules utiliza un cliente SDK adicional, configurado explícitamente en memoria y conectado a ambos emuladores antes de autenticarse o leer.

El runner construye un entorno sin credenciales/proxies productivos heredados. Precarga un guard propio antes de Firebase: permite sockets solamente a 127.0.0.1:9199/8188, bloquea TLS y fetch fuera de los dos orígenes HTTP locales y rechaza endpoints HTTP de escritura Firestore. Registra destinos y contadores, sin tokens, cuerpos ni query strings. `C2_NETWORK_EVIDENCE` informa la evidencia de cada ejecución. No es un firewall del sistema ni una auditoría de procesos ajenos.

El timeout y `--test-force-exit` se aplican solamente al proceso de tests para que temporizadores internos del SDK no retengan el runner tras terminar las aserciones. Cada cliente se cierra en `finally`. No se intervienen las terminales del usuario.

## Casos acreditados por integración automatizada

| Caso | Fixture / scope exacto | Aserción |
|---|---|---|
| Sistemas → Industrial → Sistemas | lab-instances / instances; lab-systems / utn-sistemas-2023 y lab-industrial23 / utn-industrial-2023 | loaded con mapa de cuatro estados y revisión 7; loaded con mapa vacío y revisión 1; retorno a revisión 7 y mapa original |
| Legacy existente y ausente | lab-legacy / legacy; utn-sistemas-2023 y utn-industrial-2023 (id=catalogId) | loaded con cuatro estados y revisión null; absent / PROGRESS_MISSING, sin progreso previo |
| Instancia inexistente para el propietario | lab-empty / instances / lab-systems / utn-sistemas-2023 | absent / INSTANCE_MISSING |
| Contexto bloqueado | lab-blocked / instances / lab-systems / utn-sistemas-2023 | blocked / AUTHORITY_UNAVAILABLE antes de buscar la instancia ausente |
| Contexto archivado | lab-instances / instances / lab-industrial07 / utn-industrial-2007 | archived sin progreso, después de leer Sistemas |
| Propietario en ambos sentidos | cliente lab-legacy solicitando scope de lab-instances; cliente lab-instances solicitando scope de lab-legacy | blocked / OWNER_MISMATCH después de lecturas propias exitosas |
| Catálogo cruzado | lab-instances / instances / lab-systems / utn-industrial-2023 | blocked / CATALOG_MISMATCH sin progreso previo |
| Modelo incorrecto en ambos sentidos | lab-instances solicitando legacy / utn-sistemas-2023; lab-legacy solicitando instances / lab-systems / utn-sistemas-2023 | blocked / AUTHORITY_UNAVAILABLE sin fallback ni progreso previo |
| Scope inválido | scope Sistemas omitiendo catalogId | error / INVALID_ONBOARDING_SCOPE, después de lectura exitosa y sin progreso previo |
| Cierre y nueva conexión | lab-instances / instances / lab-systems / utn-sistemas-2023 | close idempotente; error / C2_CLOSED sin nuevas peticiones fetch; otro cliente obtiene loaded |
| Firestore no disponible y recuperación | mismo scope Sistemas | guard rechaza fetch a 8188 solo dentro del proceso de tests; error / C2_EMULATOR_UNAVAILABLE sin progreso anterior; conectar otro cliente durante el bloqueo rechaza con C1_EMULATOR_UNAVAILABLE_8188; restaurar guard permite loaded revisión 7 |
| Rules: lectura ajena directa | autenticado como lab-instances; control positivo propio con revisión 7; getDocFromServer de users/lab-legacy/careers/utn-sistemas-2023 | rechazo permission-denied desde Firestore, independientemente del bloqueo de la fachada |
| Transporte observado | todas las operaciones anteriores | solicitudes y sockets reales; únicamente orígenes http://127.0.0.1:9199 y http://127.0.0.1:8188; cero intentos bloqueados de red externa |

Las respuestas no loaded deben carecer de la propiedad `progress`. La ausencia de legacy utiliza un catálogo existente en B bajo un propietario sin ese documento; la instancia ausente utiliza un ID existente bajo otro propietario. No se inventan nuevas fixtures ni se alteran documentos.

El rechazo OWNER_MISMATCH es evidencia de la fachada C2. El caso directo permission-denied es evidencia separada de Rules para esa lectura concreta; no es una auditoría exhaustiva de permisos.

## Resultados y límites

- 16 tests unitarios/decoders/imports aprobados.
- 13 subtests de integración real aprobados (Node informa 14 contando el test contenedor), sin omisiones.
- Builds C1 y C2 aprobados, incluyendo control del grafo por Vite.
- `git diff --check` aprobado; todos los cambios permanecen dentro de mobile/read-only-integration/. Los tres archivos generados de dist están ignorados por Git; manifiestos, lockfiles, src y B permanecen sin cambios.
- Advertencias existentes: chunk C1 superior a 500 kB; MODULE_TYPELESS_PACKAGE_JSON en fuentes existentes. No se cambia código fuera de C2 para silenciarlas.
- Validación manual en Chrome comunicada por el usuario: instances revisión 7; legacy revisión null; propietario distinto; Sistemas → Industrial → Sistemas; archivada sin progreso.

Pendientes/no acreditados: signOut explícito (la fachada expone close, no signOut); cambio real de usuario/autoridad/lifecycle durante una petición; pérdida real de Firestore durante un RPC ya iniciado; documentos corruptos o instancia activa sin progreso (no existen esas fixtures); auditoría automatizada del tráfico/almacenamiento/CSP en Chrome; todas las variantes de Rules. Los cambios de autoridad/sesión y documentos inválidos cuentan con cobertura unitaria mediante dependencias inyectadas, no con nuevas fixtures Emulator.

Las lecturas previas/posteriores de autoridad y metadata no constituyen un snapshot atómico ante cambios transitorios concurrentes. La indisponibilidad simulada verifica el control previo de disponibilidad y recuperación, manteniendo B activo e intacto. No se implementan C3–C5.
