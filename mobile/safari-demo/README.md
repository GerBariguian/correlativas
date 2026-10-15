# Correlativas: revisión segura en Safari

Rama `mobile/safari-demo-security`, basada en Android aprobado `0f90f15` (demo visual aprobada `72f9dfe`). El push de esta rama fue autorizado; no se publica en hosting ni se hace push automáticamente. La interfaz, los datos ficticios y la lógica visual se importan de la demo existente, sin duplicarlos ni rediseñarlos. El adaptador Android se sustituye por uno vacío exclusivamente en este build. No se cambia el APK ni su configuración.

## Preparar y comprobar localmente

Desde la raíz, con las dependencias ya instaladas:

```sh
npm audit --json > /tmp/correlativas-safari-audit.json
# audit devuelve código 1 cuando encuentra avisos; revisar el JSON, no ejecutar audit fix.
node node_modules/vite/bin/vite.js build --config mobile/safari-demo/vite.config.mjs
DEMO_VITE_CONFIG=mobile/safari-demo/vite.config.mjs node prototypes/mobile-app/smoke.mjs
python mobile/safari-demo/security-check.py
npm test
node mobile/safari-demo/prepare.mjs /tmp/correlativas-safari-audit.json
cd .tools/safari-demo-dist
sha256sum -c SHA256SUMS
```

`security-check.py` usa Playwright y Chromium preinstalados en Cloud, sin instalar paquetes. `serve.py` sirve únicamente en loopback HTTP: no proporciona una URL pública ni sustituye HTTPS. El build apunta a Safari 15.4 o posterior; falta probarlo con WebKit/Safari real y conocer la versión de iOS del dispositivo.

## Seguridad e integridad

- El límite de compilación rechaza Firebase, servicios/hooks productivos y SDKs de Capacitor. No se importan la aplicación principal, autenticación, secretos o configuración de producción. No se copia el directorio público completo.
- No se añaden dependencias ni se cambia `package-lock.json`. Las dependencias resueltas del lockfile provienen de `registry.npmjs.org` y cuentan con integridad. Esto no equivale a una auditoría exhaustiva del código de terceros ni garantiza ausencia de paquetes comprometidos.
- `npm-audit.json` conserva el resultado: **24 paquetes afectados, 13 altos y 11 moderados; 0 críticos**. Incluye Firebase/Firestore y herramientas Firebase, gRPC, CLI de Capacitor/xcode y dependencias transitivas. **Ninguno coincide con los módulos emitidos en el bundle Safari**. No se hicieron actualizaciones masivas. Es necesario tratar estos avisos por separado para el proyecto completo; no se presenta el repositorio como libre de vulnerabilidades.
- CSP por defecto deniega recursos; permite scripts y fuentes locales, imágenes locales/data y estilos locales/inline requeridos por React/MUI/Emotion. No permite JavaScript inline/eval, conexiones fetch/WebSocket, workers, manifests, formularios, objetos ni frames. `frame-ancestors` se envía como cabecera, no como meta. CSS `unsafe-inline` es una excepción explícita por el diseño existente; no habilita scripts inline.
- `_headers` contiene CSP, Permissions-Policy, no-referrer, nosniff, DENY, COOP y no-store, en formato compatible con Cloudflare Pages. Un hosting que lo sirva como archivo ordinario **no aplica estas cabeceras**. La política meta conserva parte de la protección, pero no sustituye las cabeceras. Hay que verificarlas en la URL final.
- Se comprobaron cabeceras reales en el servidor local; bloqueo de JavaScript inline y de fetch; ausencia observada de solicitudes externas, descargas, ventanas emergentes, diálogos y APIs de permisos en el recorrido automatizado. No hay manifiesto PWA, service worker, formulario de instalación ni archivos nativos en la entrega. Estas comprobaciones no cubren todas las rutas posibles del navegador o de dependencias.
- La regresión recorre notas, estados, mapa/planificador, comunidad, notificaciones y restablecimiento: **122 comprobaciones**, anchos 320/390/430/1280 y cero errores JS/solicitudes externas. La suite del repositorio pasó **1108 pruebas**. Los datos se mantienen en memoria y se reinician al recargar.
- `reviewed-modules.json` registra los módulos realmente emitidos; `integrity.json` relaciona sus fuentes, versiones y SHA-256, incluyendo el commit fuente revisado y el lockfile. `SHA256SUMS` cubre cada archivo entregable excepto la propia lista. Los hashes detectan modificaciones al compararlos con una copia confiable; no constituyen una firma ni certifican la autoría.

