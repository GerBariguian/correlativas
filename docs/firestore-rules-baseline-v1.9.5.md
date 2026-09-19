# Correlativas v1.9.5 — línea base real de Firestore Rules

Este documento conserva la evidencia histórica anterior a las correcciones H5/H6. Sus resultados, hash, matriz y referencias a comportamiento «actual» corresponden exclusivamente a esa línea base, no al estado pendiente de commit.

Estado posterior: H5 reserva IDs mediante tombstones y H6 valida la estructura de los códigos sin exigir pertenencia al catálogo. Las reproducciones se convirtieron en regresiones DENY. La herramienta local de auditoría está documentada en [audit-orphan-subjects.md](audit-orphan-subjects.md); no se ha ejecutado contra producción. La comprobación de huérfanos históricos sigue pendiente antes del despliegue de H5.

Fecha de ejecución de la línea base: 2026-09-19. Esa etapa caracterizó las reglas sin corregir vulnerabilidades.

## Resultado

- **91 tests de Rules aprobados, 0 fallidos, 0 omitidos**, en 10 suites, contra Firestore Emulator real.
- **71 tests existentes aprobados, 0 fallidos**.
- `npm.cmd run build`: correcto; advertencia de bundle mayor que 500 kB (JS ~1.047 MB sin gzip).
- No se modificaron `firestore.rules`, `src/`, servicios, índices ni configuración remota.
- Sin datos reales, login, deploy, commit ni push.
- H5 y H6 **reproducidos**, no corregidos. Una suite verde confirma el comportamiento actual, no la ausencia de vulnerabilidades.

SHA-256 del archivo `firestore.rules` antes y después:

```text
d1668297536fadf130cffadca1ae8a953ace3b1b8e0e07794a89d8ac67bbe18e
```

## Archivos e infraestructura

| Archivo | Función |
| --- | --- |
| `firebase.rules-test.json` | Configuración exclusiva del emulador Firestore, loopback, puerto 8088, UI deshabilitada. Apunta al archivo real `firestore.rules`. |
| `scripts/test-rules.cjs` | Preflight, selección fija del proyecto demo, Java, ejecución del CLI local y propagación del código de salida. |
| `tests/rules/helpers.cjs` | Guardas de aislamiento, carga del archivo de reglas, claims, fixtures sintéticos y escrituras administrativas solo locales. |
| `tests/rules/firestore.test.cjs` | Operaciones SDK reales con `assertSucceeds`/`assertFails`, casos positivos/negativos y hallazgos conocidos. |
| `package.json` / `package-lock.json` | Scripts y versiones reproducibles de dependencias de desarrollo. |
| `.gitignore` | Excluye runtime/caché local `.tools/` y logs del emulador. |
| `README.md` | Enlace a esta guía. |

Dependencias directas agregadas, ambas de desarrollo y fijadas sin rangos:

- `@firebase/rules-unit-testing@5.0.2`: contextos de autenticación simulada, carga de reglas y aserciones contra el emulador.
- `firebase-tools@15.30.2`: CLI local reproducible para descargar/arrancar/detener el emulador mediante `emulators:exec`.

No se agregó framework de tests: se usa `node:test`. Las versiones de los paquetes ya presentes en el lockfile original se conservaron; la instalación reorganizó metadatos y agregó las dependencias transitivas del CLI.

Entorno ejecutado: Node 24.21.0, Java Temurin 21.0.12.1+1, Firestore Emulator 1.22.0, Firebase SDK 12.15.0. El JRE portátil oficial de Eclipse Adoptium se descargó en `.tools/` (ignorado), sin instalación de sistema. El CLI comprueba la descarga de su emulador y lo almacena en `.tools/firebase-emulators/`.

## Cómo ejecutar

Requisitos: Node 22/24 compatible con el CLI fijado, Java 21+ y acceso inicial a internet para instalar dependencias/descargar el emulador. No se necesita Firebase login ni proyecto real.

```powershell
npm.cmd ci
npm.cmd run test:rules
npm.cmd test
npm.cmd run build
```

El runner busca Java en `JAVA_HOME/bin`, un runtime portátil `.tools/<runtime>/bin`, o el PATH del proceso. En este workspace ya está disponible el runtime portátil. En un checkout nuevo debe proporcionarse Java; el runner no instala ni descarga Java automáticamente.

