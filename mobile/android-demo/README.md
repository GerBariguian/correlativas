# Correlativas Demo DEV — Etapa 1 Android

APK de desarrollo basado en la demo mobile aprobada, commit
`72f9dfee61124d5972c045a71f1f09dbc1234e35`.
Rama independiente: `mobile/android-demo-stage1`. No modifica el PR #4 ni main.

## Alcance

- Misma entrada React/Vite, componentes, estilos y catálogo de la demo aprobada.
- Capacitor Core/Android/CLI **8.5.3** y App **8.1.2**, fijados en el lockfile.
- Proyecto nativo en `mobile/android-demo/android`.
- Identificador exclusivo de desarrollo: **`com.correlativas.demo.dev`**.
- Nombre instalado: **Correlativas Demo DEV**; versión **0.1.0-demo**, código 1.
- Android **7.0 / API 24 o superior**, con Android System WebView actualizado.
- Sin autenticación real, Google Sign-In, Firestore, push ni llamadas a producción.
- No contiene permiso `INTERNET`; la interfaz y las dependencias web se incluyen en el APK.
- CSP `connect-src 'none'`, sin servidor remoto/live reload ni plugin Google Services.
- CapacitorHttp desactivado. El build rechaza Firebase y servicios/hooks productivos.
- Los datos son ficticios, en memoria: pausar/reanudar puede conservarlos; reiniciar
  el proceso/recargar los restaura. No se prometen sesiones ni persistencia real.
- Firma Android Debug generada localmente. No se usaron certificados de producción.
- Solo Android en esta etapa. El APK no se instala en iPhone; no se creó un proyecto iOS.

## Descargar e instalar sin Android Studio

1. Abrí la carpeta **downloads** de esta rama en GitHub y descargá
   `correlativas-demo-dev-0.1.0.apk` usando **Download raw / Descargar archivo**.
   La entrega final incluye un enlace directo al archivo de un commit inmutable.
2. Guardalo en el Android, desde su navegador o copiándolo por USB.
3. Abrí el archivo. Si Android lo solicita, permití instalar aplicaciones para
   esa fuente concreta (navegador o gestor de archivos).
4. Instalá **Correlativas Demo DEV** y abrila desde el launcher.
5. Probala también en modo avión: no necesita Internet ni una cuenta.

El SHA-256 está en `downloads/SHA256SUMS`; en una computadora se puede verificar con:

```bash
sha256sum correlativas-demo-dev-0.1.0.apk
```

PowerShell:

```powershell
Get-FileHash .\correlativas-demo-dev-0.1.0.apk -Algorithm SHA256
```

Alternativa para quienes ya usan Android Platform Tools:

```bash
adb install -r correlativas-demo-dev-0.1.0.apk
adb shell am start -n com.correlativas.demo.dev/.MainActivity
```

Para desinstalar, elegí únicamente **Correlativas Demo DEV**, o:

```bash
adb uninstall com.correlativas.demo.dev
```

