# Mobile 2.4.2 — Alta de carreras y onboarding por tarjetas

Rama local: `mobile/stage2-4-2-career-onboarding`.
Base: Mobile 2.4.1, commit `79a6e21093ea0552862510856a94a3e6eebff8ab`, ZIP SHA-256 `8a49679cde25d03e342d36df55394dd75addf16cadd063c8e10fcf9771f8c17a`.

Preparación local, sin commit, push, merges ni despliegues. La aplicación web productiva, Firebase, Vercel, Cloudflare y todos los ZIP anteriores permanecen intactos. No se avanza a Mobile 2.4.3.

## Comportamiento implementado

Después de confirmar universidad → carrera → plan aparece «Carrera agregada correctamente», con identidad del catálogo, «Configurar mis materias» y «Hacerlo después». No se crean sesiones académicas ni asignan estados por el alta. La primera trayectoria se selecciona según la regla ya aprobada; si existían otras, incluidas archivadas, no se cambia la selección.

«Hacerlo después» vuelve a Mis carreras. Inicio conserva su acceso y cada trayectoria activa con catálogo incorpora Configurar/Retomar carga. Para una trayectoria diferente se abre un único diálogo que explica el cambio de contexto y requiere «Cambiar y configurar». Cancelar, Escape o Atrás no seleccionan ni cargan. Tras confirmar, se consume una intención en memoria que identifica usuario e instancia; sólo se inicia la sesión cuando el contexto montado coincide. No se persiste una orden de cambiar carrera al recargar.

Una carrera archivada no puede configurar materias: debe restaurarse explícitamente y luego confirmar su selección; restaurar no selecciona ni inicia el onboarding. El modelo legacy mantiene su acceso en el contexto legacy, sin crear trayectorias ni migraciones. Sin catálogo o autoridad habilitada no se habilitan escrituras.

El aviso posterior al alta es transitorio. Si se recarga, la trayectoria guardada aparece en Mis carreras y puede configurarse desde allí; no se repite el alta ni se inicia una carga automáticamente.

## Tarjetas, accesibilidad y protección académica

| Interacción | Resultado |
|---|---|
| Deslizar a la izquierda | Omitir/avanzar sin asignar un estado nuevo |
| Deslizar a la derecha | Volver una tarjeta, si existe |
| Pulsar Pendiente/Cursando/Regularizada/Aprobada | Solicitar la escritura ficticia y avanzar sólo después del éxito |
| Anterior / Omitir | Alternativas nativas de botón para teclado y lectores de pantalla |
| Volver sobre una tarjeta ya decidida | Revisar y corregir la elección de esa sesión; el botón de avance muestra Siguiente |
| Pausar y retomar | Conservar cursor, omisiones y decisiones confirmadas por contexto |

Los gestos no corresponden a estados académicos. Omitir nunca asigna Pendiente ni borra una elección ya confirmada. Los estados presentes antes de la sesión quedan protegidos y fuera de las tarjetas editables. El controlador, las reglas de correlativas, el modelo compartido y la persistencia validada se reutilizan; no se modifican otras materias ni se unen planes.

El gesto sólo comienza sobre la tarjeta, con puntero táctil/lápiz primario. Primero se decide el eje con 12px de tolerancia y predominio horizontal >1,6 veces el desplazamiento vertical. Para navegar se necesitan 64–100px según el ancho y hasta 1,2 segundos. Una vez identificado como vertical no se convierte después en horizontal. Se respetan `pan-y pinch-zoom`, pointercancel, multipuntero y los 24px del borde del navegador. Los gestos se ignoran mientras la operación está pendiente o la sesión dejó de coincidir con el contexto.

Se anima la entrada de la tarjeta y el retorno de un arrastre incompleto. `prefers-reduced-motion: reduce` desactiva animación, transición y desplazamiento visual. Los botones conservan sus etiquetas, selección, áreas táctiles y comportamiento Enter/Espacio; no se interceptan flechas del teclado ni el botón Atrás del sistema. Un anuncio polite describe la navegación y el foco vuelve al título de la tarjeta mediante el mecanismo ya existente.

