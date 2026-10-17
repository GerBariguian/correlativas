# Mobile 2.4.4 B — Infraestructura Firebase local

Rama independiente: `mobile/stage2-4-4-b-emulator-infrastructure`, base `b6e17b3f69d5139c06c16b3d30542d8e8bc85f92`.

**Estado: parcial. Auth y Functions comprobados; Firestore pendiente por descarga oficial bloqueada (403 del proxy, también en el reintento único autorizado). No aprobar B como entorno completo todavía.**

## Alcance y aislamiento

Proyecto fijo `demo-correlativas-244b`. No acepta proyecto, host o URL mediante argumentos ni variables configurables. Puertos locales exclusivos: Auth 9199, Firestore 8188, Functions 5101, Hub 4501, Logging 4601 y websocket Firestore 8255. UI desactivada. No se expone una vista previa remota.

El launcher usa un entorno construido por lista permitida, sin VITE_*, credenciales, proxies, NODE_OPTIONS heredado o configuración Firebase productiva. XDG_CONFIG_HOME es un directorio local nuevo. Se desactiva detección de metadatos de Google (`METADATA_SERVER_DETECTION=none`) y la consulta npm de versiones durante el runtime queda offline.

Antes de iniciar clientes se exigen variables exactas del proyecto y ambos emuladores; faltantes/valores diferentes/configuración Firebase incompatible abortan. El SDK usa sólo una configuración ficticia y se enlaza a emuladores antes de cualquier operación. Conectar Auth no permite continuar si Firestore falta. La fábrica cierra la app si falla su inicialización.

`net-guard.cjs` se precarga en procesos Node del lab, CLI y workers heredados: bloquea conexiones no loopback por fetch, sockets/TLS y transportes Node; permite únicamente el patrón de sockets Unix temporales que usa Functions. Los servidores temporales del SDK, que omiten host o solicitan wildcard, se fuerzan a 127.0.0.1. Los puertos ocupados provocan aborto, nunca cambio automático de puerto ni terminación de procesos ajenos.

Estos controles protegen los comandos del lab; **no constituyen un firewall del sistema ni un sandbox contra código hostil**. No cambian el comportamiento de `npm run dev` o del código web real, que no se debe ejecutar para esta etapa. Tampoco autorizan instalar paquetes arbitrarios o ejecutar scripts ajenos. La descarga de dependencias y del artefacto oficial ocurre separadamente del runtime local.

## Instalación reproducible

Requisitos comprobados: Node 24.19.0, Java 21.0.12.1; firebase-tools 15.30.2 del lockfile raíz. SDKs exclusivos del paquete local: firebase-functions 7.4.0 y firebase-admin 14.5.0, fijados por lockfile separado. No cambian package.json/package-lock.json raíz.

Desde `/workspace/correlativas`:

```sh
# Sólo si faltan las dependencias raíz: usar su lockfile, sin actualizaciones.
npm ci --cache /workspace/.npm-cache --ignore-scripts --no-audit --no-fund
# Instalación del harness, comprobada usando su lockfile y sin scripts de instalación.
npm ci --prefix mobile/emulator-lab/functions --cache /workspace/.npm-cache --ignore-scripts --no-audit --no-fund
# Artefacto oficial; actualmente este paso está bloqueado por el proxy.
python3 mobile/emulator-lab/prepare.py
```

El instalador sólo descarga el JAR Firestore 1.22.0 de la URL oficial:
`https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar`.
Tamaño esperado: 136707194 bytes. SHA-256 oficial fijado:

```text
9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c
```

Valida TLS, tamaño y SHA-256 antes de instalarlo en `.tools/emulator-lab/cache/`. Nunca usa otro artefacto ni reduce la verificación. El launcher no descarga automáticamente: sin JAR válido falla antes de iniciar la suite completa.

