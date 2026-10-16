# Mobile 2.4.1 — Paridad responsive Android/iPhone

Rama local: `mobile/stage2-4-1-responsive-parity`.
Base versionada: `1d68ddcf172247652e0aa7eb5f4d48065bbaadcc`.
Referencia aprobada: ZIP Mobile 2.3.6, SHA-256 `c1cc05d626c911976dcdca0e4fdf4bff22c0c95339a1b2450ce36942781e587a`.

Preparación local únicamente, sin commits, push, merges ni despliegues. No se conectaron servicios ni se cambiaron las pantallas, reglas académicas o persistencia de la base. No se avanza a otra etapa.

## Diagnóstico y cambios

La base 2.4.0 se reconstruyó exactamente antes de intervenir. Sus 75 entradas siguen intactas. La nueva entrada React importa directamente `../integration-final/App`: no hay un segundo Dashboard, listado, mapa, motor académico u onboarding por plataforma. Todos los datos siguen siendo fixtures; los modelos legacy y trayectorias y sus claves de persistencia siguen separados.

En la base, a 915 × 412 con puntero táctil se activaba el marco de presentación de escritorio (`.demo-intro: block`, barra `sticky`), porque el corte terminaba en 850px. Ahora se conserva la misma presentación móvil hasta 1100px cuando el puntero principal es grueso, también al rotar. No se utiliza detección de sistema operativo ni user-agent.

La capa CSS nueva, acotada a `body.responsive-parity`:

- Amplía únicamente el breakpoint táctil y adapta los paneles a una altura reducida en horizontal. Conserva el botón de ampliar/reducir detalle.
- Respeta los insets laterales y superiores/inferiores ya previstos; añade protección lateral a cabecera y cinta. Los valores de `env(safe-area-inset-*)` dependen del navegador y dispositivo, no se inventan tamaños de barras del sistema.
- Reserva el máximo entre el espaciado aprobado y la altura real de las seis pestañas más 24px. Un `ResizeObserver` vuelve a medir la barra cuando cambia su altura por texto, orientación o tamaño; un `MutationObserver` reconecta la observación al cambiar el contexto o entrar/salir del alta. No modifica historial, estado, almacenamiento, foco ni eventos táctiles.
- Asegura un mínimo de 16px en búsquedas, incluida la del alta, para evitar el zoom de foco de Safari sin impedir el zoom del usuario.
- Conserva el scroll de los paneles, las safe areas y la navegación de seis destinos. La capa sólo se importa en esta demo; la web y demos anteriores no la cargan.

La meta viewport ya tenía `viewport-fit=cover` e `interactive-widget=resizes-content`. Los paneles ya seguían `visualViewport` y sus eventos resize/scroll: se reutilizan sin duplicar ni reemplazar ese mecanismo. No se añadieron interceptores de gestos ni del botón Atrás.

## Archivos nuevos

Todos bajo `mobile/responsive-parity/`; ningún archivo previamente versionado modificado:

| Archivo | Finalidad |
|---|---|
| `index.html` | Entrada aislada, meta CSP conservada y clase de alcance |
| `main.jsx` | Reutiliza la App aprobada e importa compatibilidad/observación |
| `responsive.css` | Ajustes de viewport, paneles, insets, controles y reserva inferior |
| `viewport.js` | Observación de altura real de la navegación |
| `vite.config.mjs` | Hereda build/seguridad existentes; cambia raíz y destino |
| `prepare.py` | Verifica base, módulos, seis estáticos, hashes y ZIP determinista |
| `regression.py` | Ejecuta suites aprobadas sobre el nuevo artefacto |
| `parity.check.py` | Matriz responsive, historial, persistencia y controles de seguridad |
| `interaction.check.py` | Arrastre táctil emulado, formularios, poca altura y uso offline tras carga |
| `visual.check.py` | Comparación de capturas contra la base aprobada |
| `verification.json` | Resultados, hashes y límites de la evidencia |
| `README.md` | Este informe e instrucciones |

