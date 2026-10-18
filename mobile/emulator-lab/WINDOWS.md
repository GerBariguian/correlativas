# Windows 11 nativo — Mobile 2.4.4 B

Implementación preparada desde `e58a56d05087653fc09238c764ba0b2ba381f454`, exclusivamente en `mobile/stage2-4-4-b-emulator-infrastructure`. **Infraestructura validada en Windows 11 Pro; ver evidencia final y límites abajo.** No es una implementación del guardado académico ni del alta de carreras.

## Requisitos

Windows 11 Pro, VS Code, Node 24 (Cloud comprobado con 24.19.0), JDK 21 y Windows PowerShell 5.1 incluido en Windows. No requiere WSL, Python, Firebase CLI global, sesión Google, cuentas reales, permisos de administrador ni cambios de ExecutionPolicy. Deben existir `node`, `npm.cmd` y `java` en PATH; revisar JAVA_HOME si hay varios Java. No cambiar versiones de dependencias ni lockfiles.

PowerShell compila un pequeño supervisor C# local mediante Add-Type y llama a las APIs de Windows Job Objects. Si políticas corporativas, Constrained Language, AppLocker o el entorno de jobs impiden hacerlo, el launcher debe abortar: no desactivar políticas para lograr que arranque. Informar el error para revisión.

## Preparación en VS Code / PowerShell

Estos comandos documentan la reproducción autorizada. Functions está publicado en be0df38c; el parche local del supervisor aún no está publicado. Abrir una copia del repositorio en la rama indicada, sin tocar main ni ejecutar la web real. Guardar cambios ajenos antes de cambiar de rama. Desde la raíz:

```powershell
node --version
java -version
# Instalación sólo si faltan dependencias: lockfiles existentes, sin scripts ni updates.
npm.cmd ci --cache .tools/emulator-lab/install-cache --ignore-scripts --no-audit --no-fund
npm.cmd ci --prefix mobile/emulator-lab/functions --cache .tools/emulator-lab/install-cache --ignore-scripts --no-audit --no-fund
node mobile/emulator-lab/prepare.cjs
if ($LASTEXITCODE -ne 0) { throw 'No continuar: JAR oficial no verificado' }
```

Se usa npm.cmd para evitar depender de la política de ejecución de npm.ps1. No ejecutar `firebase login`, `gcloud auth`, despliegues o `npm run dev`. Las descargas de instalación usan sus repositorios oficiales y ocurren separadas del runtime aislado. No copiar .env, cuentas, tokens ni perfiles a la carpeta del lab.

El preparador usa HTTPS de Node, TLS verificado (también a través del proxy configurado por el sistema de ejecución), sin redirecciones ni URLs configurables. Descarga un temporal exclusivo, valida tamaño y hash y sólo entonces lo renombra. Elimina el temporal tras fallo. La caché existente también se verifica; un JAR existente incorrecto provoca rechazo y requiere revisión, no sustitución silenciosa.

Artifact obligatorio: Firestore 1.22.0, 136707194 bytes, SHA-256:

```text
9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c
```

Fuente única: https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar

Si Windows también recibe 403, no buscar mirrors ni usar otro JAR: informar el bloqueo. Una copia manual sólo sirve si proviene del mismo artefacto oficial y pasa estas mismas verificaciones. El launcher nunca descarga por su cuenta ni inicia Firestore sin JAR válido.

## Pruebas en Windows

Ejecutar secuencialmente, comprobando código cero en cada comando. No ejecutar suites simultáneamente: los puertos son deliberadamente fijos.

```powershell
node mobile/emulator-lab/run.cjs unit
if ($LASTEXITCODE -ne 0) { throw 'Falló unit' }
node mobile/emulator-lab/run.cjs process-test
if ($LASTEXITCODE -ne 0) { throw 'Falló process-test' }
node mobile/emulator-lab/run.cjs auth-test
if ($LASTEXITCODE -ne 0) { throw 'Falló Auth/Functions' }
node mobile/emulator-lab/run.cjs test
if ($LASTEXITCODE -ne 0) { throw 'Falló la suite completa; B sigue abierta' }
```

Resultado obtenido en Windows con la corrección de descubrimiento: unit 24 aprobadas y 1 omitida exclusivamente Linux (25 casos); process-test 6 aprobadas **sin skips en Windows**; auth-test 1 aprobada. Las 16 pruebas anteriores siguen incluidas; los nueve casos nuevos cubren el bootstrap y el selector. La suite completa debe ejecutar realmente todas sus pruebas Firestore, no basta con arrancar servidores. La ejecución local posterior acreditó estos resultados y test: 1 aprobada, sin omisiones, código 0.

