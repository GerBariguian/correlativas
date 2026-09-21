# Motor de proyección — v1.10.0, etapa 1

`src/projectionLogic.js` es independiente de React, Firebase, almacenamiento y
reloj del sistema. Importa únicamente funciones académicas puras de `logic.js`.
No modifica el catálogo, los escenarios ni el progreso recibido. La interfaz de
etapa 2 consume este motor sin incorporar reglas académicas propias.

## Contrato

```js
projectCareer({
  career, // catálogo: id, plan y subjects
  statusMap, // progreso real, solo como entrada
  scenario: {
    startPeriod: { year: 2027, term: '1C' },
    initialCapacity: 3,
    capacities: [
      { period: { year: 2027, term: '2C' }, capacity: 4 },
    ],
    finalEvents: [
      { code: 'CODIGO', period: { year: 2027, term: '2C' } },
    ],
    maxPeriods: 40,
  },
})
```

Las capacidades del motor son enteros seguros no negativos de JavaScript; los períodos sin override usan
`initialCapacity`. Cero permite una pausa. Horizonte por defecto: 40 períodos;
máximo admitido: 120. No se infiere dificultad ni capacidad desde horas.
Se rechazan períodos anteriores al inicio, duplicados de capacidad, múltiples
eventos de aprobación para el mismo código, estados desconocidos y referencias
inválidas. Los códigos ausentes del mapa se interpretan como Pendiente.

La elegibilidad académica de Proyecto Final de UADE Informática sigue exclusivamente el catálogo actual
(`prereqs: []`). Su requisito real de avance/cantidad de materias es desconocido.
Esto puede adelantar Proyecto Final respecto de su habilitación académica real.
Queda pendiente incorporar el requisito oficial, separado de la política temporal.
No se usa `year: 5` como requisito, un año calendario mínimo ni la fecha de inicio
de carrera. El año curricular solo puede desempatar el ranking.

## Orden de cada período

1. Reservar cupos para materias en continuación, incluidas las inicialmente Cursando.
2. Seleccionar materias Pendientes académicamente habilitadas al inicio y
   temporalmente admisibles. No usar resultados de otra materia del mismo período.
3. Al cierre, las cursadas que terminan pasan a Regularizada.
4. Evaluar eventos de final contra una única copia de ese estado de cierre.
   Un final requiere Regularizada y `canTakeFinal`. Puede rendirse al cierre
   de su propia cursada, pero otro final aprobado en ese mismo cierre no satisface
   sus requisitos: esa aprobación afecta períodos posteriores.
5. Las aprobaciones válidas se aplican solo al mapa hipotético.

La etapa 1 supone que toda materia inicialmente Cursando termina el período inicial
como Regularizada, incluso Proyecto Final: no conocemos su fecha histórica de
inicio. No implica aprobación. Si hay al menos una Cursando, el período inicial
representa la cursada real: `readOnly: true`, incluye todas las Cursando, no inicia
otras y devuelve `addCandidates: []`. Su capacidad refleja la cantidad real,
independientemente de `initialCapacity` y de overrides para ese primer período.
El comando de edición lo rechaza y las selecciones manuales dirigidas a él son
entrada inválida. La UI muestra «En curso» y no ofrece botones de edición.
Sin Cursando iniciales, el primer período permanece planificable.

Un evento imposible se informa y detiene el recorrido con `invalid-event`.
Los eventos válidos del mismo cierre quedan identificados en el resultado parcial.
No se realizan reintentos automáticos de finales rechazados.

## Grafo y ranking

Se preservan tres tipos de aristas: regularización para cursar, aprobación para
cursar y aprobación para final. ALL se expande como en `logic.js`, excluyendo
la propia materia, elective y excludeFromAllFinals. La detección de ciclos usa
hitos distintos de regularización y aprobación, evitando confundir ambos estados.

