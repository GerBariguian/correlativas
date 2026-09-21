# Planificación de finales

Esta etapa reemplaza las limitaciones históricas del editor de finales descritas
en las etapas 1/2 del motor. No modifica el progreso real, sharing o planes conjuntos.

## Semántica

Un evento es una intención de rendir. Si está Regularizada al cierre y satisface
`canTakeFinal`, la simulación supone aprobación para los períodos siguientes.
Todos los finales del mismo período se evalúan contra una única instantánea
anterior a los finales: el orden del array no habilita cadenas del mismo cierre.
Una cursada que termina en ese cierre sí puede rendirse entonces. Las anuales
regularizan solo al terminar su segundo período. `allowedStartTerms` regula
cursadas, no finales. PPS y actividades no calendarizables nunca se aprueban así.

Los eventos bloqueados permanecen en su período y no interrumpen otros eventos o
cursadas. Los códigos retirados, períodos anteriores al inicio y actividades se
diagnostican individualmente. Los eventos fuera del horizonte siguen visibles.
Un evento de una materia realmente Aprobada queda inactivo, incluso si la carrera
ya está completa. Si vuelve a Regularizada se reevalúa; no se borra ni se guarda
automáticamente por un cambio del progreso real.

## Editor

La sección general Finales contiene finales pendientes reales, finales futuros
de cursadas proyectadas y todos los eventos conservados, incluidos los inválidos
y los ya aplicados en la simulación. No se construye solo con los finales restantes
del último cierre, porque perdería los eventos exitosos.

Cada materia permite Planificar/Cambiar período y volver a Sin período mediante
«Quitar período». El selector evalúa
los períodos del horizonte mediante `getFinalPeriodOptions`: sustituye el evento
de esa materia y ejecuta el mismo motor, sin reglas académicas duplicadas en React.
Solo habilita opciones cuyo diagnóstico sea `applied`. `editPlannedFinal` verifica
otra vez la elección; quitar un evento siempre es una decisión explícita.

Se calcula la lista de opciones solamente para la materia editada, con memoización.
La timeline muestra un resumen desplegable de eventos, no otro editor. Una
finalización simulada se rotula como estimación condicionada a aprobar los finales;
«Carrera completada» se reserva a la aprobación real de todos los elementos.

## Organización visual del editor

El encabezado integra el estado discreto de guardado y el reset secundario; los
errores de sincronización y conflictos conservan sus mensajes y acciones debajo.
Después de la configuración y el resumen aparecen los avisos, Finales, la timeline,
los requisitos pendientes y las actividades no calendarizables.

Finales es plegable y muestra contadores de revisión y planificación aun cerrado.
La vista inicial Relevantes incluye pendientes reales y todos los eventos guardados:
primero revisión, luego pendientes reales, planificados futuros y otras decisiones.
Los filtros Relevantes, Requiere revisión, Planificados, Pendientes reales, Futuros,
Ya aprobados y Todos se solapan; sus contadores no son sumandos de un total.
No hay búsqueda ni paginación. Un filtro vacío ofrece Ver todos.

Solo la fila en edición calcula opciones. El año es una vista local; se obtiene de
las opciones del motor y cambiarlo no guarda nada. Los botones de cuatrimestre
usan la elegibilidad del motor y muestran diagnósticos visibles para las opciones
no disponibles. No se acorta ni amplía el horizonte. Un evento inválido o fuera del
horizonte sigue mostrando su período original, diagnóstico y acción para quitarlo.

La fila en edición permanece montada al cambiar de categoría o desaparecer de la
lista del motor; en este último caso deja de ofrecer opciones y no reutiliza una
elegibilidad anterior. Al cerrar un editor cuya fila queda oculta se enfoca el
encabezado del panel. Los filtros y la navegación no llaman a la persistencia.

La timeline distingue eventos activos, revisiones e intenciones inactivas, y ofrece
Ir a Finales: abre el panel y enfoca su summary nativo. No duplica el editor.
Filtros con aria-pressed, controles nativos, diagnósticos asociados y foco visible
mantienen la navegación de teclado; las filas y controles se apilan en móvil.

## Persistencia y validación

Ver [persistencia v1/v2](career-projection-persistence.md). Se reutilizan el
debounce de 800 ms, la cola, revisión/transacción, reset y aislamiento por sesión.
No se agregan índices ni dependencias. El modelo solo admite un evento por código,
sin intentos múltiples, fechas exactas ni mesas oficiales.

Los tests incluyen finales reales/futuros, anuales, PPS, correlativas, mismo cierre,
final bloqueado con eventos posteriores, cambios reales y manuales, documentos v1,
migración v2, codec, autosave, reload, conflictos, reset, Rules y ocho catálogos.

Limitaciones conservadas: las materias inicialmente Cursando se estiman terminadas
al primer cierre porque no se conoce su fecha histórica; no hay garantía offline,
calendario de mesas ni vencimientos de regularidad. El horizonte editable actual
sigue siendo de 40 períodos. Un error estructural de catálogo/progreso puede
invalidar todo el escenario: se informa sin relajar requisitos.

Antes de usar el nuevo cliente contra una base remota deben estar publicadas Rules
compatibles con v2. Este trabajo solo las valida en Emulator y no las despliega.
La revisión visual y de concurrencia real en navegador queda como comprobación
manual posterior, sin que sea necesario consultar producción para los tests.
