# Demo mobile de onboarding

Abrir `index.html` directamente en un navegador (no necesita servidor ni Firebase).
Activar emulación móvil de DevTools, por ejemplo 390 × 844, y recargar.
Alternativamente, con Vite local ya iniciado, abrir exclusivamente
`/prototypes/academic-onboarding-mobile/`.

Arrastrar desde el centro de la tarjeta al menos 65 px:
- derecha: Aprobada;
- izquierda: Pendiente;
- arriba: Cursando;
- abajo: Regularizada.

Los mismos estados tienen botones visibles. Arrastres cortos, cancelados o
diagonales ambiguos no deciden. La captura táctil se limita a la tarjeta;
deslizar fuera de ella permite desplazar la página. Reduced motion suprime
transformaciones de arrastre y transiciones.

Probar Omitir, Deshacer y Rehacer; abrir Revisión y tocar una materia para
corregirla. Confirmar sólo muestra un cierre de demo, sin guardar nada.
Reiniciar o recargar descarta todas las decisiones.

Datos ficticios: ocho materias, dos protegidas con progreso previo
(Aprobada y Pendiente), seis clasificables. Año/período incluyen Anual y
Período no especificado. Sin revisar nunca equivale a Pendiente.

Limitaciones: es un prototipo visual independiente, sin dominio/controlador
productivo, sesión, persistencia ni integración desktop/mobile real. La
emulación con mouse no acredita comportamiento físico en iOS/Android;
queda pendiente probar los gestos en dispositivos y aprobar el diseño.
