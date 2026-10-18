# Mobile 2.4.4 B — Infraestructura Firebase local

Rama independiente: `mobile/stage2-4-4-b-emulator-infrastructure`, base `b6e17b3f69d5139c06c16b3d30542d8e8bc85f92`.

**Estado: infraestructura aislada validada en Windows 11 Pro. Las cuatro suites finalizaron con código 0; ver resultados y límites abajo. Cierre Git pendiente de autorización.**

La compatibilidad Windows y su plan de aceptación están en [WINDOWS.md](WINDOWS.md). La corrección de descubrimiento se documenta en su sección final y en [functions-discovery-verification.json](functions-discovery-verification.json). [windows-verification.json](windows-verification.json) conserva los resultados anteriores a esta corrección. `verification.json` conserva el informe histórico anterior a esta adaptación, no sus resultados actuales.

## Alcance y aislamiento

Proyecto fijo `demo-correlativas-244b`. No acepta proyecto, host o URL mediante argumentos ni variables configurables. Puertos locales exclusivos: Auth 9199, Firestore 8188, Functions 5101, Hub 4501, Logging 4601 y websocket Firestore 8255. UI desactivada. No se expone una vista previa remota.

El launcher usa un entorno construido por lista permitida, sin VITE_*, credenciales, proxies, NODE_OPTIONS heredado o configuración Firebase productiva. HOME, USERPROFILE, APPDATA, LOCALAPPDATA, CLOUDSDK_CONFIG y XDG_CONFIG_HOME apuntan a un perfil temporal nuevo por ejecución, eliminado al terminar normalmente. No se reutilizan perfiles personales ni credenciales guardadas. Las variables se normalizan por nombre sin distinguir mayúsculas, rechazando duplicados ambiguos relevantes. Se desactiva detección de metadatos de Google (`METADATA_SERVER_DETECTION=none`) y la consulta npm de versiones durante el runtime queda offline.

Antes de iniciar clientes se exigen variables exactas del proyecto y ambos emuladores; faltantes/valores diferentes/configuración Firebase incompatible abortan. El SDK usa sólo una configuración ficticia y se enlaza a emuladores antes de cualquier operación. Conectar Auth no permite continuar si Firestore falta. La fábrica cierra la app si falla su inicialización.

`net-guard.cjs` se precarga en procesos Node del lab, CLI y workers heredados: bloquea conexiones no loopback por fetch, sockets/TLS y transportes Node; permite únicamente el patrón de sockets Unix temporales o tuberías locales Windows de la versión fijada de Functions. También valida el entorno antes de ejecutar cada proceso Node precargado. Se rechazan archivos `.env*` y `.secret.local` dentro del lab y su paquete Functions antes de iniciar emuladores. Los servidores temporales del SDK, que omiten host o solicitan wildcard, se fuerzan a 127.0.0.1. Los puertos ocupados provocan aborto, nunca cambio automático de puerto ni terminación de procesos ajenos.

Estos controles protegen los comandos del lab; **no constituyen un firewall del sistema ni un sandbox contra código hostil**. No cambian el comportamiento de `npm run dev` o del código web real, que no se debe ejecutar para esta etapa. Tampoco autorizan instalar paquetes arbitrarios o ejecutar scripts ajenos. La descarga de dependencias y del artefacto oficial ocurre separadamente del runtime local.

## Instalación reproducible

Requisitos comprobados: Node 24.19.0, Java 21.0.12.1; firebase-tools 15.30.2 del lockfile raíz. SDKs exclusivos del paquete local: firebase-functions 7.4.0 y firebase-admin 14.5.0, fijados por lockfile separado. No cambian package.json/package-lock.json raíz.

Desde la raíz del repositorio, en Linux (PowerShell en WINDOWS.md):

```sh
# Sólo si faltan las dependencias raíz: usar su lockfile, sin actualizaciones.
npm ci --cache .tools/emulator-lab/install-cache --ignore-scripts --no-audit --no-fund
# Instalación del harness, comprobada usando su lockfile y sin scripts de instalación.
npm ci --prefix mobile/emulator-lab/functions --cache .tools/emulator-lab/install-cache --ignore-scripts --no-audit --no-fund
# Artefacto oficial; Cloud tuvo un bloqueo histórico de proxy, no la validación Windows.
node mobile/emulator-lab/prepare.cjs
```

El instalador sólo descarga el JAR Firestore 1.22.0 de la URL oficial:
`https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar`.
Tamaño esperado: 136707194 bytes. SHA-256 oficial fijado:

```text
9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c
```

Valida TLS, tamaño y SHA-256 antes de instalarlo en `.tools/emulator-lab/cache/`. Nunca usa otro artefacto ni reduce la verificación. El launcher no descarga automáticamente: sin JAR válido falla antes de iniciar la suite completa.