- `unit`: casos originales más tuberías locales/remotas, rutas con espacios y Unicode, preload, variables con diferentes mayúsculas, TLS obligatorio, tamaño/hash incorrectos, redirecciones rechazadas, destinos externos bloqueados y puerto ocupado sin terminar su propietario.
- `process-test`: cierre normal/idempotente, proceso ajeno preservado, salida de error, timeout y los tres casos Windows: raíz que termina inesperadamente, muerte del launcher propietario y muerte forzada del supervisor. Cada caso comprueba desaparición de los procesos sintéticos conocidos.
- `auth-test`: parcial explícita, dos clientes y backend ficticio, **no prueba Firestore**.
- `test`: fixtures legacy/trayectorias, permisos, clientes concurrentes, desconexión y pérdida de respuesta existentes. No añade funcionalidades académicas.

Repetir también desde una ruta de checkout con espacios y caracteres no ASCII. La prueba automática de preload cubre una ruta temporal de ese tipo; no sustituye el arranque completo desde dicho checkout.

## Cierre y comprobaciones manuales obligatorias

Con JAR verificado:

```powershell
node mobile/emulator-lab/run.cjs start
```

Esperar `LAB READY`. En ejecuciones separadas probar: Ctrl+C, cerrar la terminal de VS Code y cerrar VS Code. La suite automática simula muerte del propietario y del supervisor; no certifica el comportamiento exacto de la terminal/antivirus de cada computadora. Comprobar que no sobreviven procesos Java/Node/PowerShell **de esa ejecución** ni listeners del lab. No terminar procesos por nombre.

Consulta local orientativa, no termina procesos:

