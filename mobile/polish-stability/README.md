# Mobile 2.4.3 — Foco según modalidad de entrada

Rama exclusiva: `mobile/stage2-4-3-polish-stability`.
Base de esta corrección: `9975a6e77e1b0d940d9c3ca7ad8ed4f1d8c3f219`.
Estado: local, sin commit, push ni despliegue.

## Diagnóstico

La regla compartida `.onboarding-subject h2:focus,.onboarding-summary h2:focus` dibuja outline ante cualquier foco, incluido el foco programático que identifica la siguiente materia. No distingue teclado de tacto. Además, `:focus-visible` no representa un detector literal de teclado: el navegador aplica heurísticas y puede conservar su decisión cuando un script mueve el foco desde un elemento previamente enfocado por teclado.

Reemplazar a ciegas todos los :focus por :focus-visible no garantiza la transición teclado → tacto. Quitar el foco programático impediría orientar a lectores de pantalla; quitar outline globalmente perjudicaría el teclado. No se aplica ninguna de esas soluciones.

## Corrección limitada

- `inputModality.js` observa pointerdown/touchstart en captura, de forma pasiva, y keydown. No previene eventos, no cambia foco, no guarda modalidad, no identifica supuestamente lectores de pantalla y no altera navegación ni gestos. Tab/Shift+Tab y teclas sin modificadores marcan teclado; las teclas modificadoras solas y atajos Ctrl/Alt/Meta no cambian la modalidad.
- `main.jsx` instala la observación antes de renderizar la demo. El observador devuelve una función de limpieza y conserva el atributo anterior si se desmonta.
- `polish.css` limita la supresión al foco de controles de navegación, títulos y paneles de la demo cuando hubo puntero. Los títulos de tarjetas y resúmenes no muestran recuadro antes de una interacción de teclado, incluida la recarga. Teclado restaura un outline visible, también si la siguiente tarjeta recibió foco por script y la heurística nativa no lo seleccionaría.
- Los campos de edición conservan su comportamiento de foco nativo. Se mantiene la semántica :focus-visible de los controles, junto con reglas explícitas para resolver las transiciones entre modalidades. No se borra outline globalmente.
- Se conservan DOM focus, tabindex, aria-describedby y la región viva de confirmación; no se cambian AcademicOnboarding ni useNavigation en esta corrección.

No cambian selección académica, bordes/checks del estado seleccionado ni la señal de gesto armado: esta última es feedback gestual existente, no un indicador de foco. No se incorpora ningún sistema de novedades/tutoriales. El criterio de modalidad queda documentado como política para futuras versiones; no se modifica ahora la web real.

## Archivos

Doce existentes modificados y dos nuevos:

- `mobile/polish-stability/README.md`
- `mobile/polish-stability/accessibility.check.py`
- `mobile/polish-stability/compatibility.py`
- `mobile/polish-stability/flow.check.py`
- `mobile/polish-stability/inputs.lock.json`
- `mobile/polish-stability/intent.check.py`
- `mobile/polish-stability/main.jsx`
- `mobile/polish-stability/polish.css`
- `mobile/polish-stability/prepare.py`
- `mobile/polish-stability/regression.py`
- `mobile/polish-stability/verification.json`
- `mobile/polish-stability/vite.config.mjs`
- `mobile/polish-stability/inputModality.js`
- `mobile/polish-stability/focus.check.py`

Los cambios de runners/configuración sólo separan la salida nueva; manifiestos e informe fijan fuentes y resultados. No se altera ningún archivo de src, las fuentes del motor académico, SwipeCard, gesture.mjs ni la persistencia.

## Pruebas y reproducción

Desde la raíz con las dependencias existentes (sin instalaciones ni actualizaciones):

```sh
python3 mobile/polish-stability/prepare.py
node --test mobile/career-onboarding/*.test.mjs
python3 mobile/polish-stability/regression.py
python3 mobile/polish-stability/flow.check.py
python3 mobile/polish-stability/intent.check.py
python3 mobile/polish-stability/accessibility.check.py
python3 mobile/polish-stability/focus.check.py
python3 mobile/polish-stability/compatibility.py
```

