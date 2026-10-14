# Correlativas — exploración mobile

Demo visual y navegable, sin Capacitor, proyectos nativos, backend ni login.
Rama: `prototype/mobile-first`, creada desde `main` en
`a245f2032fe014a25dc71428361a67aeb4baa151`. No incorpora ni modifica el PR #4.

## Qué revisar

1. **Inicio:** progreso académico, estados, promedio ficticio, próximos finales y materias en curso.
2. **Materias:** búsqueda sin distinguir tildes, filtros, detalle real de correlativas, cambios de estado y notas de ejemplo. Al guardar una nota se actualiza el promedio; sin nota queda excluida.
3. **Mapa:** deslizar horizontalmente entre años, seleccionar una materia, ver requisitos y materias que desbloquea. Agregar una materia habilitada a Mi selección.
4. **Comunidad:** perfiles ficticios, simulación de solicitud de amistad, grupos de estudio y simulación de unirse.
5. **Campana:** notificaciones ficticias, marcado como leídas y navegación al destino.
6. **Reiniciar:** restablece todos los datos. Recargar también los restablece.

La escala 1–10 y el promedio aritmético son una propuesta visual, **no** el contrato
académico definitivo ni la implementación del PR #4. No hay notas productivas,
inscripciones, mensajes, invitaciones ni solicitudes reales.

## Reutilización

- Logo, colores, tokens y estilos reales de `src/styles.css`.
- `ProgressSummary`, `SubjectCard`, `SubjectModal` (desde SubjectCard) y `CareerMap` sin modificarlos.
- Catálogo real UTN Sistemas 2023 y lógica existente de estados, habilitaciones,
  correlativas, progreso y desbloqueos.
- MUI y lucide-react ya instalados. Sin nuevas dependencias ni cambios al lockfile.

La entrada web, su Vite config y el código de negocio siguen intactos.
Los overrides visuales se cargan exclusivamente desde esta entrada independiente.
El import opcional de Google Fonts del CSS compartido se elimina para la demo,
sin editar ese archivo. Se usan fuentes del sistema.

## Aislamiento

La demo solo importa componentes presentacionales, catálogo y lógica pura.
No importa `src/firebase*`, servicios, hooks de producción ni Firebase SDK.
La configuración Vite hace fallar el build si aparecen esos módulos.
La política CSP bloquea conexiones de datos (`connect-src 'none'`), frames y forms;
no necesita variables de entorno ni lee `.env` desde el código de la demo.
No usa localStorage, credenciales ni persistencia. Todo es estado React en memoria.
El servidor se limita a loopback y no habilita HMR ni túneles públicos.

## Ejecutar en el entorno

Desde `/workspace/correlativas`, con Node 24.21.0 disponible:

```bash
export PATH=/workspace/cloud-tools/node_modules/.bin:$PATH
node node_modules/vite/bin/vite.js build --config prototypes/mobile-app/vite.config.mjs
node node_modules/vite/bin/vite.js preview --config prototypes/mobile-app/vite.config.mjs
```

El preview escucha internamente en el puerto **5181**. No es un enlace remoto.
Para iterar con código fuente:

```bash
node node_modules/vite/bin/vite.js --config prototypes/mobile-app/vite.config.mjs
```

El servidor de desarrollo escucha internamente en **5180**; recargar manualmente.
La web habitual mantiene sus comandos y puertos originales.

## Visualización segura

Esta sesión no expone una herramienta para generar una URL de preview remota
ni se confirmó una ruta de acceso desde un navegador externo. No se publicaron
Vercel, GitHub Pages, túneles ni otros servicios.

Alternativa sin publicación:

```bash
python prototypes/mobile-app/export.py
```

Genera `.tools/correlativas-mobile-demo.zip` y
`.tools/mobile-demo-portable/Correlativas-demo.html`.
Descargar el ZIP, extraerlo y abrir el HTML en Chrome, Edge o Firefox de escritorio.
Incluye logo, CSS y JavaScript; no requiere Internet, instalación ni servidor.
La exportación conserva la CSP y autoriza solo su script mediante SHA-256.
El HTML autónomo se valida sirviendo ese mismo archivo por HTTP local. El
navegador administrado de este entorno bloquea las URLs `file:` por política;
por eso no se afirma una prueba de apertura directa desde el explorador de archivos.
Algunos visores de archivos de celulares no ejecutan JavaScript. Para revisar en
un teléfono real hace falta un navegador que admita ese archivo, o una vista
previa autenticada del build cuando el entorno la ofrezca. No confundir el visor
de archivos del chat con un navegador ejecutando la demo.

Si la plataforma ofrece posteriormente reenvío autenticado de puertos, probar
5181 y verificar HTML, assets, CSP y ausencia de solicitudes externas antes de
compartirlo. No usar la entrada web normal ni conectar Firebase para visualizarla.

## Verificación

Sin instalar dependencias, con Chromium ya disponible y Node con WebSocket nativo:

```bash
node prototypes/mobile-app/smoke.mjs
python prototypes/mobile-app/export.py
node prototypes/mobile-app/smoke.mjs --portable
```

`CHROMIUM_BIN` permite indicar el navegador si no se llama `chromium`.
El smoke usa puertos locales 5182/9223, un perfil descartable y cierra sus procesos.
Comprueba interacciones reales, promedio, pérdida de nota al cambiar de estado,
nota vacía, detalle anidado, búsqueda, mapa, selección, comunidad, notificaciones,
reinicio, recarga, ausencia de errores y ausencia de solicitudes externas.
También revisa desbordamiento y navegación táctil a 320, 390, 430 y 1280 px.
Capturas y resultados quedan en `.tools/mobile-demo-artifacts/` (ignorado).
Son pruebas Chromium; no equivalen a validación de Safari/iOS o un dispositivo físico.

Para verificar que la web conserva su comportamiento: `npm test` y `npm run build`.
No ejecutar Firebase, migraciones, despliegues ni publicación de Rules para esta demo.