Cada candidato expone listas de dependientes directos (de cualquiera de los tres
tipos), descendientes únicos y desbloqueos efectivos de cursada al pasar a
Regularizada. No cuenta un dependiente como desbloqueado si falta otro requisito.
Orden: más desbloqueos efectivos, más descendientes, más dependientes directos,
año curricular ascendente, cuatrimestre curricular y finalmente código
lexicográfico. Dentro de cada grupo empatado en las tres métricas, se compara
`year` solo si todos tienen un entero positivo. Si falta o es inválido en alguno,
todo ese grupo desempata por código. Dentro de cada año comparable se compara
`term` solo si todos tienen exactamente `1C` o `2C`; cualquier otro valor hace
que ese subgrupo desempate por código. No se interpretan etiquetas como Anual,
verano, números o calendarios de otras carreras. La comparación por grupos evita
comparadores no transitivos con metadata parcial. No se usa locale, azar,
horas ni dificultad. Es una heurística explicable, no un optimizador global.
La metadata no habilita ni bloquea materias: una materia habilitada de año 5
puede cursarse desde el primer período, incluido Proyecto Final en 1C.

## Duraciones y restricciones temporales generales

`durationPeriods: 1 | 2` representa cursada de un cuatrimestre o anual.
`allowedStartTerms: ['1C'] | ['2C'] | ['1C', '2C']` restringe comienzos.
Sin duración explícita, la metadata preexistente exacta `term: 'Anual'` significa
dos períodos; las demás etiquetas conservan el comportamiento anterior de un período.
No se deduce duración de nombres, IDs, horas o año curricular.

Las anuales inician únicamente en 1C, continúan en 2C, consumen un cupo en ambos
y regularizan solo al segundo cierre. Las dependientes se habilitan posteriormente.
Se comprueba la reserva TOTAL de continuaciones antes de iniciar otra anual, de
modo que varias anuales no sobrecarguen un segundo período de menor capacidad.
Una selección manual de comienzos suma sus continuaciones obligatorias.
No se puede editar/mover una continuación por separado; se edita el inicio.

Proyecto Final de UADE Informática 1621 migra a `durationPeriods: 2` y
`allowedStartTerms: ['1C']` en su catálogo, sin cambiar prereqs. El motor ya no
consulta su ID. UCA usa sus cuatro etiquetas `Anual` existentes, sin modificar
correlativas. También se respetan las etiquetas Anual de los demás catálogos.

Duración y oferta no alteran `canCourse`/`canTakeFinal`: solo afectan calendario.
Una duración inválida o una anual con inicio 2C es error de metadata, no se ignora.

## Salida y terminación

`outcome`: complete, finals-pending, blocked, horizon, capacity-conflict,
invalid-event o invalid. Incluye errors, periods, copia final statusMap, blockers,
eligiblePending, continuations, eventDiagnostics y summary. Un input inválido
conserva el mapa original y no genera períodos.
Cada período identifica started, continuing, completedCourses, approvedFinals,
rejectedFinals, ranking y su estado hipotético de cierre.

### Diagnóstico de cada evento (etapa 1.2)

`eventDiagnostics` contiene una entrada por elemento de `finalEvents`, en el orden
solicitado, identificada por `eventIndex`, `code` y `period`:

- `applied`: aprobación aplicada al cierre solicitado (`APPROVED_AT_PLANNED_CLOSE`).
- `blocked`: cierre evaluado sin poder rendir (`FINAL_NOT_AVAILABLE`), con
  `subjectStatus` y `missingApproved`. La materia debe estar Regularizada además
  de satisfacer los requisitos de aprobación. También se incluye en `errors`.
- `not-reached`: no se evaluó ese cierre. `OUTSIDE_HORIZON` indica un evento fuera
  del horizonte configurado; `STOPPED_*` identifica otra terminación anticipada
  (por ejemplo `STOPPED_INVALID_EVENT`, `STOPPED_CAPACITY_CONFLICT` o
  `STOPPED_COMPLETE`). No afirma que el final estuviera académicamente bloqueado.
- `invalid`: la entrada global no permite simular (`INVALID_INPUT`); `errors`
  detalla la validación fallida. Todos los eventos quedan sin ejecución. Si
  `finalEvents` no es un array, se informa el error de lista y no hay entradas.

La UI debe consultar esta lista, no deducir ejecución exitosa de `errors: []`.
No se mueven eventos, no se reintentan ni se inventan aprobaciones. Un rechazo
detiene la simulación como antes; los eventos posteriores quedan `not-reached`.

### Clasificación de cursadas (etapa 1.2)

- `blockers`: exclusivamente Pendientes que no satisfacen `canCourse`, con
  `regularized` y `approved` faltantes. En cada período describe el estado de
  **inicio**; en la salida global describe el estado final simulado.
