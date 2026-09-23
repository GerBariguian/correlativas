# Validación manual local con Firebase Emulator

Infraestructura implementada y utilizada por el usuario para validar Activity con
dos sesiones ficticias: PASS, incluido el fix visual activity-sr-only. Los comandos
siguientes no se ejecutan automáticamente.
No cambia `.env`, configuración de producción ni aliases de Firebase CLI.

Etapa 5 agrega un build de mantenimiento social de producción, separado de este
modo Emulator; ver [activity-rollout.md](activity-rollout.md). No reutilizar un
deploy/configuración productiva para pruebas locales ni levantar otro runner en 8088.

## Aislamiento implementado

`npm.cmd run dev:emulator` ejecuta Vite en modo `emulator`, host 127.0.0.1,
puerto 5174 con strictPort. Firebase usa exclusivamente la configuración ficticia
fija de `src/firebaseRuntime.js`, proyecto `demo-correlativas-manual`.
Las variables VITE_FIREBASE_* no se leen en esa rama. Además Vite usa otro
prefijo público en ese modo, evitando exponer las variables VITE_* de `.env`.

Auth se inicializa con persistencia en memoria y resolver de popup, compatible
con el login Google existente. Conecta a http://127.0.0.1:9099; Firestore conecta
a 127.0.0.1:8088. Ambas conexiones ocurren síncronamente al cargar firebase.js,
antes de que sus consumidores puedan operar. No hay modo mixto ni fallback.
No se reemplaza la autenticación por mocks en la aplicación.

Modo emulator requiere DEV=true y origen http://127.0.0.1:5174. El resto de
orígenes falla antes de initializeApp. El puerto 5174 también se rechaza en modo
normal. No usar localhost como alias: abrir la URL exacta. El indicador visible
"Emulator local" depende del mismo modo validado, no de un flag independiente.
El build --mode emulator falla en la configuración Vite, y el runtime además
rechaza emulator sin DEV. El build normal no muestra el indicador.

Alcance de las protecciones: no son un firewall ni defensa contra cambios
manuales del código/config, herramientas externas o un proceso ajeno escuchando
en esos puertos. El cliente no puede imponer el --project usado por la CLI ni
comprobar por sí solo qué Rules cargó otro proceso: verificar el comando y log.
El modo normal conserva intencionalmente acceso al proyecto de `.env`; ejecutar
por error `npm.cmd run dev` en 5173 NO es una sesión de pruebas aislada.
No continuar un test sin indicador, origen y proyecto demo verificados.
Los errores de configuración son explícitos en consola y abortan inicialización.

## Arranque posterior, desde la raíz del repositorio

Cerrar servidores de pruebas que ocupen 8088. No correr `test:rules` en paralelo
con el entorno manual: comparten ese puerto. Usar dos terminales PowerShell nuevas.
No ejecutar firebase login, firebase use ni deploy. No requiere billing ni CLI global.

Terminal 1 (cambios de entorno limitados a esta terminal):

```powershell
$env:JAVA_HOME = (Resolve-Path '.tools\jdk-21.0.12.1+1-jre').Path
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:FIREBASE_EMULATORS_PATH = (Resolve-Path '.tools\firebase-emulators').Path
npx.cmd --no-install firebase-tools emulators:start --only auth,firestore --project demo-correlativas-manual --config firebase.emulators.json
```

Usa firebase-tools ya instalado. Puede descargar componentes oficiales del
Emulator que falten (por ejemplo UI); no descarga datos productivos ni requiere
credenciales reales. No usar import/export inicialmente: los datos son descartables.
Confirmar en log proyecto demo, Rules locales y puertos 9099/8088/4000.

Terminal 2:

```powershell
npm.cmd run dev:emulator
```

Abrir únicamente `http://127.0.0.1:5174`.
UI del Emulator: `http://127.0.0.1:4000` (no Firebase Console).

## Comprobar antes de crear datos

1. Ver "Emulator local" sobre la aplicación y la URL exacta con puerto 5174.
2. Comprobar que CLI/UI muestran demo-correlativas-manual, Auth y Firestore activos.
3. En DevTools/Network, las operaciones Auth/Firestore deben dirigirse a
   127.0.0.1:9099 y 127.0.0.1:8088. No continuar si esas operaciones apuntan a
   endpoints remotos. El flujo popup puede cargar recursos estáticos de Google;
   no confundirlos con autenticación o escrituras de un proyecto productivo.
4. Abrir Continuar con Google: debe aparecer el selector simulado del Auth Emulator,
   nunca el login de una cuenta Google real. Cancelar ante un flujo inesperado.
5. No introducir credenciales reales ni pegar tokens reales.

## Dos usuarios independientes

Usar dos perfiles de navegador separados (o Chrome y Edge). No dos pestañas
normales del mismo perfil. Crear identidades ficticias desde el popup simulado:
`actividad-a@example.com` y `actividad-b@example.com`, con nombres de prueba.
El flujo Google simulado conserva el provider google.com y email verificado que
exigen las Rules sociales; no sustituirlo por usuarios email/password.
Auth en memoria implica volver a entrar al recargar; el Emulator conserva las
cuentas mientras esté levantado. Elegir de nuevo la identidad simulada correcta.

Ambos completan onboarding en la misma carrera. A busca B en Amigos, envía
solicitud; B la acepta; A crea Plan conjunto invitando B. Así los avisos nacen
con los servicios reales, Rules locales y operaciones atómicas normales.
Seguir después la checklist de Etapa 4 en activity-notifications.md.

## Finalizar y volver al modo habitual

Cerrar ambas ventanas/perfiles de prueba. Ctrl+C en Vite y en Emulator, y cerrar
sus terminales dedicadas. Los cambios de JAVA_HOME/PATH/cache no son globales.
Sin exportación, los datos del Emulator son efímeros. No hay cambio en `.env`
que revertir ni tokens de prueba persistidos por Auth en el navegador.
El progreso de prueba puede haber usado el cache local existente de la app;
los perfiles de navegador separados evitan mezclarlo con sesiones habituales.

Para volver deliberadamente al comportamiento habitual:

```powershell
npm.cmd run dev
```

Este comando vuelve a usar `.env` y puede acceder a Firebase real. NO usarlo para
continuar la validación aislada. No abrir el puerto reservado 5174 en modo normal.

## Límites de validación

El Emulator NO exige ni acredita los índices compuestos remotos. El archivo local
se referencia para mantener la configuración explícita; pasar consultas locales
no demuestra que esos índices estén provisionados en producción.
https://firebase.google.com/docs/emulator-suite/connect_firestore

El usuario ya confirmó arranque conjunto, login popup y los flujos de Activity
con dos sesiones. Los tests verifican selección, conexiones invocadas, rechazo de
build y aislamiento lógico; la validación manual no se atribuye al agente. Responsive,
recorrido completo de teclado/lector y otros casos de la checklist no se consideran
aprobados manualmente por esa prueba parcial.

Registro histórico: al crear esta infraestructura pasaron sus 10 tests, Node
503/503 y Rules 191/191, sin arrancar entonces la sesión manual. Tras el fix CSS,
Node pasó 504/504 y Rules 43 Activity + 148 históricas = 191/191.

Estado Etapa 5: Node 514/514, builds normal/mantenimiento aprobados y rechazo de
build Emulator comprobado. Persiste warning conocido de chunk >500 kB. Rules
cambió para agregar el gate de despliegue: validación final completada con 232/232
(148 históricas + 43 Activity + 41 rollout/recovery), después de corregir el harness
y repetir el runner completo. Emulator cerrado correctamente. No hubo producción.