Si otra instalación encuentra el bloqueo histórico del proxy: corregir la ruta/permiso efectivo del proxy hacia ese artefacto (el dominio ya figura en la configuración guardada), o incorporar una copia oficial del mismo JAR en la ruta indicada y verificar hash/tamaño. No se necesitan cuentas Firebase reales, secretos, facturación ni otro hosting. No se reintentará indefinidamente ni se buscarán espejos alternativos.

## Comandos

```sh
node mobile/emulator-lab/run.cjs unit
node mobile/emulator-lab/run.cjs process-test
node mobile/emulator-lab/run.cjs auth-test
# Requieren JAR: ejecutar sólo cuando prepare.cjs termine correctamente.
node mobile/emulator-lab/run.cjs test
node mobile/emulator-lab/run.cjs start
```

- `unit`: controles sin iniciar servidores; presupone puertos de lab sin servicios.
- `process-test`: pruebas de árboles de procesos y cierre, con procesos sintéticos sin Firebase. Los tres casos exclusivos de Job Objects se omiten explícitamente en Linux y deben ejecutarse en Windows.
- `auth-test`: **modo parcial explícito**, arranca sólo Auth/Functions, prueba dos clientes e invoca el backend de prueba; no afirma readiness Firestore. Cierra los procesos propios al terminar.
- `test`: suite completa con Auth/Firestore/Functions, fixtures y pruebas de infraestructura. Validada en Windows con JAR oficial verificado.
- `start`: modo interactivo completo, carga fixtures y permanece activo. Ctrl+C cierra sólo el árbol propio: grupo POSIX en Linux, Job Object en Windows. El supervisor Windows también elimina descendientes al perder el launcher o al terminar el proceso raíz. No inicia React, pantallas ni datos reales.

Los datos son efímeros: no hay importación/exportación ni migración. Parar y reiniciar elimina el estado del emulador y vuelve a cargar fixtures. Para limpiar reportes/logs generados con todos los puertos libres:

```sh
node mobile/emulator-lab/run.cjs clean
```

`clean` preserva fuentes y caché del JAR, y rehúsa ejecutarse con puertos ocupados. No borra datos remotos ni otros directorios del workspace. Los procesos deben reiniciarse en cada tarea Cloud; no se supone que sobrevivan a una restauración.

## Fixtures y dos clientes

Usuarios ficticios `lab-legacy`, `lab-instances`, `lab-empty` y `lab-blocked`, correos `@example.test` y contraseña pública de fixture. Son credenciales de prueba efímeras, no secretos productivos. Se usan email/contraseña locales, no Google real; esto no valida Google Sign-In.

Incluyen progreso legacy con writeRevision=3; instancias de Sistemas, Industrial 2023 y una archivada de Industrial 2007; cuatro estados registrados, incluido Pendiente explícito; cuenta sin trayectorias y autoridad bloqueada. Los registros son sintéticos, no copias de estudiantes.

`client.cjs` crea dos apps Firebase independientes con Auth en memoria y almacenes SDK separados. Se pueden autenticar como el mismo propietario para emular dos dispositivos, o con otro propietario para probar denegación.

El fixture de conflictos usa exclusivamente `labInfrastructure/{uid}/probes/concurrency`: dos transacciones CAS sobre revision/cursor, una ganadora y otra obsoleta. La lectura desde el segundo cliente prueba el transporte de un cursor ficticio entre clientes, **no implementa ni certifica la sesión de onboarding diseñada en A**.

`faults.cjs` permite disableNetwork/enableNetwork explícitos y descartar una respuesta después de que termine una operación. No implementa cola, sincronización automática, comprobantes ni reintentos de producto. En la suite completa se verifica que perder una respuesta no impide leer el resultado desde el otro cliente. Ese escenario pasó en Windows.

## Rules y backend de infraestructura

`lab.rules` es un archivo nuevo y exclusivo del emulador. Los clientes sólo leen sus fixtures; no pueden escribir progreso académico. Sólo se permiten escrituras con forma limitada en probes de infraestructura del propietario. No se modifican ni publican firestore.rules o variantes existentes. Estas Rules no representan las futuras Rules de integración.

El seeder puede escribir fixtures saltando Rules **únicamente** mediante la API local de rules-unit-testing, con proyecto/host fijados y guard. No es una herramienta administrativa productiva.

Functions expone sólo salud y una prueba autenticada sin escrituras. Verifica token mediante Auth Emulator y proyecto emulado. Las rutas de alta y guardado responden 501; no hay creación funcional de carreras, transacciones académicas nuevas, migraciones ni conexión a pantallas. Admin SDK está instalado por requisito del runtime y para futura infraestructura; el código del harness no inicializa un acceso administrativo remoto.

## Validación final Windows 11 Pro — 18 de octubre de 2026

| Comando run.cjs | Aprobadas | Fallidas | Omitidas | Salida |
|---|---:|---:|---:|---:|
| unit | 24 | 0 | 1 (exclusiva de Linux) | 0 |
| process-test | 6 | 0 | 0 | 0 |
| auth-test | 1 | 0 | 0 | 0 |
| test | 1 integrada | 0 | 0 | 0 |