`test:rules` inicia el emulador, carga las reglas, ejecuta la suite serialmente y lo detiene al finalizar, también cuando el comando de tests termina con error. El CLI puede iniciar sus procesos auxiliares hub/logging; no se habilitan emuladores Auth, Functions, Storage u otros productos. El puerto 8088 debe estar libre; no se reutiliza deliberadamente una instancia de proyecto desconocido. No ejecutar dos copias de esta suite simultáneamente.

La suite limita su duración a 120 segundos mediante Node. El arranque/primera descarga puede tardar más que una ejecución con caché. Cada caso limpia exclusivamente la base del proyecto demo antes de sembrar fixtures. Al terminar, se limpian los contextos SDK y `emulators:exec` detiene el proceso. No se exportan datos.

En entornos sandbox puede requerirse permiso para crear procesos Java/Node y abrir el puerto local. Un error `EPERM` es un bloqueo de infraestructura, no una denegación de Firestore Rules.

Las líneas `PERMISSION_DENIED` de las operaciones negativas son esperadas. El resultado válido es el resumen de `node:test`; `assertFails` verifica denegaciones de permisos, no convierte cualquier error de red en éxito. Los detalles del motor quedan en `firestore-debug.log`, excluido de Git.

## Aislamiento de producción

- Project ID fijo: **`demo-correlativas-rules`**. No existe selección desde `.env`, parámetros del usuario ni `src/firebase.js`.
- Host fijo: **`127.0.0.1:8088`**, tanto en configuración como en `initializeTestEnvironment`.
- El runner elimina del entorno hijo `VITE_*`, credenciales explícitas y selección de proyectos de producción; fija los project IDs demo.
- El helper exige `FIRESTORE_EMULATOR_HOST` exacto y `RULES_TEST_PROJECT` demo antes de inicializar clientes. Rechaza proyectos/hosts incompatibles.
- Comprueba disponibilidad local con timeout antes de cargar reglas. Si no hay emulador, falla; no hay fallback remoto.
- Las identidades German, Juan, Pedro, Maria y outsider usan UID sintéticos y emails `@example.test`.
- Los claims incluyen `email`, `email_verified` y `firebase.sign_in_provider`. El UID se pasa a `authenticatedContext`. No se necesita emular Auth para producir estos tokens de pruebas.
- `withSecurityRulesDisabled` solo prepara/inspecciona fixtures del emulador. Las operaciones auditadas siempre usan los clientes sometidos a Rules.
- Las lecturas usan `getDocFromServer`/`getDocsFromServer` para no presentar caché local como acceso autorizado.

Se verificó adicionalmente: invocación sin variables rechazada; host remoto rechazado antes de conectar; project ID no demo rechazado; emulador apagado produce `ECONNREFUSED` sin fallback. El emulador quedó detenido tras la ejecución.

El build normal puede consumir la configuración pública Vite existente para generar el artefacto local; no ejecuta la aplicación ni realiza lecturas/escrituras en Firestore. La suite no consume esa configuración. La descarga del CLI/JRE/JAR y consultas al registro NPM son tráfico de herramientas, no acceso a la base de producción.

## Matriz de resultados observados

