# Mobile 2.4.2 — Corrección de gestos académicos

Rama: `mobile/stage2-4-2-career-onboarding`. Base de esta corrección: commit `af3d6f148bb6cb01ad886b356074be41b3ac83ea`; ZIP anterior `correlativas-mobile-242-career-onboarding.zip`, SHA-256 `e25ea6dd0afdc77eb4ac79052fcc3610d234d18714e1bbd123325e1d8d3a666f`.

Trabajo local autorizado, sin commits, push, merges ni despliegues. No se avanza a Mobile 2.4.3. Todos los ZIP anteriores permanecen intactos.

## Diagnóstico e inspección de la web

El error era funcional: la demo interpretaba izquierda como omisión y derecha como retroceso, mientras el onboarding web ya usa cuatro gestos para decidir estados. Se inspeccionaron antes de editar:

- `src/components/AcademicOnboardingMobile.jsx`: función `direction`, handlers `start/move/end`, estados previos excluidos, indicador y botones.
- `src/components/AcademicOnboardingMobile.css`: captura táctil de la tarjeta, desplazamientos/rotación acotados, sello de estado y movimiento reducido.
- `docs/academic-onboarding-mobile.md`: contrato gestual y límites de la experiencia web.

La web muestra el estado desde 18px; al soltar exige un desplazamiento mayor o igual a 65px y una dirección dominante >1,25 veces la otra. Se reutilizan ese mapeo, umbrales y presentación de movimiento: desplazamiento visual x/4 limitado a ±30px, y/4 a ±20px y rotación x/30 a ±5 grados, más el indicador textual/color. Un test compara el mapeo de la demo con la función real de la web, leída sin modificarla.

No se importó el componente web entero porque edita el borrador de su padre y tiene su propio flujo de revisión/confirmación. Esta demo debe conservar el controlador asíncrono ficticio y la persistencia por contexto aprobados. Los gestos invocan exactamente la misma operación que los botones. No se cambió la web, su controlador, sus estilos ni sus servicios.

## Contrato corregido

| Acción | Resultado |
|---|---|
| Izquierda | Pendiente |
| Derecha | Aprobada |
| Arriba | Cursando |
| Abajo | Regularizada |
| Botones de los cuatro estados | Misma operación que el gesto correspondiente |
| Anterior | Volver para revisar/corregir una decisión de esta sesión |
| Omitir | Avanzar sin asignar Pendiente ni otro estado |

Al revisar una tarjeta ya decidida, el botón de avance conserva su rótulo aprobado Siguiente y su estado; no borra decisiones. Los gestos ya no omiten ni retroceden. Cada gesto válido solicita el estado y avanza sólo al recibir éxito simulado; error o conflicto no avanza ni confirma el cambio.

El indicador aparece durante el movimiento y muestra Pendiente, Aprobada, Cursando o Regularizada. Antes del umbral pide seguir deslizando; cuando se cumplen distancia y predominio indica que se puede soltar para registrar. Volver al origen, una diagonal ambigua, un gesto corto o una cancelación no asignan estados. El indicador no se utiliza como anuncio continuo de lector de pantalla; el resultado usa el canal polite y el feedback existentes.

## Scroll y decisión de UX

La web usa `touch-action:none` en toda la tarjeta y pide desplazarse fuera de ella. Para cumplir el requisito adicional de no confundir el scroll de la página con un estado vertical, la demo delimita una **zona visible de gestos dentro de la tarjeta**, con instrucciones de las cuatro direcciones.

- La zona reserva los arrastres de un dedo y conserva pinch zoom (`touch-action:pinch-zoom`). Sus cuatro direcciones eligen estados.
- Fuera de la zona, incluso sobre el título y el resto de la tarjeta, permanece el desplazamiento vertical nativo de la página. No existen listeners globales que bloqueen scroll ni `preventDefault` de la página.
- El usuario debe comenzar en esa zona para decidir mediante un gesto. No se intenta cambiar touch-action a mitad de un movimiento, cuando el navegador ya decidió cómo tratarlo.
- Se ignoran contactos adicionales, bordes del navegador y eventos cancelados. La captura sigue el dedo aunque salga de la zona. La pérdida de captura de un descendiente no cancela indebidamente la captura válida de su contenedor.
- La zona queda deshabilitada durante escrituras/error/conflicto o si no coincide la sesión. Conserva su espacio para evitar saltos del contenido mientras se guarda, y permite scroll cuando está deshabilitada.

Esta separación es intencional y debe validarse en teléfonos: conserva los cuatro gestos sin convertir un scroll común sobre la tarjeta en un estado académico. No equivale a afirmar que cualquier deslizamiento vertical en cualquier lugar de la pantalla sea una decisión.

Con movimiento reducido se eliminan transformaciones, transiciones y animaciones, pero el estado previsto sigue siendo visible. Los cuatro botones, Anterior/Omitir y el foco existente siguen disponibles para teclado y lectores de pantalla. No se añadieron atajos de teclado que intercepten desplazamiento o navegación.