## Publicación propuesta, pendiente de autorización

No hay herramienta de vista previa HTTPS disponible en esta sesión. No se habilitó hosting, creó cuenta/proyecto, subió archivos ni conectó el repositorio a despliegues automáticos.

Propuesta: una subida estática manual a **Cloudflare Pages**, usando un plan gratuito si sigue disponible y una cuenta del usuario, sin contratar un plan de pago. Nombre deseado `correlativas-safari-demo`, URL deseada `https://correlativas-safari-demo.pages.dev/` (disponibilidad sin comprobar; **no es una URL entregada**). Sería un origen separado de producción, públicamente accesible, con datos ficticios; no ofrece confidencialidad ni control de acceso.

Fuente: repositorio `GerBariguian/correlativas`, rama independiente `mobile/safari-demo-security`. Publicar **exclusivamente el contenido revisado de `.tools/safari-demo-dist/`**: `index.html`, `assets/*.js`, `assets/*.css`, `assets/*.png`, `_headers`, `integrity.json`, `reviewed-modules.json` y `SHA256SUMS`. No subir el repositorio, `node_modules`, APK, proyectos Android, `.env`, informes de audit ni fuentes. No conectar GitHub ni instalar workflows para publicación automática.

Antes de cualquier subida se requiere autorización explícita sobre este destino y contenido. Una vez autorizada, verificar en HTTPS las cabeceras, ausencia de cookies/solicitudes externas, cero redirecciones inesperadas y hashes de todos los archivos descargados frente a `SHA256SUMS`; recién entonces entregar la URL al iPhone. Un proveedor puede añadir redirecciones, protección contra bots o scripts: si cambia el comportamiento revisado, detenerse. El proveedor verá IP y solicitudes HTTP normales; el prototipo no incorpora rastreadores.

GitHub Pages podría alojar los archivos estáticos en un repositorio separado, pero no permite estas cabeceras personalizadas y los repositorios del mismo usuario comparten origen `gerbariguian.github.io`. Por seguridad se prefiere un subdominio dedicado con soporte de cabeceras. Cualquier alternativa también necesita autorización previa.

## Lista de pruebas en iPhone (pendiente)

1. Abrir la URL HTTPS autorizada en Safari, registrar modelo y versión de iOS. No aceptar instalaciones, perfiles, permisos ni descargas: no deberían aparecer.
2. Recorrer Inicio, Materias, Mapa y Comunidad; comprobar navegación inferior, áreas seguras y orientación vertical/horizontal.
3. Editar estado y nota con teclado abierto; comprobar que el campo, Guardar y Cerrar sigan accesibles y no haya zoom/desplazamientos molestos.
4. Deslizar filtros y años del mapa, seleccionar materias y probar el planificador sin que el centrado impida el desplazamiento manual.
5. Abrir invitaciones y las tres actividades; comprobar destino y contador de no leídas. Recargar y confirmar el reinicio de los datos ficticios.

Informar errores con modelo/iOS, pasos, resultado esperado/obtenido y captura sin datos personales. La CSP no implica funcionamiento offline tras cerrar Safari: se necesita red para cargar los archivos del mismo origen.

La clasificación individual de los 24 paquetes está en [AUDIT.md](AUDIT.md). La entrega estática revisable se guarda en `mobile/safari-demo-site/`; los pasos de subida manual y verificación posterior están en [PUBLICACION-MANUAL.md](PUBLICACION-MANUAL.md). La publicación pública sigue pendiente de autorización.