```powershell
$labPorts = 9199,8188,5101,4501,4601,8255
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in $labPorts } |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Mientras funciona sólo deberían aparecer listeners de lab en 127.0.0.1; tras detenerlo no debe quedar ninguno. Revisar también el proceso de descubrimiento Functions, que puede usar un puerto dinámico local. Un puerto libre no demuestra por sí solo ausencia de procesos huérfanos: conservar los PID del proceso raíz y descendientes durante la prueba manual. Los tests sintéticos sí verifican PID conocidos.

Si Windows pide ampliar acceso por firewall, **no abrir redes públicas ni desactivar el firewall**. Detener y revisar. No se necesitan conexiones entrantes externas.

```powershell
node mobile/emulator-lab/run.cjs clean
```

`clean` exige puertos libres; preserva el JAR y fuentes. Los datos del emulador son efímeros; no hay exportaciones, importaciones de cuentas reales ni migraciones. Los perfiles temporales se eliminan al finalizar normalmente; después de matar el launcher puede quedar una carpeta `home-*` ficticia ignorada, que jamás se reutiliza automáticamente.

## Controles y arquitectura

- Proyecto y endpoints fijos; no hay argumentos para reemplazarlos.
- Entorno mínimo por lista permitida y directorios personales nuevos por ejecución. Se excluyen configuración, proxies y credenciales del usuario en runtime. Duplicados relevantes ambiguos provocan aborto.
- Preload heredado por CLI y workers, correctamente escapado para rutas Windows. Valida entorno y bloquea transportes Node externos. Unix sólo permite el socket exacto del CLI en os.tmpdir(); Windows sólo permite `\\?\pipe\fire_emu_<16 hex>`, nunca tuberías de equipos remotos o namespaces genéricos.
- Windows: supervisor PowerShell propio, fuente local `windows-job.ps1` pasada como EncodedCommand UTF-16LE para evitar interpretaciones de rutas/C#; no modifica ExecutionPolicy ni ejecuta blobs remotos. El proceso Node comienza suspendido, se asigna al Job Object con KILL_ON_JOB_CLOSE y recién entonces se reanuda. Si no puede asignarse, se termina antes de ejecutarse. No usa taskkill global, nombres de procesos ni puertos para matar procesos.
- La entrada estándar del supervisor pertenece al launcher; su cierre o muerte provoca el cierre del job. El proceso hijo recibe NUL como stdin. La muerte del supervisor cierra el último handle del job y elimina descendientes. La salida de la raíz también cierra el job. Job Objects limitan ciclo de vida, **no son un sandbox de red**.
- Linux conserva grupos de procesos propios SIGTERM/SIGKILL y los controles compartidos. No se promete supervivencia segura ante SIGKILL del launcher Linux: la cobertura de muerte forzada del propietario corresponde al nuevo backend Windows.
- Ningún control Node constituye un firewall del sistema; tampoco intercepta transportes Java. Firestore se limita por configuración fija demo/loopback y por el artefacto oficial. Esto no es un sandbox contra código hostil ni una auditoría completa de seguridad.

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

## Corrección del descubrimiento de Functions (be0df38c)

Base publicada: `5532a8bc19c6d23ab49b2d2f1b0d66d602bad620`. El usuario informó 16/16 unitarias y 6/6 procesos en Windows con una corrección local del supervisor. **Esa corrección está presente localmente, validada y todavía sin publicar**. `windows-job.ps1` no se modifica en esta entrega; no sustituirlo por la copia publicada al preparar la prueba local.

El CLI construye una ruta sin extensión para `firebase-functions`. Cross-spawn puede resolver `.cmd`, pero también interpreta shebangs: si selecciona el wrapper Unix puede intentar `sh`. La simulación reproduce ese mecanismo; no demuestra todavía por qué la instalación Windows concreta eligió ese archivo.

### Adaptación acotada

- `run.cjs` conserva la entrada normal de Firebase CLI en Linux. Sólo Windows usa el nuevo bootstrap, dentro del Job Object existente y con el mismo preload de red.
- El bootstrap acepta exclusivamente los argumentos fijos del launcher para Auth/Functions o Auth/Firestore/Functions, proyecto `demo-correlativas-244b`, configuración del lab y modo no interactivo. No sirve para deploy ni otros comandos.
- Antes de arrancar valida CLI 15.30.2, SDK 7.4.0, ruta del bin declarada, SHA-256 del módulo Delegate y del bin del SDK, y estructura del método revisado. Los hashes fijados corresponden a los paquetes instalados del lockfile. No se recalculan para aceptar paquetes distintos.
- Exige el wrapper `.cmd` estándar npm que apunta a `..\firebase-functions\lib\bin\firebase-functions.js`, archivo regular y dentro del lab. También debe existir el wrapper sin extensión que espera el selector original. Sólo acepta la plantilla revisada, con LF o CRLF; no comandos añadidos, otro destino, enlaces o `node.exe` alternativo en `.bin`. Una variante legítima de npm no reconocida debe revisarse, no aceptarse automáticamente.
- Únicamente reemplaza el selector `Delegate.findFunctionsBinary` en memoria; comprueba proyecto, runtime, directorio del proyecto y Functions antes de devolver `.cmd`. Rutas de fallback fuera del lab se rechazan. No parchea child_process, cross-spawn o archivos instalados.
- El `.cmd` se ejecuta mediante el manejo Windows ya existente de cross-spawn/cmd.exe, no mediante Git Bash, WSL o `shell:true` global. No cambia PATH ni afloja el guard de red, el supervisor o las verificaciones del JAR.
- Mensaje de aceptación: `[lab] Windows Functions discovery: verified .cmd wrapper, Firebase CLI 15.30.2`. Un error de validación impide cargar el CLI.

### Procedimiento histórico de incorporación y repetición

1. Mantener una copia externa de `windows-job.ps1` corregido, por ejemplo mediante VS Code, y revisar su diff contra la base publicada. No descartarlo, no hacer reset ni reemplazar la carpeta completa.
2. Cuando se autorice publicar esta entrega, incorporar sólo sus archivos en la misma rama. Como esta entrega no cambia el supervisor, su modificación local debe conservarse. Si Git reporta cualquier conflicto, detenerse y revisarlo antes de resolver.
3. Comprobar nuevamente el diff del supervisor: debe ser exactamente la corrección local ya probada. No afirmar correspondencia con una versión remota hasta que ese parche también se revise y publique con autorización separada.
4. Ejecutar secuencialmente `unit`, `process-test` y `auth-test` con los comandos anteriores. En `unit`, la prueba nativa valida y selecciona el `.cmd` real instalado; no simula su existencia. Guardar el error exacto si falla, sin editar el wrapper instalado para hacerlo pasar.
5. Conservar los logs locales y verificar que `auth-test` llegue a descubrir `backendHarness`, ejecute la prueba y libere los puertos. Probar también checkout con espacios/Unicode y cierre con Ctrl+C. No basta el mensaje del bootstrap.
6. Sólo con JAR oficial verificado ejecutar `test`. La corrección no resuelve el bloqueo de descarga Cloud; la ejecución Windows posterior con JAR verificado sí validó la infraestructura Firestore.

Evidencia histórica de Cloud (anterior a la validación Windows): unit 24 aprobadas / 1 nativa Windows omitida; process-test 3 aprobadas / 3 Windows omitidas; auth-test 1 aprobada. No se ejecutaron cmd.exe, el bootstrap nativo, PowerShell o Job Objects Windows. Informe de esta corrección: `functions-discovery-verification.json`; los informes anteriores son históricos.
