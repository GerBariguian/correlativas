# C1: entrada local aislada
Sin datos académicos, autenticación de usuario ni escrituras. Cliente separado con Auth y Firestore en memoria; la UI no recibe db/auth ni APIs de escritura.
Proyecto fijo demo-correlativas-244b, Auth 9199 y Firestore 8188, exclusivamente 127.0.0.1. Functions no es necesario. Puerto de entrada 5187, separado del prototipo aprobado 5186.
Desde la raíz: node node_modules/vite/bin/vite.js --config mobile/read-only-integration/vite.config.mjs
Abrir http://127.0.0.1:5187. Conectar sólo comprueba disponibilidad HTTP y configura el SDK, sin login ni consultas académicas. Sin B activo muestra error antes de inicializar el SDK. Revisa disponibilidad cada 5 segundos; no es una garantía continua ni prueba de identidad criptográfica del servicio local.
Con B iniciado por su procedimiento autorizado, conectar/desconectar. No se inicia B automáticamente. La CSP permite únicamente los dos endpoints Emulator; no hay fallback ni configuración de entorno productiva. No se autoriza persistencia académica ni de sesión; existe la excepción técnica de heartbeat documentada abajo. El control de módulos rechaza fuentes externas a C1; permite dependencias instaladas. No es un firewall del sistema.
Tests: node --test mobile/read-only-integration/isolation.test.mjs
Build: node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.config.mjs
C2-C5 no implementados. No importar esta entrada desde la Web productiva. No desplegar.

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

C1 está lista para cierre dentro de este alcance limitado y con la excepción de heartbeat aprobada. C2 y la integración académica siguen sin implementar ni autorizar. No hubo publicación, migración ni modificación de Firebase productivo durante esta validación.
