# C1: entrada local aislada
Sin datos académicos, autenticación de usuario ni escrituras. Cliente separado con Auth y Firestore en memoria; la UI no recibe db/auth ni APIs de escritura.
Proyecto fijo demo-correlativas-244b, Auth 9199 y Firestore 8188, exclusivamente 127.0.0.1. Functions no es necesario. Puerto de entrada 5187, separado del prototipo aprobado 5186.
Desde la raíz: node node_modules/vite/bin/vite.js --config mobile/read-only-integration/vite.config.mjs
Abrir http://127.0.0.1:5187. Conectar sólo comprueba disponibilidad HTTP y configura el SDK, sin login ni consultas académicas. Sin B activo muestra error antes de inicializar el SDK. Revisa disponibilidad cada 5 segundos; no es una garantía continua ni prueba de identidad criptográfica del servicio local.
Con B iniciado por su procedimiento autorizado, conectar/desconectar. No se inicia B automáticamente. La CSP permite únicamente los dos endpoints Emulator; no hay fallback ni configuración de entorno productiva. No se autoriza persistencia académica ni de sesión; existe la excepción técnica de heartbeat documentada abajo. El control de módulos rechaza fuentes externas a C1; permite dependencias instaladas. No es un firewall del sistema.
Tests: node --test mobile/read-only-integration/isolation.test.mjs
Build: node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.config.mjs
C2 implementada como capacidad separada, pendiente de validación SDK/Emulator. C3-C5 no implementados. No importar esta entrada desde la Web productiva. No desplegar.

## Validación manual sin cliente de desarrollo Vite
Ejecutar el build indicado arriba. Detener únicamente el servidor C1 propio antes de ejecutar:

`node node_modules/vite/bin/vite.js preview --config mobile/read-only-integration/vite.config.mjs`

Se conserva http://127.0.0.1:5187 y la misma CSP. Preview no inyecta el cliente WebSocket de desarrollo. El descubrimiento opcional de DevTools permanece bloqueado. El favicon es embebido. «Laboratorio disponible · cliente configurado» acredita disponibilidad HTTP y configuración local del SDK, no autenticación ni lecturas académicas.

## Validación manual acreditada — Chrome en Windows, 18 de octubre de 2026

Resultados observados y confirmados por el usuario:

- Auth en http://127.0.0.1:9199/: GET 200.
- Firestore en http://127.0.0.1:8188/: GET 200.
- Estado «Laboratorio disponible · cliente configurado» correcto.
- Local Storage y Session Storage vacíos.
- IndexedDB: firebase-heartbeat-database con dos registros técnicos observados.
- Al detener B, C1 mostró «Error: laboratorio desconectado» sin recargar.
- Vite preview eliminó los errores de WebSocket y favicon.
- Permanece el bloqueo CSP del descubrimiento opcional de Chrome DevTools. No se amplió connect-src para permitirlo.

### Excepción técnica aprobada

Se acepta únicamente el almacenamiento interno de heartbeat de Firebase App. Es independiente de la persistencia de Auth y de la caché Firestore. En la versión instalada, su esquema contiene fechas e información técnica de componentes del SDK, con clave asociada al nombre de la app y appId. No se autoriza persistencia académica ni de sesiones. Auth conserva inMemoryPersistence y Firestore memoryLocalCache; no se parchea el SDK ni se borra automáticamente la base.

La presencia de esta base impide afirmar «cero persistencia en el navegador». Los dos registros fueron observados manualmente; este documento no reproduce ni inventa su contenido. No se modificaron CSP, permisos ni controles de aislamiento para aceptar la excepción.

### Alcance del cierre C1

Se acreditan disponibilidad HTTP de ambos emuladores, configuración del cliente, estados de interfaz y detección de pérdida del laboratorio. NO se acreditaron autenticación, lecturas académicas mediante SDK ni una auditoría completa de ausencia de tráfico remoto. La configuración y la CSP restringen los destinos, pero no sustituyen esa auditoría ni un firewall del sistema.