| Área | ALLOW confirmado | DENY confirmado |
| --- | --- | --- |
| Progreso privado | Propietario lee perfil, escribe y lee `statusMap`. | Acceso cruzado a perfil/progreso, escritura y borrado; también con amistad aceptada o plan compartido. Anónimo denegado. |
| Claims | Propietario autenticado accede a datos privados incluso sin Google/email verificado: política actual. | Anónimo, no verificado y proveedor no Google no leen ni mutan documentos sociales, sharing, snapshots o planes. |
| Social profiles | Creación/actualización propia; get por UID conocido; lectura/migración legacy por dueño. | Escritura ajena, listado, borrado, email/statusMap/extras, UID/carrera inconsistentes; lectura legacy con email por terceros. |
| Social emails | Get exacto; creación atómica con puntero privado; migración de email coherente. | List/query incluso por ID exacto, prefijo/rango, otro email/UID, extras, takeover, borrado ajeno o vigente, índice antiguo invalidado para tercero. |
| Amistades | Pending por sender; accepted/rejected por destinatario; get/query por participante. | Creación accepted, sender/recipient falsos, self-request, participantes extra, ID inválido, respuesta de sender/tercero, cambios/extras, ambas orientaciones en batch, duplicado inverso y query global/ajena. |
| Sharing | Consentimiento propio apagado; publicación atómica v1/v2; lectura de amigo directo autorizado; desactivación. | Consentimiento/publicación ajenos, falta de amistad, pending/rejected, sharing apagado, carrera distinta, snapshot obsoleto o consentimiento incompatible. |
| Snapshots | Dueño lee/borrar; amigo directo lee la versión autorizada. V1 sigue legible bajo consentimiento v2. | Top-level statusMap/extras, tipos de array inválidos, duplicados/intersecciones, publicación sin sharing o fuente vigente, finales v2 bajo permiso v1, list de snapshots. |
| No transitividad | Juan lee snapshot de Pedro con amistad directa. German puede leer el plan compartido. | German no lee snapshot ni sharing ni progreso privado de Pedro, aunque German-Juan y Juan-Pedro sean accepted y los tres estén en el plan. |
| Planes | Owner/miembro/pendiente leen metadatos; owner/miembro renombra abierto; miembro invita a amigo propio, sin exigir amistad con owner. | Outsider lee/edita/se autoagrega; pendiente edita/invita; cambio owner/carrera; aceptar a otro; invitedBy falsificado; extras/no amigo. |
| Membresía | Pendiente acepta solo a sí mismo con carrera compatible; rechaza; miembro abandona; salida revoca acceso. | Aceptación con carrera incompatible o en plan cerrado. |
| Límites de plan | Crear plan con 5 personas totales. | Sexta persona o invitados duplicados. |
| Cierre/eliminación | Owner cierra, bloquea para eliminar, lista/limpia subjects y borra padre; cerrado sigue legible para miembros. | Member cierra/elimina; borrado prematuro; reapertura; desbloqueo deleting; edición/borrado ordinario de subjects cerrados; subjects para miembro durante deleting. |
| Subjects | Miembro crea, modifica conservando autor/fecha, lista y elimina en plan abierto. | Pendiente/externo get/list/create/update/delete; autoría falsa/modificada, fecha alterada, extras, participantes ajenos/duplicados y código distinto de la ruta. |
| Queries | Friendships por participante; jointPlans por owner o invitee del lector; subjects por miembro. | Directorios globales, filtros sin restricción del actor, `collectionGroup('careers')` y `collectionGroup('subjects')` globales. |
| Rutas desconocidas | — | Get/list/write/delete de colección desconocida, subcolecciones desconocidas y documento padre planningSnapshots no autorizado. |

## Known security gaps: política esperada frente a comportamiento actual

Los seis tests del describe `KNOWN SECURITY GAPS` están activos, sin `skip`, `todo` ni captura de excepciones para ocultar resultados. Las aserciones documentan el motor actual. Cuando una corrección futura cambie un ALLOW por DENY, esos tests fallarán deliberadamente hasta que se actualicen para exigir la política corregida, conservando el mismo escenario de ataque.

### H5 — reproducido (MEDIO)

**Expected security policy:** borrar un plan no permite que un nuevo propietario acceda a materias de una generación anterior.

**Current observed behavior: ALLOW.** Secuencia ejecutada:

1. German crea un plan real por SDK con Juan invitado; solo German aceptado.
2. German crea `subjects/A`, atribuido a German y propuesto para German/Juan.
3. Pedro intenta leer esa materia: DENY.
4. German cierra el plan y establece `deleting: true`, ambas operaciones autorizadas.
5. German elimina únicamente el padre: ALLOW.
6. Un contexto administrativo local verifica que el padre no existe y `subjects/A` sí.
7. Pedro vuelve a leer sin padre: DENY.
8. Pedro crea el mismo planId, ahora con Pedro propietario y Maria invitada. La amistad Pedro-Maria cumple las condiciones actuales: ALLOW.
9. Pedro lee y lista la materia antigua: ALLOW. Se verifican `addedByUid: german` y `proposedParticipantIds: [german, juan]`.

El motor usa el padre actual para autorizar. No comprueba la generación de la materia. El escenario requiere huérfanos y conocimiento del ID; no toma control de un padre existente ni permite leer `users/.../careers`.

### H6 — reproducido (MEDIO)

**Expected security policy:** los campos de códigos contienen exclusivamente códigos académicos admitidos y no contenedores arbitrarios de datos.

