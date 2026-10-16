# Mobile 2.4.2 — Colores y gestos en toda la tarjeta

Rama: `mobile/stage2-4-2-career-onboarding`.
Base de esta revisión: commit `2c0bc65528e7f93a68ffce3048b63fd85546dc67`; ZIP anterior SHA-256 `ade1e2bb344cf78a9420608d018b7090cc9fee5ebaaf6176d1f5be2bddbe7285`.

Sólo preparación local. Sin commit, push, merge ni despliegue. No se modifica main, la web real, Firebase, Vercel, Cloudflare o producción. No se avanza a Mobile 2.4.3. Los paquetes anteriores permanecen intactos.

## Diagnóstico

Se revisaron `src/styles.css`, `src/components/AcademicOnboarding.css` y `src/components/AcademicOnboardingMobile.css` sin editarlos. La web tiene una discrepancia: los estilos generales usan Cursando amarillo (#fef3c7) y Regularizada azul (#dbeafe), pero el onboarding hereda una paleta invertida. La demo también tenía esa inversión en los botones y los indicadores de gesto. La revisión sigue la decisión del usuario y la referencia general de la web.

La limitación de superficie era deliberada: sólo el recuadro específico reservaba gestos de cuatro ejes para no convertir el scroll vertical en estados. Extender `touch-action:none` a toda la tarjeta permitiría esos gestos, pero impediría iniciar scroll sobre ella. Cambiar touch-action después de empezar un contacto tampoco permite recuperar de forma fiable un movimiento que Safari ya entregó al scroll nativo.

Una dirección vertical, por sí sola, no distingue intención académica de scroll sobre la misma superficie. Se introduce por tanto una activación explícita breve en toda la tarjeta, sin bloquear el desplazamiento normal por defecto.

## Cambios

### Colores

Se mantienen intactos Pendiente y Aprobada. Se corrigen únicamente los elementos de estado del onboarding:

| Estado | Fondo | Texto | Contraste calculado |
|---|---|---|---|
| Cursando | Amarillo #fef3c7 | #755000 | 6,49:1 |
| Regularizada | Azul #dbeafe | #3043ab | 6,84:1 |

Se utilizan variables compartidas para el botón de estado, el distintivo de la materia y el indicador durante el arrastre. Las pruebas comprueban sus colores computados; los indicadores de Pendiente/Aprobada también se comprueban contra sus valores anteriores. No se recolorean niveles, mensajes de error u otras pantallas.

### Tarjeta completa con intención explícita

Ahora puede iniciarse un gesto desde el título, nivel, código, fondo y pie de la tarjeta. Se elimina el recuadro exclusivo como superficie de arrastre.

- **Mantené el dedo quieto unos 360ms y luego deslizá.** La tarjeta muestra un contorno y «Lista para deslizar» cuando está activada.
- Si el dedo se mueve 8px antes de activar, ese contacto queda destinado al scroll y no puede convertirse luego en un estado, aunque se detenga a esperar.
- Mover el dedo de inmediato desplaza normalmente la página, incluso sobre el título o cuerpo de la tarjeta.
- Soltar después de mantener, sin arrastrar lo suficiente, no asigna estados.
- Movimiento del documento, pérdida de foco, cancelación, otro dedo, deshabilitación o cambio de contexto cancelan la intención y su temporizador.
- Los bordes del navegador y los elementos interactivos quedan excluidos del arrastre. Los botones de estado, Anterior/Omitir y el resto de controles conservan sus eventos normales.

El mapeo no cambia: izquierda Pendiente, derecha Aprobada, arriba Cursando, abajo Regularizada. Se mantienen el preview desde 18px, decisión desde 65px y predominio >1,25. La escritura ficticia y el avance pasan por el controlador aprobado: sólo se avanza en éxito. Omitir nunca asigna Pendiente; Anterior permite corregir decisiones de la sesión.

### Implementación para Safari y scroll

La tarjeta usa touch-action:auto, sin alternarlo durante el contacto. Los listeners de Touch Events están registrados desde el inicio en la tarjeta; touchmove es explícitamente no pasivo sólo allí. Antes de activar no se llama preventDefault. Tras una pulsación válida se evita únicamente el movimiento nativo del contacto deliberadamente académico, antes de que comience el scroll. Si el evento ya no es cancelable, se descarta el gesto en lugar de intentar quitarle el scroll al navegador.

Los listeners de scroll, blur, visibilidad y contactos adicionales sólo cancelan; no bloquean eventos globales. El listener de contactos adicionales es pasivo. Toda suscripción y temporizador se eliminan al desmontar, cambiar contexto o deshabilitar la edición. El callback vigente y la identidad de la tarjeta se verifican antes de decidir.

Se conservan las fórmulas de desplazamiento/rotación y las animaciones anteriores. Movimiento reducido elimina esas transformaciones y animaciones, manteniendo el indicador del estado. Los dos rótulos de activación comparten una celda de grid y reservan la altura máxima: no hay salto de contenido al activarse con texto al 200%.

Esta pulsación breve es una decisión de UX necesaria para distinguir scroll y estado vertical desde la misma superficie; debe revisarse físicamente. No se afirma haber validado el nuevo mecanismo en Safari real sólo porque el anterior recuadro funcionaba allí.

## Alcance y archivos

Se modifican 11 archivos existentes:

```text
mobile/integration-final/AcademicOnboarding.jsx
mobile/career-onboarding/SwipeCard.jsx
mobile/career-onboarding/onboarding.css
mobile/career-onboarding/flow.check.py
mobile/career-onboarding/compatibility.py
mobile/career-onboarding/regression.py
mobile/career-onboarding/vite.config.mjs
mobile/career-onboarding/prepare.py
mobile/career-onboarding/inputs.lock.json
mobile/career-onboarding/README.md
mobile/career-onboarding/verification.json
```

Nuevo archivo de pruebas:

```text
mobile/career-onboarding/intent.check.py
```

`SwipeCard.jsx` contiene la activación y cancelación del contacto; `onboarding.css`, la paleta, señales de activación y conservación de animaciones; `AcademicOnboarding.jsx` actualiza las instrucciones. Los otros cambios adaptan pruebas, salida, manifiestos y este informe.

No cambian el mapeo en gesture.mjs, los modelos académicos, la selección de carreras, el controlador de conflictos/respuestas tardías, los estados previos protegidos, el esquema/clave de persistencia, Firebase, dependencias o código de la web. Se mantienen las seis pestañas y el resto de Mobile 2.4.2.

## Construcción y verificaciones

Se utilizan las herramientas ya instaladas y fijadas: Node 24.19.0, npm 11.9.0, Python 3.12.14, zlib 1.3.2, Playwright 1.62.0 y Chromium 154.0.8037.57 Linux. No se instalaron ni actualizaron paquetes.

Desde la raíz del repositorio:

```sh
python3 mobile/career-onboarding/prepare.py
node --test mobile/career-onboarding/*.test.mjs
python3 mobile/career-onboarding/regression.py
python3 mobile/career-onboarding/flow.check.py
python3 mobile/career-onboarding/intent.check.py
python3 mobile/career-onboarding/compatibility.py
```

`inputs.lock.json` fija las entradas y los cuatro cambios de fuentes de build frente al commit base. Se rechazan fuentes alteradas, módulos backend/nativos y contenidos extraños del paquete. El ZIP anterior se verifica como referencia, nunca se sobrescribe.

La comparación visual usa `.tools/mobile-242-academic-gestures/dist` como referencia. Si falta, extraer únicamente el ZIP ade1e2bb aprobado en esa carpeta y comprobar SHA256SUMS; no reconstruirlo desde estas fuentes cambiadas.

Resultados finales:

- 57 pruebas de modelo existentes más 9 de gestos/persistencia: todas aprobadas, cero fallidas/omitidas.
- 2901 comprobaciones de regresión en ocho suites.
- 433 comprobaciones del flujo, incluyendo cuatro direcciones desde título, código, nivel y pie; paleta real de preview/botón/distintivo; estados previos, errores, conflictos, pausas y respuesta tardía al cambiar contexto.
- 41 comprobaciones específicas de intención: pulsación corta o sin dirección, scroll normal, scroll-pausa-continuación sin reactivación, cancelación, pérdida de foco, segundo dedo fuera de la tarjeta, cambio de contexto con contacto activo, movimiento reducido y ausencia de salto de altura al 200%.
- 2375 comprobaciones responsive y 54 adicionales de interacción.
- 18 capturas de las seis secciones principales idénticas al paquete anterior; los cambios visuales intencionales se limitan al onboarding.
- ZIP reproducido con el mismo SHA-256; seis miembros, CRC y manifiesto verificados.

La prueba de scroll comprueba que aumenta scrollY y no cambian materia/estados. La de arrastre vertical activado comprueba que no cambia scrollY, conserva la animación y no escribe al cancelar. Los recorridos observan cero errores JS y solicitudes externas inesperadas en las ejecuciones finales.

Los resultados se guardan, separados de las entregas anteriores, en `.tools/mobile-242-fullcard-colors-regression/`, `-flow/`, `-intent/`, `-checks/`, `-interaction/` y `-visual/`. El reporte del build está en `.tools/mobile-242-fullcard-colors/build-report.json`; las capturas no van en el ZIP.

## Paquete

Carpeta estática: `/workspace/correlativas/.tools/mobile-242-fullcard-colors/dist`.
ZIP nuevo: `/workspace/correlativas/.tools/mobile-242-fullcard-colors/correlativas-mobile-242-fullcard-colors.zip`.
Checksum: misma ruta con `.zip.sha256` al final.

SHA-256:

```text
8ebf8b07a2897ac16a8fe9e50fd93be81eddacc591eb87c45e509cdcf4c76e23
```

Contenido exacto:

```text
SHA256SUMS
_headers
index.html
assets/index-BG5mugKc.js
assets/index-XjIwUQK5.css
assets/logo-DbaGozUD.png
```

No hay carpeta envolvente, fuentes JSX, informes, tests, node_modules, .env, temporales, source maps o credenciales. SHA256SUMS verifica los cinco archivos restantes; verification.json registra también su propio hash y el del ZIP. Todos los ZIP anteriores quedan intactos.

## Seguridad, límites y revisión física

Se conservan exactamente la meta CSP y `_headers` aprobados. Connect-src none, sin Firebase, autenticación, CDN/scripts externos, SDK nativo, service worker, manifiesto instalable ni permisos añadidos. El bundle mantiene las 24 familias de paquetes de la base. No se observa conexión a servicios reales. Estos checks no son una auditoría completa de seguridad o certificación WCAG. No se ejecutó npm audit porque no cambiaron dependencias; no se afirma haber corregido vulnerabilidades históricas.

Las pruebas usan Chromium Linux con touch, viewport y perfiles Android/iPhone; no ejecutan Safari/WebKit ni teléfonos físicos. No se asume equivalencia con Safari iPhone, Chrome Android, VoiceOver/TalkBack, teclado del SO ni todas las opciones de zoom/texto. La prueba previa física valida las animaciones y cuatro direcciones del mecanismo anterior, no la nueva activación por pulsación.

En ambos teléfonos verificar antes de aprobar:

1. Mantener y arrastrar desde título, nivel, código, zonas vacías y pie. Revisar la señal «Lista para deslizar» y si 360ms resulta cómodo. Probar cuatro direcciones, lenta/rápidamente, y colores amarillo/azul en preview y decisiones.
2. Arrastrar inmediatamente para hacer scroll sobre la tarjeta, pausar el dedo durante ese scroll y continuar: nunca debe registrar un estado. Comprobar también fuera de ella y con barras del navegador que cambian de tamaño.
3. Mantener y soltar sin dirección, cancelar, volver al origen, dos dedos y salir de la aplicación: ningún estado nuevo. Si Safari considera que ya empezó el scroll, el gesto debe cancelarse sin escritura; informar si esto impide usarlo cómodamente.
4. Botones de estado, Anterior/Omitir, pausa/reapertura, estados previos y cambio de carrera. Simular error/conflicto/respuesta tardía y revisar que no se confirme en otro contexto.
5. Movimiento reducido, texto/zoom grandes, horizontal, VoiceOver/TalkBack y teclado. Confirmar que los botones siguen siendo una alternativa completa y que no aparece selección de texto o menú contextual al mantener.

La persistencia sigue siendo exclusivamente local por origen/perfil, sin respaldo/sincronización. Modo privado, limpieza o evicción pueden perderla. Se mantiene el funcionamiento sin red después de la carga, sin garantía de apertura inicial offline. El logo histórico de aproximadamente 1,23 MB no se optimizó fuera de alcance.

## Publicación pendiente

La ruta del ZIP es interna, no un enlace público descargable. No se hizo commit, push ni despliegue. La entrega en GitHub requiere autorización posterior. Publicar en Cloudflare también requiere autorización aparte: nuevo proyecto Direct Upload aislado, sin conectar GitHub/automatizaciones ni dominios productivos y subiendo sólo los seis estáticos. Conservar `_headers` y `assets/`; comprobar HTTPS, cabeceras y hashes remotos antes de las pruebas físicas. Aquí no se creó ni modificó ningún hosting.