Para desbloquear: corregir la ruta/permiso efectivo del proxy hacia ese artefacto (el dominio ya figura en la configuración guardada), o incorporar una copia oficial del mismo JAR en la ruta indicada y verificar hash/tamaño. No se necesitan cuentas Firebase reales, secretos, facturación ni otro hosting. No se reintentará indefinidamente ni se buscarán espejos alternativos.

## Comandos

```sh
node mobile/emulator-lab/run.cjs unit
node mobile/emulator-lab/run.cjs auth-test
# Requieren JAR: ejecutar sólo cuando prepare.py termine correctamente.
node mobile/emulator-lab/run.cjs test
node mobile/emulator-lab/run.cjs start
```

- `unit`: controles sin iniciar servidores; presupone puertos de lab sin servicios.
- `auth-test`: **modo parcial explícito**, arranca sólo Auth/Functions, prueba dos clientes e invoca el backend de prueba; no afirma readiness Firestore. Cierra los procesos propios al terminar.
- `test`: suite completa con Auth/Firestore/Functions, fixtures y pruebas de infraestructura. Pendiente de ejecución real por el JAR.
- `start`: modo interactivo completo, carga fixtures y permanece activo. Ctrl+C cierra sólo el grupo de procesos creado. No inicia React, pantallas ni datos reales.

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

`faults.cjs` permite disableNetwork/enableNetwork explícitos y descartar una respuesta después de que termine una operación. No implementa cola, sincronización automática, comprobantes ni reintentos de producto. En la suite completa se verifica que perder una respuesta no impide leer el resultado desde el otro cliente. Ese escenario sigue pendiente de Firestore.

## Rules y backend de infraestructura

`lab.rules` es un archivo nuevo y exclusivo del emulador. Los clientes sólo leen sus fixtures; no pueden escribir progreso académico. Sólo se permiten escrituras con forma limitada en probes de infraestructura del propietario. No se modifican ni publican firestore.rules o variantes existentes. Estas Rules no representan las futuras Rules de integración.

El seeder puede escribir fixtures saltando Rules **únicamente** mediante la API local de rules-unit-testing, con proyecto/host fijados y guard. No es una herramienta administrativa productiva.

Functions expone sólo salud y una prueba autenticada sin escrituras. Verifica token mediante Auth Emulator y proyecto emulado. Las rutas de alta y guardado responden 501; no hay creación funcional de carreras, transacciones académicas nuevas, migraciones ni conexión a pantallas. Admin SDK está instalado por requisito del runtime y para futura infraestructura; el código del harness no inicializa un acceso administrativo remoto.

## Resultados y limitaciones

Resultados finales y archivos: `verification.json`.

- Tests unitarios de aislamiento: 7 aprobados, sin skips.
- Prueba funcional Auth/Functions: 1 aprobada, con dos clientes independientes, logout aislado, rechazo de tokens ausentes/inválidos, probe autenticado y rutas funcionales no implementadas.
- Instalación congelada del paquete Functions ejecutada correctamente. npm audit de ese paquete aislado: cero vulnerabilidades reportadas; no es una auditoría del repositorio completo ni del código.
- `run.cjs test`: aborto esperado con `LAB_FIRESTORE_ARTIFACT_MISSING`; **la prueba Firestore no se ejecutó y no cuenta como aprobada**.
- Fixtures Firestore revisados estáticamente; carga, Rules, CAS concurrente, desconexión real y continuidad documental quedan pendientes.

Durante la preparación se corrigieron: detección automática de metadatos, bloqueo inicial de IPC local de Functions, diferencia entre error vacío y error real en importación de fixtures Auth, y binding temporal wildcard del SDK. Se repitieron los checks afectados después de corregirlos.

No se ejecutan suites web ni builds móviles: no hay cambios en esos componentes. No se asegura equivalencia con dispositivos físicos o SDK nativos. No se inicia C-H. B permanece abierta hasta probar el arranque completo y la suite Firestore.

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