El diálogo hereda el panel que sigue visualViewport. Su explicación usa texto escalable y color #4f5d73 sobre #f5f6fb: contraste calculado 6,19:1. Esto no equivale a certificar toda la interfaz.

## Correcciones demostradas durante las pruebas

1. La captura implícita de un toque iniciado en un descendiente (por ejemplo, el título) generaba un `lostpointercapture` al transferir la captura a la tarjeta. Se evita cancelar el gesto por ese evento de un descendiente; se siguen cancelando pérdidas reales de captura del artículo. Las pruebas táctiles empiezan sobre el texto, además de verificar scroll, gesto corto, diagonal, borde y segundo puntero.
2. El fixture «sin carreras» sembraba un registro de la instancia demo-sistemas aunque esa instancia no existía. Tras agregar demo-added-1 y recargar, el lector lo rechazaba como dato incoherente. El fixture vacío ahora comienza con registros vacíos. Se añadieron pruebas de restauración del estado vacío, primera carrera, decisiones y cursor. No se relaja el lector, no se eliminan registros reales ni se migra o repara automáticamente almacenamiento anterior inválido.

La simulación de éxito/error/conflicto y la invalidación de respuestas tardías no se cambiaron. Un cambio confirmado de contexto descarta la operación pendiente de la carrera anterior; volver después no la revive. Las decisiones sólo avanzan en éxito. Los cambios manuales siguen permitidos aunque falten correlativas.

## Archivos

Se modificaron exclusivamente seis fuentes de demo en `mobile/integration-final/`:

- `App.jsx`: integración opcional del flujo, confirmación de contexto e intención acotada al usuario/instancia.
- `CareerWizard.jsx`: callback posterior al alta, preservando el comportamiento por defecto de otras entradas.
- `ContextPages.jsx`: acceso al onboarding desde trayectorias y legacy.
- `CareerCards.jsx`: Configurar/Retomar sólo en carreras activas con catálogo.
- `AcademicOnboarding.jsx`: tarjeta táctil opcional, instrucciones, anuncios y dirección de animación.
- `contextModel.mjs`: exclusivamente la corrección del fixture vacío descrita arriba.

La nueva entrada activa estas opciones sin duplicar la aplicación React ni crear versiones por sistema operativo. Los componentes, motores, Dashboard, Materias, mapa, búsqueda, filtros y panel de detalle continúan compartidos. La entrada anterior conserva sus opciones por defecto; sus ZIP publicados no se reconstruyen ni reemplazan. Las fuentes de entregas anteriores se recuperan desde sus commits aprobados; el verificador estricto 2.4.0 rechaza correctamente estos cambios posteriores, no se alteraron sus hashes para fingir igualdad.

Archivos nuevos bajo `mobile/career-onboarding/`:

```text
CareerAdded.jsx
SwipeCard.jsx
gesture.mjs
main.jsx
index.html
onboarding.css
vite.config.mjs
inputs.lock.json
prepare.py
regression.py
compatibility.py
flow.check.py
gesture.test.mjs
persistence.test.mjs
README.md
verification.json
```

No se modificaron dependencias, lockfile, fuentes de producción, reglas, autenticación, navegación de seis destinos, motores de correlativas ni claves/esquema de persistencia.

## Construcción y pruebas reproducibles

Usar la toolchain y dependencias ya fijadas en `mobile/reproducible-base/toolchain.json`: Node 24.19.0, npm 11.9.0, Python 3.12.14, zlib 1.3.2, Playwright Python 1.62.0 y Chromium de sistema 154.0.8037.57 en Linux. No se instalaron paquetes adicionales.

Desde la raíz del repositorio:

```sh
python3 mobile/career-onboarding/prepare.py
node --test mobile/career-onboarding/*.test.mjs
python3 mobile/career-onboarding/regression.py
python3 mobile/career-onboarding/flow.check.py
python3 mobile/career-onboarding/compatibility.py
```

`inputs.lock.json` declara entradas y hashes, con los seis cambios de fuentes identificados respecto de la base. El build rechaza entradas alteradas y SDK/backend incluidos. Se generan archivos exclusivamente en `.tools/mobile-242/`; no se sobrescriben descargas anteriores.

La regresión conserva las aserciones de las ocho suites previas. El adaptador del test de contextos pulsa explícitamente Hacerlo después en el nuevo aviso, para continuar verificando el ciclo de vida previo. El test heredado usa un perfil de Chromium separado para evitar locks de sesiones anteriores. No se deshabilitaron casos ni aserciones. Las ramas nuevas del aviso y ambos caminos de configuración se verifican por separado en flow.check.py.

Resultados finales (también en verification.json):

- 57 pruebas de modelo existentes y 9 nuevas (6 de gestos, 3 de persistencia): todas aprobadas.
- Ocho suites de regresión: 2901 comprobaciones aprobadas, sin fallidas ni omitidas.
- Nuevos flujos: 325 comprobaciones aprobadas en dos perfiles móviles de Chromium.
- Matriz responsive heredada: 2375 comprobaciones, nueve tamaños, texto raíz 100%/200%.
- Interacciones heredadas: 54 comprobaciones, incluidos teclado simulado mediante altura reducida, drag de mapa y uso offline tras la carga.
- 18 capturas de viewport idénticas a Mobile 2.4.1: seis secciones a 360 × 800, 390 × 844 y 430 × 932. Las pantallas nuevas y los accesos añadidos a Mis carreras son diferencias intencionales.
- ZIP idéntico al repetir su construcción; seis miembros, CRC y SHA-256 correctos.

Los recorridos nuevos cubren primera carrera y carrera adicional, configuración inmediata o posterior, ausencia de selección, confirmación y cancelación por historial, progreso totalmente registrado, legacy, archivadas/restauradas, omisión frente a Pendiente, cuatro estados, correcciones, pausa/reanudación desde ambos accesos, recarga, progreso de dos carreras, fallo/conflicto y respuesta tardía al cambiar contexto, gestos reales CDP y botones, vertical/diagonal frente a horizontal, texto grande, movimiento reducido y nombres AX.

Se probaron los avisos y el diálogo a 320px y en horizontal, incluido texto 200% y panel de 340px de alto. Los reportes observan cero errores JavaScript, solicitudes externas, descargas o popups en los recorridos ejecutados.

Reportes locales: `.tools/mobile-242-regression/summary.json`, `.tools/mobile-242-flow/result.json`, `.tools/mobile-242-checks/result.json`, `.tools/mobile-242-interaction/result.json`, `.tools/mobile-242-visual/result.json` y `.tools/mobile-242/build-report.json`. Las capturas quedan junto a los respectivos reportes, fuera del ZIP.

## Paquete y seguridad

Carpeta estática: `/workspace/correlativas/.tools/mobile-242/dist`.
ZIP: `/workspace/correlativas/.tools/mobile-242/correlativas-mobile-242-career-onboarding.zip`.
Checksum: la misma ruta con sufijo `.zip.sha256`.

SHA-256:

```text
e25ea6dd0afdc77eb4ac79052fcc3610d234d18714e1bbd123325e1d8d3a666f
```

Contenido exacto, sin carpeta envolvente:

```text
SHA256SUMS
_headers
index.html
assets/index-C5Op2LfB.js
assets/index-exIYBAqR.css
assets/logo-DbaGozUD.png
```

El ZIP no incluye fuentes JSX, tests, informes, dependencias instaladas, source maps, .env ni credenciales. SHA256SUMS contiene los otros cinco hashes; verification.json registra también el hash del propio manifiesto y el ZIP.