La prueba integrada registró firestoreTested: true. Firestore Emulator 1.22.0 arrancó con el JAR oficial validado: 136707194 bytes y SHA256 9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c. Auth y Functions iniciaron mediante el wrapper nativo .cmd. Sin errores de sh, LAB_CHILD_TIMEOUT ni LAB_STARTUP_FAILED.

Los procesos propios cerraron correctamente y los seis puertos del laboratorio quedaron libres, así como los temporales comprobados (8293 en auth-test y 8369 en test). Las pruebas de procesos verificaron descendientes y preservación del proceso ajeno sintético; los puertos libres por sí solos no acreditan ausencia exhaustiva de procesos.

La integración comprobó aislamiento entre usuarios, rechazo de escritura académica, CAS con un ganador, lectura confirmada desde otro cliente, desconexión y pérdida de respuesta con resultado incierto y escritura posteriormente confirmada. El PERMISSION_DENIED del log fue un negativo esperado.

**Alcance:** infraestructura aislada con datos ficticios y Rules del laboratorio (lab.rules), NO integración académica productiva. Se cargaron fixtures legacy, trayectorias activas/archivadas y estados académicos, pero no se probaron individualmente todas sus operaciones. El guard de red Node no sustituye un firewall del sistema. La compatibilidad de Functions debe revisarse al actualizar CLI/SDK; la adaptación fijada aborta ante incompatibilidades.

No hubo despliegues ni conexiones autorizadas a Firebase real. La infraestructura B cuenta con validación automatizada Windows satisfactoria; quedan pendientes el cierre Git autorizado y la futura integración de C. Esta evidencia no acredita dispositivos físicos, Google Sign-In ni operaciones académicas productivas. Tampoco se ejecutaron aquí las comprobaciones manuales de cierre de VS Code/terminal o el arranque completo desde otro checkout con espacios/Unicode.

Los JSON existentes conservan los resultados y hashes históricos de Cloud; sus estados pendientes no describen esta validación Windows posterior. El supervisor mantiene el parche local Task.Run(() => Console.In.ReadLine()), todavía sin publicar.

## Archivos propuestos

Todos nuevos, bajo esta carpeta:

- `policy.cjs`, `net-guard.cjs`: políticas de entorno y transporte.
- `firebase.json`, `lab.rules`: configuración y permisos locales de laboratorio.
- `prepare.py`, `run.cjs`, `seed.cjs`: preparación, ejecución y fixtures.
- `fixtures.cjs`, `client.cjs`, `faults.cjs`: datos ficticios, clientes y fallos.
- `unit.test.cjs`, `auth.test.cjs`, `integration.test.cjs`: verificaciones.
- `functions/index.cjs`, `functions/package.json`, `functions/package-lock.json`: runtime backend aislado.
- `README.md`, `verification.json`: documentación y resultados.

node_modules, artefactos, credenciales y logs no se incluyen en Git. No hay commit, push, merge, despliegue o publicación de esta entrega.

## Archivos de la adaptación Windows

- Modificados: `run.cjs`, `policy.cjs`, `net-guard.cjs`, `prepare.py` (entrada opcional que delega en Node), `README.md`.
- Nuevos: `artifact.cjs`, `prepare.cjs`, `ipc.cjs`, `process-tree.cjs`, `windows-job.ps1`, `artifact.test.cjs`, `portable.test.cjs`, `process.test.cjs`, `process.fixture.cjs`, `WINDOWS.md`, `windows-verification.json`.

No cambia ningún manifiesto de dependencias, lockfile, configuración Firebase o Rules del lab. No se modifica la aplicación. No se requiere Python para Windows ni para los comandos recomendados Linux.

## Descubrimiento Functions Windows — validación nativa completada

El launcher usa `functions-cli-bootstrap.cjs` exclusivamente en Windows. La adaptación verifica Firebase CLI 15.30.2, SDK 7.4.0, sus estructuras revisadas y el wrapper npm `.cmd`. Modifica sólo `Delegate.findFunctionsBinary` dentro de ese proceso para elegir explícitamente el wrapper nativo del lab. No cambia `cross-spawn`, `node_modules`, PATH, dependencias, aislamiento ni el comportamiento Linux. Falta el wrapper o difiere su estructura: aborto, sin fallback a `sh`.

`functions-discovery.test.cjs` agrega pruebas focalizadas a `unit`: resultado actual Linux 24 aprobadas / 1 omitida Windows, total 25. La plantilla se contrastó con el generador cmd-shim del npm instalado en Cloud, sin instalar paquetes. La simulación Windows de cross-spawn no ejecuta cmd.exe ni acredita funcionamiento nativo. En Windows se obtuvieron 24 aprobadas / 1 omitida exclusivamente Linux; auth-test y test también aprobaron.

`windows-job.ps1` conserva el parche local validado de lectura stdin en segundo plano. La adaptación Functions corresponde a be0df38c; el parche del supervisor sigue sin publicar. Los resultados Windows son locales, no resultados de Cloud.