- `periods[].eligibleNotSelected`: candidatas académicamente habilitadas al
  inicio que no se eligieron. `START_TERM` indica restricción temporal;
  `CONTINUATION_CAPACITY`, falta de cupo para el segundo período anual;
  `CAPACITY_AFTER_RANKING`, cupos ocupados por continuaciones o candidatas
  prioritarias. Si coinciden causas, se informa primero la temporal.
- `eligiblePending`: Pendientes habilitadas en el estado final, con
  `SIMULATION_ENDED`, el `outcome` y los términos de inicio admitidos. No afirma
  que hubieran estado habilitadas al inicio del último período: una aprobación
  o regularización al cierre puede haberlas habilitado recién entonces.
- `continuations`: materias todavía Cursando, con `expectedCompletion`. No
  cuentan como materias académicamente bloqueadas ni como otra materia adicional.

`allowedStartTerms` describe únicamente la política temporal del motor, no oferta
real. Los diagnósticos por período explican cupo/ranking; los globales explican
qué quedó al terminar, incluso cuando el corte fue por horizonte.

`summary` distingue coursesComplete y academicComplete, estimatedCourseEnd y
estimatedAcademicEnd. Si ya estaba terminado al comenzar, la fecha es null:
no se conoce su fecha histórica. Si quedan finales, la fecha académica es null.
Los finales pendientes muestran si están disponibles y sus aprobaciones faltantes;
los bloqueos de cursada distinguen regularizadas y aprobadas necesarias.

No se exige rendir un final para seguir una cadena que solo requiere regularización.
Un período vacío puede conservarse si hay cualquier evento de final futuro,
una continuación o un futuro cupo temporalmente admisible dentro del horizonte.
Se llega al cierre solicitado para evaluar incluso un final bloqueado, siempre
dentro del horizonte y salvo otra terminación explícita. Si el evento está fuera
del horizonte se identifica como tal; nunca se extiende el horizonte para rendirlo.
Esto puede producir períodos vacíos adicionales respecto de la etapa 1.

El criterio académico de etapa 1 es aprobar todas las entradas del catálogo.
No certifica graduación ni resuelve créditos de electivas, equivalencias, vencimientos,
defensas u oferta real. optional no cambia el criterio por inferencia.

Capacidades por período siguen admitidas como entrada para escenarios automáticos.
Las selecciones explícitas de etapa 2.1 se describen abajo. No reutilizar el mapa
simulado como entrada a servicios de persistencia o sharing.

## Verificación local

`npm.cmd run test:projection` ejecuta el motor sin red. `npm.cmd test` lo incluye
junto a las suites existentes. Ningún test nuevo inicializa Firebase.

## Interfaz de etapa 2.1

`CareerProjectionPage` es una vista independiente de App, sin dependencia de
Planner, servicios sociales o persistencia. Recibe únicamente carrera y statusMap;
no recibe callbacks de escritura. El escenario vive en memoria y se descarta al
salir de la vista o cambiar de usuario/carrera. Cambios en el progreso recibido
recalculan con el motor; el resultado nunca se copia al progreso real.

La carga inicial seleccionada es 4, editable con − / cantidad / + o escritura
directa de un entero positivo. No se simula antes del CTA.
El período inicial propone el cuatrimestre calendario local actual y es editable;
no representa una regla de habilitación académica ni una oferta oficial.
No se encontró otra fuente de calendario en App: se conserva el default anterior,
inicializado una sola vez al montar. Su edición queda en un desplegable secundario.
El horizonte es de 40 períodos. La carga elegida se usa para la propuesta automática;
después se cambia agregando/quitando materias, sin selector de capacidad.
`initialCapacity` se aplica a los próximos períodos automáticos planificables,
no a la cursada real ni como máximo de las selecciones manuales: una propuesta
de 5 puede quedar en 3 o crecer a 6, respetando requisitos al inicio.
Un resultado invalid/capacity-conflict/invalid-event se presenta como error de
generación, sin resumen, timeline ni paneles de resultados parciales.
Generar nuevamente reemplaza las decisiones anteriores y se ofrece dentro de
«Nueva propuesta», con una aclaración explícita.