No ejecutar build mientras las capturas comparativas leen esa carpeta. `inputs.lock.json` verifica todas las entradas y el ZIP anterior, cuyo SHA-256 es `6b94c078476d593f4e1dc1183513be8026b0e09f4dd2422bec493ff09550d11b`.

Resultados de la revisión:

- 73 comprobaciones nuevas de modalidad con eventos táctiles CDP reales en Chromium, teclado y tamaños 390×844/412×915: entrada táctil, recarga, cuatro botones después de teclado, cuatro gestos, ausencia de outline con foco real conservado, confirmaciones accesibles, Tab/Shift+Tab, Anterior/Omitir por teclado y ausencia de cambios en datos al enfocar por script. Capturas táctil/teclado inspeccionadas visualmente.
- 140 de regresión de accesibilidad: árbol AX y nombres, anuncios de éxito/error/conflicto, navegación, pausas, recarga, paneles, foco y retorno con Atrás/Adelante.
- 43 de intención/scroll; 433 del flujo académico; 2901 de regresión; 57 de modelos y 9 de gestos/persistencia.
- 2375 responsive con retrato/horizontal y texto 100/200%, más 54 de interacción. 18 capturas de las seis secciones principales idénticas a la referencia aprobada.
- Sin errores JavaScript o solicitudes externas inesperadas en recorridos observados. Esto no constituye una auditoría completa de seguridad o certificación WCAG.

La nueva prueba inicialmente buscó Omitir después de volver a una tarjeta ya registrada; allí la acción correcta es Siguiente. Se corrigió el orden del recorrido de prueba (omitir una tarjeta sin revisar y después volver), sin modificar el producto para satisfacerla.

Evidencias: `.tools/mobile-243-focus-modality-{focus,accessibility,intent,flow,regression,checks,interaction,visual}` y `.tools/mobile-243-focus-modality/build-report.json`. `verification.json` resume fuentes, archivos y resultados.

## Nuevo paquete

Carpeta: `/workspace/correlativas/.tools/mobile-243-focus-modality/dist`.
ZIP: `/workspace/correlativas/.tools/mobile-243-focus-modality/correlativas-mobile-243-focus-modality.zip`.
Checksum: mismo nombre con `.sha256` añadido.

SHA-256:

```text
cd970a7fdc338438a7995fc022f39b126dbb200c31cf6162511ee85c7ebada0f
```

Seis miembros, sin carpeta envolvente:

```text
_headers
index.html
SHA256SUMS
assets/index-diFT5vdQ.js
assets/index-CeilMjwA.css
assets/logo-DbaGozUD.png
```

La CSP y las cabeceras permanecen idénticas. Sin Firebase, servicios reales, credenciales, fuentes o informes internos dentro del ZIP. Los ZIP anteriores se conservan. La subida manual futura debe usar un proyecto aislado, preservar _headers y verificar SHA256SUMS, HTTPS y cabeceras; no se publica nada ahora.

## Límites y prueba física pendiente

Se usó Chromium Linux con entrada táctil emulada, no Safari/WebKit ni dispositivos físicos. No se afirma compatibilidad definitiva con VoiceOver/TalkBack. Verificar en Safari iPhone y Chrome Android:

1. Avanzar con los cuatro botones y cuatro gestos sin recuadros de foco; confirmar colores, señal gestual, 150 ms y scroll inmediato.
2. Con teclado externo, Tab/Shift+Tab, Enter/Espacio y cambio posterior a tacto: foco visible sólo en navegación por teclado y transición táctil limpia.
3. Con VoiceOver/TalkBack, comprobar que título, posición y confirmación siguen anunciándose; operar todo mediante botones. No se intenta detectar lectores ni deducir modalidad a partir de un click sintético.
4. Pausar, retomar, recargar, cambiar contexto, cerrar paneles y volver; revisar foco y progreso. La modalidad es por documento, no persistida; el progreso sigue en el almacenamiento local de demo.

Sin commit, push, merge, despliegue, conexión productiva ni avance a 2.4.4. Se espera autorización específica antes de publicar.