## Protección académica e integración conservadas

Se mantiene sin cambios el modelo de presentación, el controlador de operaciones y la validación de persistencia de Mobile 2.4.2:

- Los estados previos, incluido Pendiente explícito, están excluidos de las tarjetas editables.
- Se pueden corregir decisiones de la sesión volviendo con Anterior; no se cambia el estado de otras materias ni se aplican correlativas automáticamente.
- Pausa, reanudación, alta opcional, confirmación de cambio de contexto, modelos legacy y trayectorias siguen separados.
- Cada carrera/plan conserva sus registros, cursor y decisiones por identidad. La intención y los eventos de una tarjeta quedan ligados al contexto y código vigentes.
- Respuestas tardías, errores y conflictos usan las mismas protecciones existentes. Cambiar de contexto invalida el resultado pendiente; volver no lo revive.
- No se integran notas, promedios, Firebase, autenticación, servicios externos o comportamiento nativo.

## Archivos modificados

No hay archivos nuevos de código en esta corrección; se modifican 13 archivos ya versionados:

| Ruta | Cambio |
|---|---|
| `mobile/integration-final/AcademicOnboarding.jsx` | Gestos solicitan estados mediante decideOnboarding; instrucciones y superficie deshabilitada |
| `mobile/career-onboarding/SwipeCard.jsx` | Movimiento de dos ejes, zona explícita, preview, captura/cancelación y contexto |
| `mobile/career-onboarding/gesture.mjs` | Mapeo y umbrales equivalentes a la web |
| `mobile/career-onboarding/onboarding.css` | Zona, preview por estado, rotación/desplazamiento y reduced motion |
| `mobile/career-onboarding/gesture.test.mjs` | Contrato corregido, comparación con web y límites de decisión |
| `mobile/career-onboarding/flow.check.py` | Cuatro direcciones, preview, scroll, cancelación, omisión independiente y concurrencia |
| `mobile/career-onboarding/regression.py` | Misma regresión, nuevo destino y reportes separados |
| `mobile/career-onboarding/compatibility.py` | Mismas suites responsive; comparación visual con la demo 2.4.2 anterior |
| `mobile/career-onboarding/vite.config.mjs` | Carpeta de salida independiente |
| `mobile/career-onboarding/prepare.py` | ZIP con nuevo nombre y salida separada |
| `mobile/career-onboarding/inputs.lock.json` | Fuente base af3d6f1 y hashes de las entradas actuales |
| `mobile/career-onboarding/verification.json` | Evidencia de la corrección |
| `mobile/career-onboarding/README.md` | Este diagnóstico e instrucciones |

No se modifican `src/`, dependencias, lockfile, Firestore Rules, proyectos de hosting ni ZIP anteriores. `inputs.lock.json` identifica los cinco cambios de entradas de construcción frente al commit base; las otras modificaciones son herramientas, pruebas e informes. El esquema y claves de almacenamiento no cambian.

## Pruebas y reproducción

Usar la misma toolchain fijada en `mobile/reproducible-base/toolchain.json`: Node 24.19.0, npm 11.9.0, Python 3.12.14, zlib 1.3.2, Playwright 1.62.0 y Chromium de sistema 154.0.8037.57 en Linux. No se instalaron ni actualizaron dependencias.

Desde la raíz:

```sh
python3 mobile/career-onboarding/prepare.py
node --test mobile/career-onboarding/*.test.mjs
python3 mobile/career-onboarding/regression.py
python3 mobile/career-onboarding/flow.check.py
python3 mobile/career-onboarding/compatibility.py
```

La comparación visual necesita la distribución anterior en `.tools/mobile-242/dist`, cuyos archivos se verificaron contra el ZIP aprobado e25ea6dd. Si falta, extraer únicamente ese ZIP en esa carpeta; no reconstruirlo desde las fuentes corregidas ni cambiar sus hashes. Los demás checks usan exclusivamente el build nuevo. No se publica ningún servidor; los previews de prueba usan loopback y terminan al finalizar.

Resultados finales:

- 57 pruebas de modelo existentes y 9 de gestos/persistencia: todas aprobadas, sin fallidas ni omitidas.
- Ocho suites de regresión: 2901 comprobaciones aprobadas.
- 381 comprobaciones de flujo actualizado, en perfiles móviles Android/iPhone de Chromium.
- 2375 comprobaciones responsive: nueve tamaños, texto raíz 100%/200%.
- 54 comprobaciones adicionales de interacción.
- 18 capturas de las seis secciones principales idénticas a la demo Mobile 2.4.2 anterior.
- Reconstrucción del ZIP con el mismo SHA-256; seis miembros, CRC y SHA256SUMS verificados.

Se conservan los escenarios de alta inicial/adicional, configuración posterior, archivadas/restauradas, legacy, estados previos protegidos, filtros, detalle, Dashboard, pausa/reanudación, recarga y contextos independientes. Se sustituyen exclusivamente las expectativas que exigían el mapeo gestual incorrecto; no se desactivan casos ni controles de errores JS.