En el adaptador de regresión sólo cambian rutas de build/reportes y se espera 100ms tras cambiar tamaño de texto antes de medir el 2 × 2 del onboarding; se conservan las aserciones originales. La primera ejecución detectó una medición transitoria de esa geometría; el rerun focalizado y la ejecución completa posterior aprobaron. Los nuevos harnesses también se corrigieron para usar modalidad de teclado al comprobar `:focus-visible` y comparar datos de persistencia validados, no el orden textual de sus propiedades JSON. No requirió cambios a la aplicación.

## Construcción y pruebas

Usar las mismas dependencias y toolchain de `../reproducible-base/toolchain.json`. No se modificaron package.json, lockfile ni versiones. Esta ejecución reutilizó las herramientas ya instaladas, sin nuevas dependencias. Desde la raíz del repositorio:

```sh
python3 mobile/reproducible-base/rebuild.py
python3 mobile/responsive-parity/prepare.py
python3 mobile/responsive-parity/regression.py
python3 mobile/responsive-parity/parity.check.py
python3 mobile/responsive-parity/interaction.check.py
python3 mobile/responsive-parity/visual.check.py
```

El primer comando genera sólo la referencia local necesaria para comparar capturas. El segundo verifica sus 75 entradas y el ZIP aprobado, y genera un artefacto distinto. Los comandos de pruebas lanzan previews en loopback y los detienen al finalizar. No son publicaciones ni previews públicos.

Toolchain verificada: Node 24.19.0, npm 11.9.0, Python 3.12.14, zlib 1.3.2, Playwright Python 1.62.0 y Chromium de sistema 154.0.8037.57 en Linux. WebKit no está instalado; no se descargó un navegador ni se afirma haber probado Safari.

| Verificación final | Resultado |
|---|---|
| Modelos académicos, contextos, filtros, detalle, Dashboard y onboarding | 57 pruebas aprobadas; 0 fallidas/omitidas |
| Ocho suites de regresión aprobadas | 2887 comprobaciones: contextos 383, académico 55, Dashboard 279, detalle 309, filtros 1074, estado 342, onboarding 333, navegación heredada 112 |
| Matriz responsive adicional | 2375 comprobaciones aprobadas |
| Interacciones adicionales | 54 comprobaciones aprobadas |
| Comparación visual vertical | 18 capturas viewport idénticas byte por byte a la base, seis secciones a 360 × 800, 390 × 844 y 430 × 932 |
| Repetición de build/ZIP | Mismo SHA-256 en ambas construcciones |
| Cabeceras | `_headers` idéntico; cabeceras HTTP comprobadas en preview local |
| Recorridos automatizados | Sin errores JS, solicitudes externas o eventos sensibles observados |

La matriz cubre 320 × 568, 360 × 800, 390 × 844, 412 × 915, 430 × 932, 768 × 1024, 844 × 390, 915 × 412 y 1024 × 600; seis secciones con texto raíz 100%/200%. Incluye panel normal/ampliado, 44px en objetivos comprobados, etiquetas AX, foco visible, reserva inferior, Back/Forward sin perder búsqueda, rotación, altura de 300px, arrastre horizontal mediante eventos táctiles CDP, cancelación del alta, onboarding, pausa/reanudación, otro contexto y cierre/reinicio real de Chromium usando el mismo perfil en disco. La restauración compara registros, selección, trayectorias, cursor y decisiones; el lector original valida y normaliza la serialización.

Las regresiones también cubren errores/conflictos simulados, respuestas tardías descartadas al cambiar de contexto, catálogos grandes, progreso por plan, legacy, datos ausentes y conservación de filtros. La accesibilidad automatizada usa árbol AX, teclado, objetivos y contraste muestreado de las suites aprobadas; no es una certificación WCAG ni una prueba de lectores de pantalla.

Reportes locales separados del ZIP:

- `.tools/mobile-241/build-report.json`
- `.tools/mobile-241-regression/summary.json` y logs de cada suite
- `.tools/mobile-241-checks/result.json` y capturas de matriz
- `.tools/mobile-241-interaction/result.json`
- `.tools/mobile-241-visual/result.json` y capturas comparadas

## Seguridad e integridad

Se preservan exactamente `_headers` y la meta CSP (la cabecera añade frame-ancestors). `connect-src 'none'`, sin Firebase, SDK nativo, autenticación, credenciales, scripts/CDN externos, service worker o manifiesto instalable. `style-src 'unsafe-inline'` es la excepción ya aprobada que requiere MUI/Emotion; no se amplió la política. Las restricciones de permisos y `Cache-Control: no-store` permanecen.

Se inspeccionan los módulos efectivamente incluidos: mismas 24 familias de paquetes de la base; ninguna Firebase/Capacitor ni servicio backend. El nuevo código sólo observa geometría. Escaneo de patrones de credenciales/proyecto productivo en los estáticos, whitelist y SHA-256 de todos sus archivos. Las pruebas vigilan solicitudes externas, errores JavaScript, CSP, popups, descargas y llamadas sensibles; no se observaron en los recorridos probados. No es una auditoría completa de seguridad ni una garantía frente a todo posible comportamiento.

No se ejecutó otro npm audit: no hubo instalación ni cambios de dependencias; este trabajo no declara resueltas vulnerabilidades históricas. El logo PNG de aproximadamente 1,23 MB sigue siendo el aprobado: puede afectar la primera carga con red lenta; no se optimizó para evitar cambios fuera de alcance.

## Artefacto preparado

Carpeta estática: `/workspace/correlativas/.tools/mobile-241/dist`.
ZIP: `/workspace/correlativas/.tools/mobile-241/correlativas-mobile-241-responsive-parity.zip`.
Checksum: misma ruta con sufijo `.zip.sha256`.

SHA-256 del ZIP:

```text
8a49679cde25d03e342d36df55394dd75addf16cadd063c8e10fcf9771f8c17a
```

Contenido exacto, seis archivos directamente en la raíz y `assets/`, sin carpeta envolvente:

```text
SHA256SUMS
_headers
assets/index-BVGOJg6W.js
assets/index-qo3MmAiK.css
assets/logo-DbaGozUD.png
index.html
```

`verification.json` registra SHA-256 de cada miembro y del ZIP. `SHA256SUMS` verifica los otros cinco miembros, excluyéndose a sí mismo. No se incluyen fuentes, informes, dependencias instaladas, mapas de fuente, secretos ni perfiles. Todos los ZIP anteriores permanecen intactos.

## Diferencias de plataforma y límites

| Área | Safari iPhone | Chrome Android | Evidencia y pendiente |
|---|---|---|---|
| Teclado | Puede reducir/panear visualViewport sin reducir layoutViewport; foco <16px puede provocar zoom | Chrome moderno admite interactive-widget=resizes-content; varía según teclado y configuración | Se conserva visualViewport en paneles; inputs ≥16px; se probó resize corto, no teclado SO real |
| Barras y orientación | Insets y altura disponible dependen de barra Safari y notch | Barras Chrome, navegación gestual/3 botones y recortes varían | dvh, insets y breakpoint táctil compartidos; falta medición física |
| Gestos e historial | Back por gesto y scroll con rebote son propios de Safari | Botón/gesto Atrás y encadenamiento de scroll del navegador | Historial web y toque CDP aprobados; no se intercepta Atrás nativo ni se prueba WebView |
| Persistencia | Almacenamiento por origen; privado/limpieza/evicción pueden perder datos | Mismas restricciones por origen/perfil, cuotas y limpieza | Reinicio Chromium de perfil real aprobado; probar cierre real en ambos teléfonos |
| Texto y accesibilidad | Zoom/texto, VoiceOver | Tamaño de fuente del sistema/Chrome, TalkBack | 200% de fuente raíz no equivale a todas las opciones SO ni pinch zoom; lectores físicos pendientes |