Resumen y finales describen el cierre simulado. Los finales de materias todavía
Pendientes no se incluyen como finales de cursadas ya regularizadas. La timeline
muestra nombres y continuidad anual; código y estado de cierre se consultan al
expandir una materia. Los finales están en un panel cerrado por defecto. Las inicialmente
Cursando mantienen la suposición documentada de completar el primer período.
Proyecto Final conserva la política temporal de etapa 1.2 y la limitación pendiente
de su requisito académico oficial, sin mostrar detalles internos en las cards.

No hay editor de eventos de aprobación: `finalEvents` siempre es vacío en esta
vista. Una futura incorporación deberá presentar `eventDiagnostics`, incluidos
eventos no alcanzados, sin deducir éxito de la ausencia de errores.

Los componentes reutilizan superficies, botones y variables de color existentes.
El resumen privilegia la fecha de cursadas en una sola columna. Las filas son
compactas, envuelven nombres largos y tienen botones de quitar con nombre accesible.
«Agregar materia» abre un panel local desplazable, navegable con teclado mediante
details/summary nativos, sin modal ni lógica de foco propia. No se introduce un sistema de temas:
la hoja actual no define un modo oscuro propio; los nuevos estilos usan sus tokens.
Los tests de integración renderizan JSX y ejercitan handlers de la vista con el
motor real mediante el harness local, sin navegador, Firebase ni dependencias nuevas.

## Selecciones manuales: contrato de etapa 2.1

`scenario.manualPeriods` es opcional: `[{ period: { year: 2030, term: '1C' },
codes: ['CODIGO'] }]`. Cada entrada expresa la lista EXACTA de materias que deben
**comenzar** en ese período. `codes: []` permite dejarlo vacío. No incluye
continuaciones: estas siempre se reservan por el motor y se suman a la carga.
Se rechazan períodos duplicados, códigos inexistentes/repetidos y fechas anteriores
al inicio. Una materia no puede tener dos ubicaciones manuales.

En períodos editados no se completan automáticamente los lugares libres. En los
demás sigue funcionando el ranking E/I/D/año/término/código y la capacidad inicial.
Las materias con ubicación manual se reservan globalmente: el ranking no puede
tomarlas antes ni moverlas después si su decisión resulta inválida.

`editProjectionPeriod(scenario, projection, period, code, 'add'|'remove')` es un
comando puro. La primera edición captura las materias ya propuestas en el período.
Quitar conserva las otras y reduce la carga; la materia quitada queda disponible
para la propuesta automática posterior. No se elimina del catálogo ni del progreso.
Agregar conserva las otras y aumenta la carga. Si la materia estaba fijada en otro
período, se retira de esa selección: la UI indica «Prevista en … / Mover aquí».
Los períodos no editados se recalculan; las decisiones manuales permanecen.

`periods[].addCandidates` sale del motor: exclusivamente materias Pendientes que
satisfacen requisitos al INICIO y las restricciones temporales, excluyendo las ya
seleccionadas. React no calcula correlativas ni usa el estado de cierre para agregar.
No hay tope arbitrario de agregado: los códigos únicos del catálogo y la
elegibilidad determinan cuántas materias pueden seleccionarse.

`placementDiagnostics` identifica cada materia solicitada y su período:
`applied`, `blocked`, `not-reached` o `invalid`. Un rechazo académico incluye listas
`regularized` y `approved` faltantes; también se distinguen estado no Pendiente,
inicio temporal inválido y cupo de continuación. No detiene otras selecciones
válidas, no mueve la materia ni rellena el lugar. La UI muestra las decisiones
afectadas y permite liberarlas explícitamente para que vuelvan al ranking automático.
Los diagnósticos de eventos de final conservan su contrato independiente.

Proyecto Final sigue siendo una materia. Su inicio manual solo admite 1C; continúa
en 2C aunque este tenga una selección manual de comienzos vacía. Agregar el inicio
reserva un cupo adicional en un 2C editado; no elimina sus otras selecciones.
Para quitarlo se edita su inicio, no se borra únicamente la continuación. Las materias
realmente Cursando no se pueden quitar desde esta simulación.

Limitaciones: no hay drag & drop, editor de finales, persistencia ni calendario
oficial. Una selección inválida queda pendiente de revisión hasta que se la libere
o recupere sus requisitos. Requisito académico real de Proyecto Final aún pendiente.

## Generalización de cantidad e investigación entre catálogos

