# Mobile 2.4.3 — Pulido, accesibilidad y estabilidad

Base aprobada: `652b2d56b67d05ba6aee9620834f8359bea72c3b`.
Rama independiente: `mobile/stage2-4-3-polish-stability`.
Estado: preparado localmente, sin commit, push o despliegue.

## Diagnóstico y correcciones justificadas

1. **Confirmado en navegador antes de modificar:** al entrar o retomar las tarjetas, un requestAnimationFrame de navegación enfocaba `main` después del efecto de la tarjeta. Se prioriza el título de la materia o del resumen del onboarding. El título describe posición, código y estado con referencias ARIA; no depende del color.
2. **Confirmado por código y ejecución:** el anuncio específico sólo cambiaba con gestos y decía «Estado solicitado». Los botones no actualizaban ese anuncio y podía quedar desactualizado tras confirmar. Se usa el mismo manejador para gestos y botones; una región persistente `status`, atómica y polite, anuncia nombre y estado únicamente tras éxito. En error o conflicto no anuncia confirmación; se conservan los alerts del motor compartido. La región no ocupa espacio visual ni está display:none cuando está vacía.
3. **Confirmado por la nueva prueba de teclado:** al cerrar notificaciones con Escape el foco terminaba en main, no en su disparador. Se recuerda en memoria el elemento que abre cada nivel de panel; al regresar se restaura si sigue conectado y corresponde a la página. No se persisten elementos DOM ni se cambia el historial o la protección de contextos.
4. **Cobertura desigual en estilos existentes:** se completa el foco visible de controles de la demo y la preferencia de movimiento reducido en contenido y paneles. Se mantienen estilos normales, jerarquía, áreas táctiles y seis secciones.

El selector inicial de foco de esta corrección eligió primero el h1 general: lo detectó la nueva prueba, se corrigió la prioridad y se repitió la validación. La prueba de retorno de foco del panel también detectó el problema antes de aplicar su corrección.

## Invariantes y alcance

Sin cambios en SwipeCard, gesture.mjs, colores, activación de 150 ms o umbrales. Izquierda = Pendiente; derecha = Aprobada; arriba = Cursando amarillo; abajo = Regularizada azul. Toda la tarjeta conserva el reconocimiento deliberado y el movimiento anterior a la activación cancela el contacto para permitir scroll. Los botones siguen disponibles sin gestos; Omitir no asigna Pendiente.

No cambian modelos académicos, correlativas, persistencia, separación legacy/trayectorias o contextos, protección de estados previos, simulaciones, filtros, Dashboard, Mis carreras, Mapa, Planificar, Proyectar ni Comunidad. Los cambios se limitan a accesibilidad/presentación y foco. La región específica de confirmación sustituye el viejo mensaje de solicitud gestual, sin nuevas funciones.

## Archivos

Dos archivos existentes modificados y trece archivos nuevos:

- `mobile/integration-final/AcademicOnboarding.jsx`
- `mobile/integration-final/useNavigation.jsx`
- `mobile/polish-stability/README.md`
- `mobile/polish-stability/accessibility.check.py`
- `mobile/polish-stability/compatibility.py`
- `mobile/polish-stability/flow.check.py`
- `mobile/polish-stability/index.html`
- `mobile/polish-stability/inputs.lock.json`
- `mobile/polish-stability/intent.check.py`
- `mobile/polish-stability/main.jsx`
- `mobile/polish-stability/polish.css`
- `mobile/polish-stability/prepare.py`
- `mobile/polish-stability/regression.py`
- `mobile/polish-stability/verification.json`
- `mobile/polish-stability/vite.config.mjs`

Los runners de esta carpeta reutilizan las suites aprobadas con rutas de salida independientes. No se modifican los scripts, ZIP o ramas anteriores.

## Construcción reproducible y ejecución

Desde la raíz del repositorio, con las dependencias existentes fijadas por el lockfile (no se instalaron ni actualizaron paquetes):

```sh
python3 mobile/polish-stability/prepare.py
node --test mobile/career-onboarding/*.test.mjs
python3 mobile/polish-stability/regression.py
python3 mobile/polish-stability/flow.check.py
python3 mobile/polish-stability/intent.check.py
python3 mobile/polish-stability/accessibility.check.py
python3 mobile/polish-stability/compatibility.py
```

`inputs.lock.json` verifica las entradas reales, el ZIP base y los cambios permitidos. El empaquetado valida módulos incluidos, ausencia de backend nativo/Firebase, secretos por patrones y cabeceras. Se verificaron las mismas familias de dependencias que en 2.4.2, sin incorporar paquetes. `prepare.py` genera seis archivos y un ZIP determinista; no ejecutar el build mientras una comparación visual esté leyendo esa misma carpeta.

## Resultados finales