**Current observed behavior: ALLOW** en tres tests independientes:

- Objeto con un `statusMap` sintético anidado dentro de `approvedCodes`.
- String fuera de catálogo y número dentro de `availableToCourseCodes`.
- Objeto con nota sintética dentro de `pendingFinalCodes` v2.

Juan publica cada payload en un batch junto a consentimiento v2 válido; German, amigo directo, lo lee desde servidor. Se compara exactamente el payload recibido con el publicado. No es solo un documento sembrado con privilegios administrativos.

Los campos adicionales superiores se rechazan correctamente, pero los elementos de las listas no tienen la restricción semántica esperada. La UI puede rechazar esas estructuras; un cliente directo autorizado recibe el documento. No se demuestra lectura de datos privados ajenos: el publicador controla el payload propio.

### H1 y H3 — comportamiento confirmado

- **H1:** ambos participantes intentan actualizar una amistad accepted a rejected y eliminarla: DENY. No se implementó revocación. Se prueba por separado que una revocación administrativa de fixture corta nuevas lecturas del snapshot.
- **H3:** outsider realiza cuatro GET exactos de emails ficticios y uno inexistente: permitidos, con coincidencias observables. No se hizo carga masiva ni se implementó rate limiting. Este caso confirma el canal de descubrimiento; no mide un límite de volumen.

## Diferencias respecto de la auditoría y hallazgos nuevos

H5/H6 dejaron de ser hipótesis estáticas: el emulador los confirma. No hubo contradicciones en las operaciones de autorización cubiertas. La privacidad del progreso, separación de planes y ausencia de transitividad se sostuvieron en estos escenarios. No se encontró una nueva escalada de permisos en esta suite; eso no prueba ausencia de problemas fuera de su cobertura.

Se corrige la evidencia de dependencias del informe previo: `npm.cmd audit` dentro del sandbox devolvió 0, pero la consulta online autorizada devolvió **9 paquetes con avisos: 7 moderate y 2 high**. No debe conservarse el cero anterior como certificación vigente.

- Los 2 high son `postcss@8.5.16` y `nanoid@3.3.15`, transitivos de Vite y ya presentes antes de esta etapa. `npm.cmd audit --omit=dev` también los reporta porque Vite está actualmente declarado en dependencies. No implica por sí mismo que sean explotables desde la aplicación desplegada.
- Los 7 moderate pertenecen al árbol de desarrollo del CLI: `firebase-tools`, `@google-cloud/pubsub`, `@opentelemetry/core`, `csv-parse`, `gaxios`, `stream-json`, `uuid`. Incluyen paquetes afectados transitivamente, no nueve exploits independientes.
- No se ejecutó `npm audit fix`, no se impusieron overrides ni se hizo el downgrade mayor sugerido por NPM. Requiere una revisión posterior de dependencias y exposición concreta.

Referencias de avisos: [PostCSS](https://github.com/advisories/GHSA-r28c-9q8g-f849), [nanoid](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [OpenTelemetry](https://github.com/advisories/GHSA-8988-4f7v-96qf), [csv-parse](https://github.com/advisories/GHSA-8cw4-87c7-c6xx), [stream-json](https://github.com/advisories/GHSA-528h-pc64-c93x), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

## Límites y próximo paso

Esta suite valida el archivo local, no confirma qué reglas están desplegadas en producción. El emulador tampoco certifica índices/quotas de producción, App Check, OAuth real, comportamiento de navegador, reconexiones/listeners tras revocación, ni todos los interleavings concurrentes. Las lecturas posteriores a revocación son nuevas lecturas desde servidor. Los fixtures legacy/administrativos no acreditan que esos documentos existan en producción.

Próximo paso recomendado: revisar y aprobar por separado el diseño de corrección de H5 y H6; luego cambiar reglas/modelo y convertir sus reproducciones en regresiones DENY. Mantener esta línea base y la matriz positiva. Coordinar H1/H2 y la revisión de dependencias como trabajos explícitos posteriores. No se implementa ninguna de esas correcciones en esta etapa.

Referencias de infraestructura: [pruebas de Rules con Firestore Emulator](https://firebase.google.com/docs/firestore/security/test-rules-emulator), [rules-unit-testing](https://firebase.google.com/docs/reference/emulator-suite/rules-unit-testing/rules-unit-testing).