Se mantiene exactamente `_headers` de la demo aprobada y la meta CSP. `connect-src 'none'`, sin Firebase, autenticación, APIs externas, SDK nativo, scripts/CDN remotos, service worker, manifiesto instalable o permisos del dispositivo. La excepción style-src unsafe-inline ya aprobada se conserva para MUI/Emotion. Grafo de dependencias: mismas 24 familias que 2.4.1; ninguna Firebase/Capacitor. Escaneo de patrones de credenciales y proyecto productivo en el artefacto, whitelist estática y cabeceras verificadas en preview local.

No se presenta como auditoría completa de seguridad, certificación WCAG ni resolución de vulnerabilidades históricas. No se ejecutó actualización ni nuevo npm audit porque las dependencias no cambiaron. Se conserva el logo histórico de aproximadamente 1,23 MB; su costo de primera carga no se optimizó fuera de alcance.

## Límites y revisión física pendiente

Los perfiles Android e iPhone varían viewport, user-agent y eventos táctiles en **Chromium Linux**. El perfil iPhone no ejecuta Safari ni WebKit. No se probaron teléfonos físicos, teclado del SO, VoiceOver ni TalkBack en esta entrega. El 200% de fuente raíz no reproduce todas las opciones de texto/zoom del sistema. La emulación no certifica barras, safe areas, rebote, inercia ni gesto Atrás de los dispositivos.

Para aprobar en Safari iPhone y Chrome Android:

1. Agregar primera carrera, elegir Hacerlo después y retomar desde Mis carreras/Inicio; repetir Configurar directamente en el aviso. Recargar y comprobar que no se duplica el alta.
2. Agregar otra carrera sin alterar la actual. Cancelar la confirmación con botón y Atrás; después confirmar y verificar nombre, universidad y plan en la cabecera de destino. Cambiar nuevamente entre ambas y comprobar independencia.
3. Deslizar desde el título y el cuerpo de la tarjeta, corto/largo, izquierda/derecha. Hacer scroll vertical y diagonal, probar el borde del navegador y dos dedos: nunca deben asignar estados. Usar también Anterior/Omitir y teclado/lector de pantalla.
4. Elegir los cuatro estados, volver a corregir, omitir, pausar, cerrar y reabrir el navegador con la misma URL. Verificar cursor y decisiones sin sobrescribir estados previos. Probar una carrera configurada y otra archivada/restaurada.
5. Activar movimiento reducido y texto grande; rotar y abrir teclado en búsquedas. Revisar animación desactivada, foco/anuncios, scroll del diálogo, áreas seguras y accesibilidad de sus botones.
6. En Cuenta → Escenarios de prueba, provocar error/conflicto y respuesta tardía; cambiar contexto antes de finalizar. No debe confirmarse ni avanzar una decisión en otra carrera.

El almacenamiento es exclusivamente local, por origen y perfil, sin respaldo/sincronización. Modo privado, limpieza o evicción pueden perderlo. Funciona sin red después de cargar; sin service worker y con no-store no se garantiza abrir/recargar desde cero offline. Una copia local previa inválida sigue mostrando advertencia, sin relajación del lector ni migraciones automáticas; los escenarios de prueba pueden cargarse explícitamente en esta demo ficticia.

## Publicación futura: pendiente de autorización

El ZIP es local; esta ruta no es un enlace descargable público. No se subió a GitHub ni a Cloudflare. Tras autorización independiente para entregarlo y publicarlo: comprobar checksum, extraer en carpeta vacía, ejecutar `sha256sum -c SHA256SUMS` y subir sólo estos seis archivos mediante Direct Upload en un **nuevo** proyecto aislado, por ejemplo `correlativas-mobile-242-career-onboarding`. No conectar GitHub, automatizaciones ni dominios productivos; conservar `_headers` y `assets/`. Verificar HTTPS, cabeceras y hashes remotos antes de las pruebas físicas. Aquí no se creó el proyecto ni se presume su URL.