C1 está lista para cierre dentro de este alcance limitado y con la excepción de heartbeat aprobada. Esta validación histórica no acredita C2; ver el alcance y las limitaciones de C2 al final de este documento. No hubo publicación, migración ni modificación de Firebase productivo durante esta validación.

## C2: repositorio académico de lectura aislado

Implementación local con validación SDK/Emulator real automatizada. Ver [VALIDATION-C2.md](VALIDATION-C2.md) para casos acreditados, reproducción y límites.
No incorpora C3–C5 ni cambia la interfaz C1. No publicar.

- `academicClient.mjs`: `connectAcademicLab(uid)` admite exclusivamente usuarios ficticios de B: lab-legacy, lab-instances, lab-empty y lab-blocked. Autentica con la credencial ficticia de B; expone únicamente `readProgress(scope)` y `close()`. Cerrar elimina la app y revoca sus lecturas.
- Scope obligatorio completo: `{ uid, model: 'legacy' | 'instances', id, catalogId }`. Se copia y congela; no se deriva desde una selección global ni se comparte caché entre contextos.
- Resultados explícitos: loaded, absent, error, archived y blocked. Un error nunca equivale a ausencia. Autoridad, catálogo, sesión y lifecycle se comprueban antes de entregar progreso. No se sustituye un modelo o contexto por otro.
- Legacy usa `users/{uid}/careers/{id}`; instances usa metadata en `users/{uid}/careerInstances/{id}` y progreso en `academic/progress`. El control de autoridad se lee de `migrationUsers/{uid}`. Los catálogos se conservan como identidad, sin descargar catálogos ni implementar proyecciones o planificación.
- Se reutilizan `academicBridgeRepository.loadProgress` y `legacyOnboardingRepository.load`, con db/auth inyectados. Los factories existentes contienen escritores; la fachada nunca los invoca ni los expone. No se implementa ninguna escritura académica nueva.
- `contractImports.mjs` contiene la lista cerrada de diez módulos reutilizados de src. Su grafo no inicializa Firebase productivo. El control Vite admite solamente esos módulos, esta carpeta y dependencias instaladas. La CSP C1 permanece igual.
- Proyecto demo y destinos loopback fijos, sin fallback remoto. Auth en memoria y Firestore memoryLocalCache. Se mantiene exclusivamente la excepción técnica de heartbeat documentada en C1. No se guardan datos académicos ni sesiones en almacenamiento del navegador.
- No se inicia, limpia ni siembra B. Las fixtures existentes deben estar preparadas por su procedimiento autorizado.

Validación sin instalar dependencias:

`node --test mobile/read-only-integration/isolation.test.mjs mobile/read-only-integration/academicRead.test.mjs mobile/read-only-integration/academicDecoders.test.mjs`

Incluye control del grafo de imports, aislamiento y decoders existentes ejecutados con snapshots ficticios. El doble Firestore rechaza transacciones/escrituras; no constituye una prueba de integración con el SDK real.

Builds cuando estén disponibles las dependencias del proyecto:

`node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.config.mjs`

`node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c2.config.mjs`

El segundo build incorpora la capacidad C2 sin conectarla a la UI de C1. Ambos builds pasaron con las dependencias instaladas por el usuario. La validación real contra B y el control de destinos del proceso de tests se documentan en VALIDATION-C2.md; no constituyen una auditoría del navegador. Las comprobaciones previas/posteriores no son una transacción: no garantizan snapshot atómico ante cambios concurrentes transitorios.

## C3: consumo seguro y sesión local

Los controladores, el hook React y su contrato se describen en [C3-DESIGN.md](C3-DESIGN.md). La evidencia y los límites están en [VALIDATION-C3.md](VALIDATION-C3.md). C3 mantiene lecturas puntuales, identidad académica completa y actualización manual; no incorpora listeners Firestore, polling ni cambios al contrato C2. La UI de C1 no se conecta automáticamente a C3. C4 y C5 siguen fuera de alcance.