Si una próxima build da `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, puede haberse creado
una firma debug nueva en otra máquina. Desinstalá esta demo y reinstalá; solo se
pierden datos ficticios. Las claves debug no se guardan en GitHub. No hay relación
con la versión web ni con una futura app publicada.

## Lista de pruebas en el teléfono físico

Registrar modelo, versión Android y versión Android System WebView/Chrome.

- Instalación y primer arranque, incluido modo avión.
- Logo/nombre DEV; Dashboard y navegación inferior sin tapar barras del sistema.
- Materias: scroll de filtros, búsqueda y estados.
- Edición: teclado numérico, nota vacía/inválida/válida, guardar, cerrar y promedio.
- Teclado con pantalla pequeña, texto ampliado y orientación horizontal.
- Mapa: deslizar años, flechas, selección, centrado y desplazamiento manual libre.
- Agregar una materia habilitada y consultar por qué otra está bloqueada.
- Comunidad: perfil, grupo existente e invitación ficticia.
- Notificaciones: cada destino, lectura individual, contador y marcar todas.
- **Atrás de Android:** cerrar primero detalle anidado, después panel, volver al
  inicio desde otra pantalla y salir desde Inicio. Con el teclado abierto,
  comprobar también su cierre por el sistema.
- Segundo plano/reanudación, bloqueo/desbloqueo, cierre y nuevo arranque.
- Reiniciar demo y verificar estados y notas iniciales.

El botón Atrás se integra con Capacitor App. Las pruebas de Chromium simulan su
puente nativo; no equivalen a instalar o ejecutar el APK en Android. Esta fase
necesita tu validación física de WebView, teclado, barras del sistema y lifecycle.

## Informar un error

Copiá este formato en el seguimiento de esta rama (sin mezclarlo con el PR #4):

```text
Build/commit y SHA-256 del APK:
Modelo de teléfono:
Android:
Android System WebView / Chrome:
Pantalla y orientación:
Pasos exactos (desde Reiniciar demo):
Resultado esperado:
Resultado observado:
¿Sucede en modo avión?:
¿Sucede tras cerrar y abrir la app?:
Captura o video:
```

Para diagnóstico opcional por USB, habilitá depuración USB y capturá mientras
reproducís el problema:

```bash
adb logcat -v time Capacitor/Console:V AndroidRuntime:E chromium:E '*:S'
```

## Compilar en Codex Cloud

Desde `/workspace/correlativas`:

```bash
source scripts/android-env.sh
npm ci --no-audit --no-fund
bash scripts/android-setup.sh
npm run mobile:apk
```

`android-env.sh` prepara Node (si está en la ruta Cloud guardada), el JDK y las
rutas de SDK/caché dentro de `/workspace/android-tooling`. Propaga el proxy estándar
al tooling Java y reutiliza el almacén de CAs del sistema cuando está disponible,
sin desactivar TLS. `android-setup.sh` instala el SDK oficial, valida el checksum
publicado de las herramientas y, si falta `javac`, instala Temurin JDK 21.0.12.1+1
verificando su SHA-256 oficial.

La compilación usa SDK/target 36, Build Tools 36.0.0, Gradle 8.14.3 con checksum,
dos workers y firma debug en `.tools/android-signing/debug.keystore` (ignorada).
El script ejecuta build/sync, `assembleDebug`, `testDebugUnitTest`, `lintDebug` y
verificación del APK. Nunca ejecuta tareas de publicación o firma release.

Salida: `.tools/android-artifacts/correlativas-demo-dev-0.1.0.apk` y reportes.
El verificador usa `apksigner`, `aapt` y ZIP para comprobar firma, identificador,
versión, permiso de Internet ausente, CSP y coincidencia de assets con el build.

No hacen falta Android Studio, Firebase, Vercel ni credenciales de producción.
Se requieren descargas de npm, GitHub/Temurin, dl.google.com, downloads.gradle.org
y los repositorios Maven oficiales. No se creó otra infraestructura de compilación.

## Pruebas web y navegación

```bash
npm test
npm run build
node node_modules/vite/bin/vite.js build --config prototypes/mobile-app/vite.config.mjs
node prototypes/mobile-app/smoke.mjs
npm run mobile:build
node prototypes/mobile-app/smoke.mjs --android
```

La variante Android comparte la UI y agrega solamente la integración de Atrás y
la presentación de app sin el marco promocional de escritorio. El comando web
normal conserva su entrada/configuración original.

`testDebugUnitTest` puede informar NO-SOURCE: no se describe como una suite nativa
aprobada. Las pruebas que sí ejercitan navegación son las de Chromium; la prueba
instrumentada en un Android físico queda explícitamente pendiente.

## Evidencia de esta entrega

- Instalación congelada con `npm ci`: **847 paquetes**, lockfile conservado.
- Ensamblado debug + Android Lint correctos; **0 errores y 19 advertencias** de
  manifiesto, recursos/íconos heredados y metadatos de plantilla. No se suprimieron errores.
- Recompilación después de reinstalar dependencias: correcta y **mismo SHA-256** del APK.
- **1108** pruebas Node y **5** de ci-plan aprobadas.
- Build web y build de la demo aprobados.
- **122** comprobaciones de la demo y **130** del bundle Android en Chromium,
  sin solicitudes externas ni errores JavaScript, a 320/390/430/1280 px.
- Atrás de Android comprobado con **puente nativo simulado**, no dispositivo.
- Firma debug v2 verificada; assets del APK coinciden byte a byte con el build;
  sin permiso INTERNET ni binding al proyecto Firebase productivo.
- Ejemplos triviales de JUnit/instrumentación de la plantilla eliminados;
  `testDebugUnitTest` informa NO-SOURCE. No hay afirmación de prueba nativa funcional.
- Instalación y ejecución en Android físico: **pendientes** de tu validación.

Los reportes descargables están junto al APK en `downloads/`.
