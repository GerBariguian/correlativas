# Mobile 2.4.2 — Activación gestual de 150 ms

Rama: `mobile/stage2-4-2-career-onboarding`.
Base revisada: `405253e15e347481dba26e15a87dd82cdc3c8862`.

## Cambio limitado

En `SwipeCard.jsx`, `HOLD_MS` cambia de 360 a 150. Es el único cambio de comportamiento de la aplicación. Se conservan la tarjeta completa, izquierda → Pendiente, derecha → Aprobada, arriba → Cursando amarillo y abajo → Regularizada azul, animaciones y movimiento reducido.

Mover el contacto 8 px antes de activarse cancela el reconocimiento durante todo ese contacto: no vuelve a activarse si el dedo se detiene. Los eventos de scroll también cancelan. Antes de activarse no se cancela el scroll nativo. Tras activarse, solo el movimiento cancelable dentro de la tarjeta se reserva al gesto. Botones, bordes del navegador, cancelaciones, contexto, persistencia y protecciones previas no cambian.

El umbral nominal es 150 ms; la ejecución de temporizadores depende del navegador. La menor espera puede incrementar activaciones involuntarias si se mantiene el dedo quieto antes de comenzar el scroll. Requiere validación física.

## Archivos modificados

- `mobile/career-onboarding/README.md`
- `mobile/career-onboarding/SwipeCard.jsx`
- `mobile/career-onboarding/compatibility.py`
- `mobile/career-onboarding/flow.check.py`
- `mobile/career-onboarding/inputs.lock.json`
- `mobile/career-onboarding/intent.check.py`
- `mobile/career-onboarding/prepare.py`
- `mobile/career-onboarding/regression.py`
- `mobile/career-onboarding/verification.json`
- `mobile/career-onboarding/vite.config.mjs`

Los runners ajustan la espera de prueba y separan la salida nueva; el manifiesto actualiza hashes y configuración del directorio de build. No cambian estilos, lógica académica ni código web.

## Construcción y pruebas

Desde la raíz, usando las dependencias existentes, sin instalar ni actualizar paquetes:

```sh
python3 mobile/career-onboarding/prepare.py
node --test mobile/career-onboarding/*.test.mjs
python3 mobile/career-onboarding/regression.py
python3 mobile/career-onboarding/flow.check.py
python3 mobile/career-onboarding/intent.check.py
python3 mobile/career-onboarding/compatibility.py
```

Resultados de esta ejecución:

- 57 pruebas de modelos y 9 de gestos/persistencia aprobadas, sin fallos ni omisiones.
- 2901 comprobaciones de regresión: Dashboard, contextos, detalle, modelo académico, estados, filtros, navegación y onboarding.
- 433 comprobaciones de flujo: cuatro direcciones, colores, botones, estados previos, conflictos, errores y cambios de contexto.
- 43 comprobaciones de intención: no activación antes del umbral, activación posterior, scroll real medido por scrollY, scroll-pausa sin reactivación ni escritura, cancelación, segundo dedo, pérdida de foco, movimiento reducido y texto ampliado.
- 2375 comprobaciones responsive, 54 de interacción y 18 capturas de secciones principales idénticas a la referencia aprobada.
- Sin errores JavaScript, solicitudes externas ni eventos sensibles inesperados en los recorridos observados. No equivale a una auditoría completa de seguridad.
- Build repetido: mismo ZIP y SHA-256. Seis archivos, CRC, manifiesto y cabeceras restrictivas verificados.

Evidencias: `.tools/mobile-242-hold150-{regression,flow,intent,checks,interaction,visual}` y `.tools/mobile-242-hold150/build-report.json`. El runner de compatibilidad de esta primera ejecución escribió los reportes en su antigua ruta; se copiaron al directorio nuevo y se corrigió la ruta del runner para futuras ejecuciones. Los ZIP anteriores no se alteraron.

## Paquete nuevo, todavía no publicado

Carpeta estática: `/workspace/correlativas/.tools/mobile-242-hold150/dist`.
ZIP: `/workspace/correlativas/.tools/mobile-242-hold150/correlativas-mobile-242-hold150.zip`.
Checksum: mismo nombre con sufijo `.sha256`.

SHA-256:

```text
9615cac19e7a5e3dc98eb30752bab085c3c184f2377fc27958554aa76659418b
```

Seis miembros, sin carpeta envolvente:

```text
_headers
index.html
SHA256SUMS
assets/index-DtamcqyZ.js
assets/index-XjIwUQK5.css
assets/logo-DbaGozUD.png
```

Sin fuentes, informes, credenciales o dependencias instaladas. `_headers`, CSS y logo son idénticos a la versión anterior; el JS cambia por el temporizador y el HTML referencia su nuevo nombre. Se mantiene la CSP y el aislamiento, sin Firebase ni servicios reales.

## Revisión física pendiente

Abrir una futura publicación manual aislada en Safari iPhone y Chrome Android. Probar los cuatro gestos desde distintas zonas; scroll inmediato, scroll tras pausa breve, cancelaciones, botones, Anterior/Omitir, movimiento reducido, pausas/reanudación y cambio de contexto. Evaluar comodidad y activaciones involuntarias con 150 ms. VoiceOver/TalkBack pendientes.

Las pruebas ejecutadas usan Chromium Linux con perfiles móviles: no son Safari/WebKit ni dispositivos físicos. No hay commit, push, merge o despliegue de esta corrección. No se avanzó a Mobile 2.4.3. Cualquier publicación requiere autorización específica.
