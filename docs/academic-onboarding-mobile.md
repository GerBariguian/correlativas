# Etapa 4 — onboarding mobile aprobado

La experiencia de tarjetas se muestra hasta 600 px de ancho. Por encima se
conserva la carga desktop. Ambas vistas editan el mismo borrador; bienvenida,
revisión y confirmación reutilizan el controlador existente. No se agregaron
servicios, dependencias, Rules ni escrituras automáticas.

## Comportamiento

- Derecha Aprobada, izquierda Pendiente, arriba Cursando, abajo Regularizada.
- Indicador desde 18 px; decisión al soltar desde 65 px, sólo si una dirección
  domina claramente. Cancelación, pérdida de captura y diagonales ambiguas no
  deciden. Los cuatro botones accesibles ejecutan la misma operación de dominio.
- Omitir avanza sin asignar estado. Una materia ya decidida muestra Siguiente y
  conserva su decisión. Deshacer/Rehacer operan sobre el historial compartido.
- Todo progreso previo, incluido Pendiente, queda excluido. Sin revisar no se
  convierte automáticamente en Pendiente. Las materias sin período conservan
  esa condición, sin inventar cuatrimestres.
- La revisión mobile permite elegir la materia a corregir. Sólo Confirmar guarda.
- El gesto captura únicamente la tarjeta; fuera de ella se puede desplazar la
  página. Reduced motion elimina transformaciones y animaciones de la tarjeta.

## Prueba manual con Emulator (sin cuentas productivas)

Usar las dos terminales de [manual-emulator.md](manual-emulator.md): Auth y
Firestore con `firebase.emulators.json`, proyecto `demo-correlativas-manual`,
y luego `npm.cmd run dev:emulator`. Abrir **http://127.0.0.1:5174** y verificar
el indicador «Emulator local». No usar el servidor normal ni credenciales reales.

1. Entrar con usuario ficticio, seleccionar carrera y abrir Configurar materias.
2. Chrome DevTools: emulación 390 × 844. Probar también 320 px y desktop >600 px.
3. Probar cuatro arrastres desde el centro, sus indicadores y botones equivalentes.
   Un arrastre corto/diagonal no decide; desplazar fuera de la tarjeta sí desplaza
   la página. Probar cancelación y el ajuste reduced motion de DevTools.
4. Omitir, Deshacer/Rehacer y pasar a desktop: deben conservarse las decisiones.
5. Revisar, elegir una materia y corregirla. Confirmar una vez; volver a abrir y
   verificar que las materias guardadas están protegidas, incluyendo Pendiente.
6. Usar sólo teclado y botones para recorrerlo. Verificar nombres largos, ausencia
   de desbordamiento horizontal y acceso a controles con zoom/texto ampliado.
7. Probar otra pestaña con una edición concurrente antes de confirmar: el error
   debe requerir recargar, nunca sobrescribir ni reintentar automáticamente.

Instances requiere una cuenta sintética previamente preparada en Emulator con
autoridad instances/complete. Este cambio no habilita ni migra cuentas.

## Evidencia local

- 12 tests mobile nuevos, incluidos gestos, cancelación, dominio compartido,
  integración con controlador real legacy/instances en harness y fallo de permisos.
- Suite Node completa: 1090/1090 PASS, 0 FAIL y 0 skipped.
- Build PASS (permanece advertencia de bundle mayor de 500 kB).
- Sintaxis y git diff --check PASS.

El usuario confirmó la validación visual y funcional de la implementación real
en Firebase Emulator, incluido guardado y protección del progreso previo.
También aprobó la tarjeta «Actualizá tu recorrido» y el ajuste responsive de los
selectores de universidad/carrera. Los tests de handlers/CSS complementan esa
validación manual; no equivalen a una matriz de dispositivos físicos.
No se ejecutó una nueva suite automatizada Emulator en el cierre: Rules y
persistencia permanecen sin modificaciones. Ambos prototipos se conservan.
Cierre autorizado mediante commit local, sin push, deploy ni publicación.