Los nuevos recorridos verifican cuatro estados por gesto y por botón, preview antes de soltar, corrección mediante Anterior, Omitir sin escritura, distancia insuficiente, diagonal, retorno al origen, touchCancel, segundo contacto, borde, scroll real fuera de la zona, movimiento reducido, teclado, error/conflicto iniciado por gesto y respuesta tardía gestual al cambiar contexto. La emulación usa eventos táctiles CDP para contactos reales del navegador, no sólo dispatch de eventos sintéticos sin puntero activo.

Los reportes y capturas quedan separados en `.tools/mobile-242-academic-gestures-regression/`, `-flow/`, `-checks/`, `-interaction/` y `-visual/`; el reporte del build está en `.tools/mobile-242-academic-gestures/build-report.json`. No forman parte del ZIP.

## Paquete estático y seguridad

Carpeta: `/workspace/correlativas/.tools/mobile-242-academic-gestures/dist`.
ZIP: `/workspace/correlativas/.tools/mobile-242-academic-gestures/correlativas-mobile-242-academic-gestures.zip`.
Checksum: misma ruta con sufijo `.zip.sha256`.

SHA-256:

```text
ade1e2bb344cf78a9420608d018b7090cc9fee5ebaaf6176d1f5be2bddbe7285
```

Seis archivos, sin carpeta envolvente:

```text
SHA256SUMS
_headers
index.html
assets/index-DBrjoxWX.js
assets/index-p6MNkUQY.css
assets/logo-DbaGozUD.png
```

`SHA256SUMS` contiene los cinco hashes restantes; `verification.json` registra también su propio hash y el del ZIP. No se empaquetan fuentes JSX, tests, informes, node_modules, source maps, temporales, .env ni credenciales.

Se mantienen byte por byte `_headers` y la meta CSP aprobados: connect-src none, sin scripts/CDN externos ni SDK Firebase/Capacitor; mismas 24 familias de paquetes incluidas que la base. Se preserva style-src unsafe-inline, excepción ya aprobada necesaria para MUI/Emotion. No hay service worker, manifiesto instalable, autenticación o solicitudes de permisos añadidos. Se verifica el grafo de módulos, patrones de credenciales, whitelist de archivos, cabeceras en preview y eventos durante los recorridos.

No se observaron errores JavaScript, solicitudes externas, descargas ni popups en las ejecuciones finales. Estas pruebas y escaneos no constituyen una auditoría completa de seguridad o certificación WCAG. No se hizo npm audit ni actualización porque no cambiaron dependencias.

## Limitaciones y pruebas físicas

El perfil iPhone ejecuta Chromium con viewport/user-agent/touch de referencia; **no es Safari ni WebKit**. No se realizaron nuevas pruebas físicas, VoiceOver/TalkBack, teclado del SO ni verificación real de safe areas. El 200% de fuente raíz no equivale a todas las opciones de texto o zoom del sistema. No se asume paridad certificada por estas pruebas.

En Safari iPhone y Chrome Android comprobar:

1. Cuatro direcciones desde la zona indicada: estado previsto durante el movimiento, escritura correcta y avance sólo al confirmar. Probar despacio y con el dedo saliendo de la zona.
2. Intentos cortos, diagonales, volver al origen, interrumpir un contacto y dos dedos: no deben registrar estados.
3. Scroll vertical sobre el título, cuerpo de la tarjeta y fuera de ella; la página debe desplazarse sin cambiar materia/estado. Revisar comodidad y claridad de la zona dedicada frente al gesto web en toda la tarjeta.
4. Anterior para corregir; Omitir sin Pendiente; botones de los cuatro estados, foco y anuncios con VoiceOver/TalkBack.
5. Movimiento reducido, texto grande, orientación horizontal, barras del navegador, borde/Atrás y teclado en otras pantallas.
6. Pausar/reabrir la misma URL, cambiar carrera y simular error/conflicto/respuesta tardía: nada debe aplicarse al contexto equivocado ni sobrescribir estados previos.

La persistencia es sólo local por origen/perfil, sin sincronización ni respaldo. Limpieza, modo privado o evicción pueden perderla. Se conserva el uso offline después de cargar, sin garantía de inicio en frío sin conexión. El logo histórico sigue pesando aproximadamente 1,23 MB y no se optimizó fuera de alcance.

## Entrega y publicación pendientes

La ruta del ZIP es interna, no una URL pública. No se hizo commit, push ni despliegue de esta corrección. Tras autorización específica se podrá entregar por GitHub. Cualquier publicación en Cloudflare requerirá autorización aparte: proyecto Direct Upload aislado, sin conectar repositorio, automatizaciones o dominios productivos, subiendo exclusivamente los seis estáticos y conservando `_headers` y `assets/`. Después habrá que verificar HTTPS, cabeceras y hashes remotos antes de validar físicamente. Aquí no se creó ni modificó ningún proyecto de hosting.
