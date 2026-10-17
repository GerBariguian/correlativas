# Windows 11 nativo — Mobile 2.4.4 B

Implementación preparada desde `e58a56d05087653fc09238c764ba0b2ba381f454`, exclusivamente en `mobile/stage2-4-4-b-emulator-infrastructure`. **No validada todavía en una máquina Windows. B permanece abierta por Firestore y por aceptación Windows.** No es una implementación del guardado académico ni del alta de carreras.

## Requisitos

Windows 11 Pro, VS Code, Node 24 (Cloud comprobado con 24.19.0), JDK 21 y Windows PowerShell 5.1 incluido en Windows. No requiere WSL, Python, Firebase CLI global, sesión Google, cuentas reales, permisos de administrador ni cambios de ExecutionPolicy. Deben existir `node`, `npm.cmd` y `java` en PATH; revisar JAVA_HOME si hay varios Java. No cambiar versiones de dependencias ni lockfiles.

PowerShell compila un pequeño supervisor C# local mediante Add-Type y llama a las APIs de Windows Job Objects. Si políticas corporativas, Constrained Language, AppLocker o el entorno de jobs impiden hacerlo, el launcher debe abortar: no desactivar políticas para lograr que arranque. Informar el error para revisión.

## Preparación en VS Code / PowerShell

Estos comandos se ejecutarán **después de autorizar y publicar esta adaptación**; actualmente no se hizo commit ni push. Abrir una copia del repositorio en la rama indicada, sin tocar main ni ejecutar la web real. Guardar cambios ajenos antes de cambiar de rama. Desde la raíz:

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

Resultado esperado de la versión actual: unit 16 aprobadas sin skips; process-test 6 aprobadas **sin skips en Windows**; auth-test 1 aprobada. La suite completa debe ejecutar realmente todas sus pruebas Firestore, no basta con arrancar servidores. Los reportes actuales de Cloud no acreditan esos resultados Windows.

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

## Estado de aceptación

Cloud Linux: unit 16 aprobadas; process-test 3 aprobadas y 3 omitidas explícitamente por ser Windows; Auth/Functions 1 aprobada. JAR rechazado por proxy 403; suite completa aborta con ARTIFACT_MISSING. No se ejecutaron pruebas Firestore ni C# ni PowerShell Windows. Falta confirmar layout P/Invoke, permisos de handles, jobs anidados, tuberías y cierre real en Windows 11, además de la suite completa y las comprobaciones manuales anteriores.

No cerrar B ni iniciar otra subetapa hasta revisar esa evidencia. No hay cambios de dependencias, Rules, Firebase real, web ni pantallas móviles.
