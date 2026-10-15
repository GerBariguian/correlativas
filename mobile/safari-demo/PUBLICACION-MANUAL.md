# Publicación manual aislada — todavía NO autorizada

El push de GitHub está autorizado. La publicación pública en Cloudflare Pages **no** lo está. Estas instrucciones se ejecutarían solamente después de una aprobación posterior.

## Qué revisar y qué subir

- Repositorio fuente: `GerBariguian/correlativas`, rama `mobile/safari-demo-security`.
- Carpeta estática final: `mobile/safari-demo-site/`. No subir el repositorio completo.
- Archivos: `index.html`, `_headers`, `assets/index-dO8xrsuH.js`, `assets/index-B2vBuHXe.css`, `assets/logo-DbaGozUD.png`, `integrity.json`, `reviewed-modules.json`, `SHA256SUMS`.
- `integrity.json` identifica el commit fuente revisado; el commit posterior contiene la copia estática. SHA-256 no incluye el propio `SHA256SUMS`, para evitar una referencia circular.

Desde un checkout del commit final, ejecutar dentro de `mobile/safari-demo-site`:

```sh
sha256sum -c SHA256SUMS
```

En Windows PowerShell se puede comparar cada archivo mediante `Get-FileHash -Algorithm SHA256`. No abrir ni ejecutar APK, IPA, instaladores o scripts descargados para probar esta demo. El usuario puede obtener la carpeta desde el ZIP del código fuente de la rama en GitHub y extraer **solamente** `mobile/safari-demo-site` para la subida; no es una instalación de software.

## Pasos posteriores a la autorización pública

1. En una cuenta propia de Cloudflare, elegir **Workers & Pages → Create → Pages → Upload assets / Direct Upload** (los nombres pueden variar). No elegir integración Git ni Workers con código de servidor. Usar únicamente el plan gratuito si está disponible; no contratar servicios de pago.
2. Nombre deseado: `correlativas-safari-demo`; dominio deseado `https://correlativas-safari-demo.pages.dev/`, sujeto a disponibilidad. Si no está disponible, acordar el nombre alternativo antes de subir. No asociar dominios de Correlativas, Vercel ni producción.
3. Cargar únicamente el contenido de `mobile/safari-demo-site/`, con `index.html` en la raíz. Revisar los ocho archivos. No agregar funciones, analytics, Web Analytics, bindings, variables de entorno, credenciales, secretos, certificados ni integraciones automáticas. `_headers` debe ser interpretado por Pages, no sustituido por una configuración genérica.
4. La demo será pública en un origen propio: cualquiera con la URL puede abrirla. Los datos son ficticios. El proveedor recibe IP y solicitudes HTTP normales. No se promete privacidad ni funcionamiento offline.
5. Tras subir, inspeccionar la respuesta HTTPS de `/`: debe incluir la CSP de `security-headers.json`, `Permissions-Policy`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, COOP y `Cache-Control: no-store`. No omitir `frame-ancestors 'none'`, que requiere cabecera HTTP. Detenerse si el proveedor agrega scripts, desafíos o redirecciones inesperadas.
6. Descargar cada archivo estático desde la URL final a una carpeta vacía y comprobar sus SHA-256 contra la copia **confiable de GitHub** de `SHA256SUMS`. `_headers` es configuración del hosting y puede no ser descargable: comprobar su efecto mediante las cabeceras, y su hash antes de subir. No usar únicamente una lista de hashes obtenida del mismo hosting como prueba de integridad.
7. Revisar Network: sólo deben cargarse los archivos del mismo origen, sin Firebase, CDNs ni rastreadores; no deben aparecer cookies de aplicación, permisos, descargas o ventanas emergentes. Repetir navegación y pruebas del teclado en Safari físico. Ante diferencias, detener la entrega y retirar el despliegue de demo.

No hay URL pública entregada todavía. No activar GitHub Pages, workflows ni despliegues automáticos como alternativa.

## Alcance de la rama

Se retiran de este árbol el APK y el ZIP heredados, exclusivamente en esta rama Safari; las ramas aprobadas originales permanecen sin cambios. Sus objetos históricos siguen existiendo en Git. El repositorio conserva fuentes y herramientas de la aplicación web y Android, que **no** se publican en Pages. No se añaden secretos, dependencias instaladas, keystores ni temporales. El cambio de `smoke.mjs` sólo permite elegir una configuración Vite mediante una variable de entorno para reutilizar la prueba existente.

Los commits usan `[skip ci] [skip vercel]` y no se añade configuración de integración o despliegue. El workflow versionado existente sólo tiene disparadores de PR a main y ejecución manual; no se abre PR ni se ejecuta workflow. Las integraciones externas preexistentes no se administran desde esta tarea.