Se retiró el límite anterior de 100 materias. La UI exige cantidad inicial positiva;
el motor conserva 0 para pausas y compatibilidad con escenarios existentes.
El único límite numérico es `Number.MAX_SAFE_INTEGER` (9.007.199.254.740.991), por
representación exacta de enteros en JavaScript. No es un límite académico. No se
reservan arrays del tamaño de la carga: se itera el catálogo. Las decisiones
manuales siguen pudiendo dejar períodos vacíos y superar la carga inicial.

Se probó el registro real `src/data/careers.js`, con cargas 3, 4, 5, 7 y 9, tanto
desde initialStatus como desde un progreso coherente con cursadas en curso:

| Catálogo | Materias | Resultado desde initialStatus sin finales |
| --- | ---: | --- |
| UADE Informática 1621 | 52 | Cursadas completas; finales pendientes |
| UADE Industrial (plan a confirmar) | 54 | Cursadas completas; finales pendientes |
| UCA Teología Sistemática (plan a confirmar) | 86 | Cursadas completas; finales pendientes |
| UBA Odontología 2021 | 63 | Cursadas completas; finales pendientes |
| UBA Actuario | 31 | Cursadas completas; finales pendientes |
| UTN Industrial 2023 | 45 | Bloqueos por aprobaciones requeridas |
| UTN Industrial 2007 | 44 | Bloqueos por aprobaciones requeridas |
| UTN Sistemas 2023 | 44 (incluida PPS) | Bloqueos por aprobaciones requeridas; PPS sin calendario |

El fallo reportado de UCA NO se reprodujo con esos datos. No se dispone del mapa
de progreso que falla: no puede atribuirse su causa exacta. No hay referencias
ausentes ni ciclos en ese catálogo; sus etiquetas de semestre/Anual/Final no
invalidan entradas ni se interpretan como correlativas o calendarios de UADE.
Se verificó un ejemplo SINTÉTICO que produce el mismo error genérico:
HF2 Cursando con HF1 Pendiente contradice `prereqs: ['UCA-TS-HF1']`.
HF1 Regularizada permite cursar HF2, pero no habilita su final. Esto demuestra
una vía posible de fallo, no la causa confirmada del caso real.

No se relajó la consistencia del progreso. `INCONSISTENT_STATUS` agrega al
diagnóstico el estado, las regularizaciones/aprobaciones faltantes para cursar
y las aprobaciones faltantes para final. «Ver qué impide proyectar» traduce causas
de catálogo, ciclo, progreso, período, horizonte o eventos sin imprimir objetos
internos. Todo queda en memoria; no se envía telemetría ni se consulta producción.

Para reproducir el caso real se necesita: código de materia señalado y su estado,
estados de sus requisitos, período inicial y carga. Si no alcanza un ejemplo mínimo,
el mapa completo código→estado y las decisiones manuales del escenario que falla,
sin datos personales. No se deben inventar equivalencias/excepciones para validarlo.

La limitación anterior sobre UCA se resolvió al incorporar soporte genérico para
`term: 'Anual'`. Las modalidades ambiguas y ofertas no documentadas siguen sin
inferirse. Compatibilidad estructural no certifica fechas académicas oficiales.

## Actividades no calendarizables

`projectionKind: 'activity'` conserva una entrada en el seguimiento académico pero
no la coloca en la timeline ni en candidatos, no ocupa cupo y no regulariza ni
aprueba automáticamente, incluso si inicialmente figura Cursando. No admite pins
ni eventos de final como sustituto de su acreditación.
`summary.pendingActivities` informa estado, elegibilidad de inicio y requisitos
faltantes. No impide calcular el fin de las cursadas, pero sí completar
académicamente la carrera mientras no esté Aprobada. La UI la muestra por separado.
Las demás entradas mantienen `projectionKind: 'course'` implícito.

Esta extensión se utiliza para PPS de UTN Sistemas: 200 horas reloj,
requisitos de inicio/acreditación iguales a los de inscripción de Proyecto Final,
sin fecha de finalización inventada ni un 1C/2C obligatorio.

El catálogo de UTN Buenos Aires Sistemas 2023 utiliza esta metadata general para
sus 17 anuales, Ingeniería y Sociedad en 2C y PPS. Fuentes, correlativas, siete
slots electivos y alcance de Proyecto Final: [UTN Sistemas 2023](utn-sistemas-2023.md).