El protocolo CDP de este Chromium no expone `Emulation.setSafeAreaInsets`; no se afirma haber simulado insets reales. El soporte de safe areas se revisa en CSS, y debe validarse con las barras y notch reales. La prueba móvil usa Chromium Linux con viewport/touch: no certifica Chrome Android ni Safari. No se probaron versiones antiguas de Chrome/iOS.

Sin service worker y con no-store, funciona sin red **después de cargar**; no hay garantía de abrir/recargar el sitio desde cero en modo avión. Los cambios guardados se conservan localmente si el navegador mantiene su almacenamiento, no son respaldo ni sincronización entre teléfonos. Cambiar el dominio del hosting abre otra demo vacía por aislamiento de origen.

La App compartida conserva sus rótulos internos históricos de demo 2.3.6, incluido el título que actualiza el router; el HTML, carpeta, ZIP e informe identifican 2.4.1. No se modificaron componentes aprobados sólo para cambiar esos rótulos.

## Prueba física requerida antes de aprobar paridad

Registrar modelo del teléfono, SO, versión del navegador, orientación, zoom/tamaño de texto y pasos para cualquier falla. Probar en Safari iPhone y Chrome Android (navegador normal, sin APK/WebView):

1. Abrir una futura URL HTTPS independiente, recorrer las seis pestañas y comprobar pantalla vertical/horizontal y barras del navegador expandidas/contraídas. En Android probar navegación gestual y de tres botones si el dispositivo lo permite.
2. Desplazar Inicio/Materias hasta abajo; comprobar que la barra no tapa acciones. Arrastrar horizontalmente el mapa sin arrastrar toda la página; después desplazar verticalmente.
3. Abrir teclado en Buscar materia y alta de universidad/carrera, escribir, cerrar teclado y rotar. Comprobar foco/zoom, acceso por scroll a Cancelar/Atrás y ausencia de recortes.
4. Abrir filtros y detalle; desplazar, ampliar/reducir, cambiar estado y cerrar. Usar Atrás/Adelante del navegador y el gesto/botón Android; verificar filtro y contexto.
5. Onboarding: elegir los cuatro estados, Anterior, Omitir, pausar, retomar, cerrar navegador y reabrir la misma URL con conexión. Confirmar cursor/selecciones y progreso en Inicio/Materias. Cambiar de carrera/plan y volver sin mezclar datos.
6. Repetir con texto grande/zoom y VoiceOver/TalkBack; nombres, orden de foco, anuncios, cierre de paneles y acciones alcanzables. Revisar especialmente seis etiquetas en horizontal con poca altura.
7. En Cuenta → Escenarios de prueba, simular error/conflicto/respuesta tardía y cambiar carrera antes de resolver; el resultado no debe aplicarse al nuevo contexto.
8. Tras cargar, activar modo avión y navegar/editar; no exigir recarga offline. Revisar nuevamente CSP y cabeceras sobre el futuro hosting.

## Publicación manual futura — pendiente de autorización

Este ZIP es local; su ruta interna no es una URL descargable desde el teléfono. No se subió a GitHub ni a ningún hosting. La entrega externa requiere autorización posterior.

Tras autorizar por separado la entrega y publicación: descargar el ZIP, comprobar su checksum, extraerlo en una carpeta vacía y ejecutar `sha256sum -c SHA256SUMS` (u otra herramienta SHA-256 equivalente). En Cloudflare Pages crear **otro** proyecto Direct Upload, por ejemplo `correlativas-mobile-241-responsive`, sin conectar GitHub, automatizaciones, dominios productivos ni modificar proyectos anteriores. Subir exclusivamente estos seis archivos conservando `assets/` y `_headers`; no la carpeta de fuentes. No es necesario contratar un servicio pago. Verificar HTTPS, respuesta/CSP y hashes servidos antes de las pruebas físicas. Aquí no se realizó esa operación ni se presume cuál será su URL.