- 57 pruebas de modelo y 9 de gestos/persistencia: aprobadas, sin fallos ni omisiones.
- 2901 comprobaciones de regresión de Dashboard (279), contextos (397), detalle (309), modelo académico (55), estados (342), filtros (1074), navegación anterior (112) y onboarding (333).
- 433 comprobaciones del flujo: alta, cambio explícito, cuatro gestos y colores, estados previos, pausas, conflictos, errores y respuestas demoradas entre contextos.
- 43 de intención: activación de 150 ms, scroll nativo medido por scrollY, cancelación antes de activarse, sin reactivación tras pausa del dedo, multitouch, blur, movimiento reducido y texto ampliado.
- 140 nuevas de accesibilidad/navegación: botones con Enter/Espacio, Anterior/Omitir/Pausar, anuncio confirmado por materia, ausencia de confirmación en errores/conflictos, AX names, foco en entrada/retorno/recarga, Escape, Atrás y Adelante en paneles y recuperación del disparador.
- 2375 responsive, tamaños 320 a 1024 px, retrato/horizontal, texto al 100/200%; 54 interacciones adicionales, scroll del mapa, viewport corto/inputs y funcionamiento local sin solicitudes.
- 18 capturas de las seis secciones principales idénticas al ZIP aprobado 2.4.2, en 360/390/430 px. Una ejecución visual inicial coincidió con el build, capturó el logo sin cargar a 390 px y falló. Se investigó la diferencia (sólo área del logo) y se repitió con archivos estables: 18/18 idénticas. No se relajaron aserciones.
- Sin errores JS, conexiones externas o eventos sensibles inesperados en los recorridos observados. Pruebas automatizadas de seguridad limitadas, no auditoría completa ni certificación WCAG.
- Build repetido: mismo SHA-256, CRC, seis miembros y SHA256SUMS verificados. Cabeceras CSP idénticas. Archivos previos fuera de los dos cambios permitidos y todos los ZIP versionados conservan sus hashes.

Evidencias locales: `.tools/mobile-243-polish-stability/build-report.json` y directorios `.tools/mobile-243-polish-stability-{regression,flow,intent,accessibility,checks,interaction,visual}`. `verification.json` resume resultados y límites.

## Paquete aislado

Carpeta estática: `/workspace/correlativas/.tools/mobile-243-polish-stability/dist`.
ZIP: `/workspace/correlativas/.tools/mobile-243-polish-stability/correlativas-mobile-243-polish-stability.zip`.
Checksum: mismo nombre con sufijo `.sha256`.

SHA-256:

```text
6b94c078476d593f4e1dc1183513be8026b0e09f4dd2422bec493ff09550d11b
```

Contenido, directamente en la raíz:

```text
_headers
index.html
SHA256SUMS
assets/index-DGUVwR1F.js
assets/index-DuO3U5kM.css
assets/logo-DbaGozUD.png
```

Sin fuentes, informes, credenciales o dependencias instaladas. No conectarse al proyecto web real ni enlazar GitHub a un hosting. Cuando se autorice, extraer el ZIP, ejecutar `sha256sum -c SHA256SUMS` en la raíz extraída y subir exclusivamente estos seis archivos por Direct Upload a un proyecto de Cloudflare Pages independiente; preservar `_headers` y revisar remotamente HTTPS, cabeceras y hashes. Nada publicado ahora.

## Limitaciones y revisión física

Las pruebas usan Chromium Linux con perfiles de viewport/touch y su árbol AX. No se ejecutaron Safari/WebKit, VoiceOver, TalkBack, teclado real del sistema, ni el botón físico/gesto del sistema Android. La emulación no demuestra compatibilidad definitiva.

En iPhone Safari con VoiceOver y Android Chrome con TalkBack:

1. Recorrer las seis secciones por lectura y foco, revisar orden y nombres; abrir/cerrar paneles con atrás, Escape/teclado externo si corresponde y confirmar retorno al disparador.
2. Completar, omitir, retroceder y pausar usando sólo botones. Confirmar que se escucha materia, posición, estado y confirmación sin anuncios duplicados/ininteligibles. Los gestos del lector pueden reservarse a su navegación; no son necesarios para operar.
3. Retomar desde Inicio y Mis carreras; recargar/cerrar/reabrir el navegador y verificar contexto/cursor/estados. La persistencia depende de localStorage y puede perderse al borrar datos o en modos privados; no es una sincronización remota ni un respaldo.
4. Sin lector, probar las cuatro direcciones desde toda la tarjeta, 150 ms, scroll inmediato y scroll tras pausa, cancelación y cambios de contexto con operación pendiente.
5. Teclado real, barras del sistema, safe areas, zoom/texto grande, horizontal y movimiento reducido. Confirmar visibilidad del foco y acciones sin recortes.

El funcionamiento local de la demo no implica disponibilidad garantizada tras cerrar el navegador sin caché: no se agrega service worker ni mecanismo de instalación. No se conectó Firebase/autenticación ni se modificaron main, web real, Vercel, Cloudflare o producción. No se avanzó a 2.4.4. Publicar o versionar esta entrega requiere autorización posterior.
