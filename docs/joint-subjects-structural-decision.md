# Etapa 6 — unidad de persistencia y autorización de Subjects

2026-10-01. **DESIGN ONLY.** Recomendación para un prototipo futuro, no arquitectura adoptada ni permiso de integración.

Fuentes revisadas: `slot-bc-report.md`, `slot-bc-evidence.json`, `slot-subject-diagnostic.md`, `joint-operational-participant-decision.md`, `slot-prototype-report.md`, y flujo actual de subjects en `src/services/jointPlans.js`. No se repitieron experimentos.

## Decisión de producto recibida

Se preguntó explícitamente si asignar a cinco debía ser all-or-nothing o podía consistir en cinco relaciones independientes. Respuesta del usuario: **“Relaciones independientes con éxito parcial explícito”.**

Esto autoriza diseñar atomicidad por relación, no esconder fallos parciales ni adoptar una implementación. No se interpreta como autorización de backends, cambios de invitations, migración, UI o release.

## Problema demostrado y frontera

La prueba conjunta subject + subjectCheck pasó con dos/tres participantes y falló con cuatro por accesos/expresiones. B+C quitó índice del camino y repartió comprobaciones, pero el primer caso válido owner + cuatro joined falló por 1000 expressions. No apareció Service call error en ese ensayo: no demuestra margen de accesos. Ninguna mitad persistió; los gates posteriores quedaron sin ejecutar.

No microoptimizar B+C. Se cambia la **unidad de autorización de Subjects**, no invitations. Reutilizar fixed slots, índice de unicidad/lifecycle, occurrences inmutables, ciclos, NEW/REINVITE/JOIN/RELEASE/REASSIGN, authority e instancias. Su evidencia aislada no equivale a una integración completa ya validada.

Un subject común es un concepto académico; no tiene por qué ser un único documento que autorice simultáneamente a todas las personas.

## Atomicidad requerida, conveniente y heredada

| Tipo | Requisito |
| --- | --- |
| Seguridad requerida | Una relación cambia de estado y revisión indivisiblemente; prueba actor/target actuales; no escritura parcial que fabrique pertenencia, binding o consentimiento |
| Seguridad requerida | Base subject existente/vigente, plan abierto; transición coherente con lifecycle y authority al confirmar la operación |
| UX conveniente | Un gesto selecciona varios destinatarios y presenta sus resultados juntos |
| Implementación heredada | Reemplazar en un único documento todo proposedParticipantIds y escribir subjectCheck en el mismo commit |
| Decisión nueva aprobada | Las relaciones individuales pueden confirmar o fallar independientemente; no se promete rollback global |

La atomicidad slot↔index de C permanece intacta. No se usa esta decisión para debilitar JOIN/release ni la seguridad de una relación individual. Agrupar cinco writes en un batch vuelve a introducir presupuesto agregado; no es el mecanismo recomendado.

**Mínimo anterior de dos:** el modelo actual exige 2..5 en el array. Con el nuevo flujo hay estados persistidos intermedios de base vacía/una relación. Deben documentarse como preparación o selección incompleta, no presentarse como propuesta conjunta completa. El read model puede conservar el umbral de dos para esa presentación; no se fingirá que Rules aseguran globalmente ese umbral después de cada escritura independiente. Si otra acción futura exigiera un mínimo global de dos, necesita un contrato propio. No se adopta aquí una UI ni se conserva artificialmente el array para imponerlo.

## Alternativas A–F

### A. Base + assignment current por UID

Paths: `jointPlans/P/subjects/C` y `.../assignments/U`. Base contiene identidad y metadatos; assignment current contiene UID por path, target binding/ocupación, estado y revisión local. Cada transición comprueba actor y un target.

Ventajas: un path por UID evita duplicados y facilita lectura. Archive/freeze se consultan en futuras operaciones, no se copian. Riesgo: si el mismo UID sale y vuelve con otra ocupación, sobreescribir el mismo documento borra la relación histórica o exige archivarla atómicamente en otra colección. Sin esa distinción, un registro viejo puede parecer vigente por UID solamente. Tombstone local preserva revisión pero no resuelve por sí solo historia de múltiples ocupaciones.

SubjectCheck global no se justifica por inercia: un assignment autocontenido puede probar su propia transición. Un assignmentCheck sólo sería candidato si un presupuesto real lo exige, no parte automática de A.

### B. Subject-member edge ligado a una ocupación — RECOMENDADA

Path propuesto: `jointPlans/P/subjects/C/memberEdges/E`, con identidad determinista **UID + identidad de ocupación**. Conserva base común y relaciones separadas. A diferencia de A, una nueva ocupación produce otro edge; el anterior no se sobrescribe ni se elimina para hacer sitio.

Estado mutable dentro de cada edge: assigned/unassigned con revisión monotónica. Identidad, target UID y binding/ocupación de origen son inmutables. No es un log de comandos ni un certificado de operatividad: cada nueva asignación vuelve a consultar las fuentes actuales. Evita fan-out de archivo/release y conserva la relación anterior como historia.

### C. Command/operation por participante

`.../commands/opId` inmutable: assign/unassign, actor, target, expectedRevision, payload; `.../memberState/E` mutable como estado corriente. Command+state deben enlazarse bidireccionalmente en la misma operación o el command es sólo intención, no autorización.

Orden mediante revisión local, no timestamps cliente; replay opId reservado, comando stale rechazado. Leer sólo comandos exige reconstrucción creciente y reglas difíciles de ordenación; un current derivado evita eso pero agrega writes, lecturas y cleanup. Beneficio: auditoría completa de cada cambio, que no es requisito demostrado aquí. No recomendado introducir event sourcing para resolver este bloqueo.

### D. Fixed participant slots dentro de cada subject

`.../assignmentSlots/owner,slot1..slot4`, alineados con los seats del plan. Cada slot demuestra target actual y su ocupación. Si se alinean estrictamente, capacidad estructural sin contador; si permiten mapping libre, vuelven a necesitar índice para UID uniqueness.

El problema es lifecycle: al reasignar el slot del plan, el slot del subject no debe heredar al nuevo UID. Debe guardar ocupación exacta y conservar historia fuera antes de reemplazarla, o derivar inactividad. Puede autorizar localmente, pero duplica gestión de capacidad/slots en cada subject sin beneficio claro frente a E determinista por ocupación. Inicializar todos en batch no es necesario ni recomendable.

### E. Operaciones independientes y éxito parcial

Es principalmente un **contrato de orquestación**, compatible con A/B/D, no otra fuente de verdad. Multi-select produce intentos separados con resultado por target. No es un two-phase commit ni un “prepared=true” que autorice posteriormente.

Preparación cliente no bloquea archive/release/close; cada confirmación revalida. Si hay cuatro éxitos y un rechazo, los cuatro siguen vigentes y se informa el restante. Compensar borrando éxitos sería otra operación susceptible de fallar, no rollback garantizado. La decisión del usuario aprueba esta semántica para el diseño; no fija UX final.

### F. Relación bajo el participante/instancia

`users/U/careerInstances/I/jointSubjectEdges/E`, con plan/code/ocupación. Sigue siendo participant-local y puede facilitar “mis subjects”. Pero asignar a otro obliga a abrir escrituras sociales dentro de un espacio académico privado y a consultar/filtrar relaciones entre usuarios. Necesita reglas e índices cross-user más delicados, sin eliminar plan/slot/authority actuales. No recomendado frente al scope de plan de B. Tampoco poner todas las relaciones en un map de instancia: crecería con planes/subjects y aumentaría contención.

## Comparación estructural

| Alternativa | Unidad y coste cualitativo | getAfter/atomicidad | Queries/índices potenciales | Riesgo principal |
| --- | --- | --- | --- | --- |
| A | Actor + target; independiente de otros assignments | Base/plan/fuentes actuales; transición propia. Historia de rebind puede añadir pareja | Subjects base; assignments por subject; por participante requiere recorrido o group query restringida | Rebind/ABA e historia en un único path U |
| B | Actor + target/ocupación; independiente de otros edges | Base/plan/slot/instancia/control actuales; un edge autocontenido | Base y edges por subject; filtros uid/state, group query sólo si autorizable | Diferenciar assigned almacenado de operatividad vigente |
| C | Actor + target más command/state | Correspondencia bidireccional en cada transición | Current para lecturas; commands por revision, posible índice compuesto | Replay/orden, historial creciente, coste añadido |
| D | Actor + target del seat local | Seat actual comparado con plan; archive histórico si reemplaza | Paths fijos; recorrido acotado por subject | Reasignación silenciosa y segundo lifecycle de slots |
| E | Coste de A/B/D por intento, no por selección completa | Sin commit global; cada intento atómico | Las queries de su representación subyacente | Ocultar parciales o prometer compensación atómica |
| F | Actor + target, más autorización cruzada de namespace | Plan/slot/control actuales siguen necesarios | Favorable por usuario, incómodo por plan; group queries e índices | Ampliar superficie privada/cross-user |

Ninguna tiene presupuesto medido. No sumar descuentos por caché. Expressions dependen de forma y ramas de actor/target, aunque no recorran cinco personas. Non-owner distinto del target es el caso crítico; owner no debe ser el único caso barato que pase.

## Modelo propuesto B

### Identidad/metadatos comunes

`jointPlans/P/subjects/C`: code igual al path, versión experimental explícita, createdByUid, createdAt y state open/retired. Plan y catálogo proceden del parent, no de un catálogo elegido por cliente. Nombre y demás contenido académico se resuelven desde catálogo cuando corresponda; no guardar statusMap, notas ni progreso privado.

Crear base requiere actor joined/operativo actual y parent abierto. Puede quedar vacía sin conferir permiso a nadie. Retire sería transición protegida separada, sin borrar edges; no hard delete/recreate ni reapertura implícita en el primer prototipo. Su política final y la eliminación completa del subject quedan pendientes. No agregar array/count authoritative de participantes.

### Identidad de edge

E conceptual = `UID:membershipKey`. UID usa la gramática C que excluye `:`; membershipKey es occurrence opaca vigente para invitado, o literal reservado `owner` para owner del parent. Las occurrences C tienen longitud/gramática distinta del literal reservado. Rules comprueban composición exacta, tipos y longitud, no sólo que el ID tenga forma plausible.

P y C quedan fijados por path; no se envían como rutas libres. Para un invitado se guarda slotId, current occurrence/joinedOccurrence, slotRevision y careerInstanceId contrastados. Para owner se contrastan UID e instancia contra parent; no se fabrica un slot/índice owner. El actor debe aportar su referencia actual si no es owner; se contrasta, no se confía.

Campos conceptuales: schemaVersion, uid, role/slotId, membershipKey, slotRevision, careerInstanceId; state assigned/unassigned; revision; createdByUid/createdAt; updatedByUid/updatedAt; referencia actual del actor necesaria para validar la operación. Identidad y binding de origen inmutables; actor de última transición y estado/revisión cambian de manera restringida.

No contiene `operational:true`, authority copiada, compartir habilitado ni lista de otros participantes. El catálogo puede derivarse de parent y comprobarse contra instancia, sin copiar otro current truth.

### Fuentes de verdad

| Concepto | Fuente |
| --- | --- |
| Existencia/identidad/lifecycle subject | Base C |
| Owner/catalog/closed del plan | Parent P |
| Membership/occupant/binding current | Slot C; owner explícito en parent |
| UID uniqueness/capacidad del plan | Invariante slot↔inviteeIndex de C, sin cambios |
| Relación subject↔UID en una ocupación | Edge E |
| Instancia/lifecycle/catalog actuales | careerInstance real |
| Authority actual | migrationUsers real |
| Revisión/transición de relación | resource/request.resource del edge |
| Estado académico real del alumno | Progreso privado, NO este edge |

El edge significa propuesta/asignación en el plan, nunca cursada/aprobación ni consentimiento de sharing. “assigned” es una decisión almacenada; “actualmente utilizable” requiere además las fuentes vigentes.

## Prueba de una operación participant-local

Para assign/create/reactivate: parent abierto/no deleting; base vigente; actor autenticado y owner o joined actual, con binding activo/catalog correcto y authority habilitante; target owner o joined actual del MISMO plan, instancia activa/catalog y authority válida. Referencias de slots se contrastan con UID, binding, occurrence/joinedOccurrence y revisión actual. Histórico/pending no sirve. Si actor=target se trata como el mismo rol lógico, sin eliminar garantías.

Se usan estados after para no esconder archive/release/freeze/close incluidos en el mismo commit. No se exige amistad o sharing; tampoco los acepta como sustitutos. No se recorren otros edges, arrays de participantes, historia ni todos los slots buscando UID.

Coste conceptual: parent, base, slot(s) relevantes de actor/target, instancia(s) actuales, control(es) authority. La revisión propia viene de resource. No depende de cuatro destinatarios adicionales; la quinta relación tiene la misma forma de prueba que la primera para la misma combinación de roles. Esto es una hipótesis estática, **no PASS ni conteo de access calls**. Actor non-owner distinto de target obliga a acreditar ambos; debe ser gate temprano del prototipo.

## Lifecycle y cardinalidad

| Evento | Persistencia y autorización propuestas |
| --- | --- |
| Assign owner | Edge reservado de owner; instancia del parent + authority actuales |
| Assign invitee | Edge de UID/occurrence actual joined; validación local actor/target |
| Duplicado | CREATE sobre mismo E no obtiene segundo doc; update assigned→assigned idéntico se rechaza, sin incrementar por replay |
| Archive | No toca edges ni slots; futuras asignaciones para ese target fallan; otros pueden operar |
| Restore | Misma instancia/ocupación puede operar otra vez; unassigned no pasa a assigned por restore; sharing sigue OFF |
| Release A | Edge A se conserva como historia; fuente slot deja de coincidir y no permite nueva assign de A |
| B ocupa mismo slot | Nuevo E de B; no hereda relación de A; requiere JOIN y assign explícitos |
| Mismo UID sale y vuelve | Nueva occurrence = E nuevo; E viejo no se sobrescribe ni recupera autorización |
| Frozen | Nuevas operaciones académicas bloqueadas según authority vigente; no fallback legacy |
| Close | Parent bloquea nuevas mutaciones; no fan-out ni borrado histórico |

Puede haber más de cinco documentos históricos en una subcolección después de muchos occupants. **No se prometen cinco documentos físicos máximos**. Hay como máximo cinco relaciones assigned cuya identidad coincide con miembros current, porque C sólo permite owner + cuatro slots, un UID por slot y una E determinista por UID/ocupación. Lifecycle/authority puede reducir el subconjunto operativo. El sexto UID no tiene un miembro current que pueda demostrar; histórico o misma persona con vieja occurrence no aumenta esa cota.

La invariante depende de C intacto: no habilitar otras vías que fabriquen slots/índices inconsistentes. Datos administrativos corruptos no se legitiman por el número de edges. Migración debe validar/cuarentenar, no fabricar pruebas.

## Unassign, revisiones y concurrencia

Unassign propone assigned→unassigned, conserva identidad/binding de origen y aumenta revisión. No hard delete: el tombstone conserva el contador y evita reiniciar E con una request vieja. CREATE comienza en revisión inicial; UPDATE exige exactamente anterior+1 con tipos/límites. No usar updatedAt como único control antirreplay ni serial global.

Actor de unassign debe seguir autorizado y operativo en plan abierto. Quitar una relación histórica NO requiere que el target archivado siga operativo: es una reducción de propuesta, no nueva asignación. No permite cambiar a otro target ni reactivar la relación. Self-unassign por persona ya released/frozen queda cerrado en el prototipo; cualquier excepción de cleanup deberá decidirse aparte, no concederse implícitamente.

El cliente envía revisión esperada derivada de su lectura. Si perdió respuesta tras commit, relee E y reconoce estado/revisión actuales; no reintenta ciegamente como otra asignación. Un resultado de lectura no le concede permiso de escritura.

| Carrera | Resultado exigido |
| --- | --- |
| Dos actores crean mismo E | Un CREATE efectivo; segundo no duplica ni cambia atribución/revisión sin transición permitida |
| Assign/reactivate vs unassign | CAS local; el stale no sobrescribe revisión ganadora |
| Stale unassign de vieja ocupación vs nuevo E | Puede afectar sólo E viejo si limpieza permitida; nunca la nueva ocupación |
| Release/reassign vs assign | Si assign confirma antes, queda historia; después debe fallar con prueba vieja |
| Archive/freeze vs assign | Si invalidación gana, nueva asignación falla; no rollback retroactivo de la anterior válida |
| Close vs assign | Mismo criterio de orden; no nuevos writes tras cierre vigente |

No se promete un ganador predeterminado ni serialización superior a la que se verifique en Firestore. Operaciones sobre diferentes edges no escriben contador/roster global y no deberían contender por ese motivo.

## SubjectCheck reevaluado

Recomendación inicial **sin subjectCheck global ni assignmentCheck**. Antes hacían falta dos writes para demostrar un conjunto completo y reservar revisión. Ahora el edge contiene estado y revisión de SU relación y su propia Rule verifica actor/target actuales; no hay una segunda mitad que un atacante pueda omitir.

Correspondencia plan/subject/UID viene del path y campos inmutables contrastados; stale/replay de revisión propia; current membership de slot; operatividad de instancia/control. Esas garantías reemplazan la función del check para esta unidad, no se eliminan. Base puede crearse separada porque vacía no autoriza ni asigna a nadie; edge siempre exige base existente/vigente.

Si actor+target local no cabe, STOP: no añadir automáticamente otro certificado/check ni relajar validaciones. Sólo un diagnóstico nuevo justificaría otro reparto. Los checks legacy quedan conservados en migración histórica y no autorizan edges nuevos.

## Read model y consultas

Write model: base y edges pequeños. Read model: cliente compone para display; no guarda un roster authoritative derivado ni lo envía como prueba global.

| Consulta | B propuesta |
| --- | --- |
| Subjects del plan | Colección subjects del P conocido, filtro state si corresponde |
| Participantes de un subject | Subcolección memberEdges de C, filtros state/uid y paginación histórica |
| Subjects de un participante | Primero subjects del plan, consultas por uid en cada subcolección; más lecturas pero permisos de scope claros |
| Current membership del edge | Contrastar referencia con roster/slots del plan leíbles legítimamente; no confiar sólo en state assigned |
| Historia | Edges de ocupaciones anteriores conservados; no sirven para operaciones nuevas |
| Pending proposals | Assigned representa propuesta almacenada, no aceptación; no inventar estado de aprobación del destinatario. Filtrar esa representación si producto la usa |

Índices potenciales por uid/state/updatedAt y consultas ordenadas: a evaluar con queries reales, no creados. Group query cross-plan no se habilita por conveniencia; necesita schema/campos y prueba de autorización propios. No se garantiza que un filtro cliente convierta una consulta global en segura. El recorrido por subjects escala con su cantidad: coste de lectura reconocido, independiente del proof de una escritura.

Para A las mismas queries por UID son más sencillas dentro de C; C necesita current separado para no reconstruir comandos; D lee paths fijos por subject; E hereda el read model; F facilita por usuario y complica por plan. Ninguna variante introduce backend o Cloud Functions.

### Límite importante de display

No abrir lectura de instancias/authority privadas ajenas para pintar “operativo”. El cliente puede distinguir ocupación histórica con slots que ya esté autorizado a leer, pero no necesariamente conocer archive/freeze de otro UID. Sin una fuente de lectura autorizada debe mostrar relación guardada o disponibilidad no verificada, no afirmar que sigue operativa. La comprobación real ocurre en Rules en el siguiente write. Diseñar un indicador compartido nuevo de elegibilidad queda fuera; no crear operational cache para resolver display.

Archive no exige fan-out ni borrar historia. Restore puede volver utilizable una relación que permaneció assigned en la misma ocupación; no revierte unassign explícito ni reactiva sharing. Esta distinción debe conservarse en el futuro read model.

## Privacidad y lectores/escritores

Scope académico del plan, no público. Owner y miembros current autorizados pueden leer identidad/relaciones del plan según política de roster; pending/historical por sí solos no obtienen listado académico. Una Activity conservada no habilita get/list. Frozen no recibe permisos nuevos por tener edges. Lecturas de historia propia fuera del plan requieren política explícita y permanecen cerradas en el mínimo.

Los miembros archivados siguen siendo miembros para la política de lectura que se acuerde; no se confunde esa lectura del plan con permiso de nueva propuesta. No exponer carreras ajenas, progreso, emails o sharing. Binding técnico se limita a lo necesario para la operación y al scope de plan; no habilita get de careerInstance privada. Rules puede contrastarla sin abrir esa API.

Escritores: actor owner o member actual autorizado, authority y operatividad requeridas; assign además valida target. Non-owner conserva capacidad de proponer a otros donde contrato lo permite. Unassign histórico reduce acceso bajo las condiciones descritas. Ningún permiso usa selección como authorization, ni friendship como sustituto de JOIN, ni membership como sharing.

## Migración conceptual, sin ejecución

Separar schemas legacy y nuevo por discriminador inmutable del plan/subject. No interpretar arrays antiguos y edges simultáneamente como dos fuentes current ni hacer dual-write. No permitir que el cliente convierta un doc modificando schemaVersion.

Un proceso futuro controlado preservaría el subject legacy y su array/check como evidencia histórica, con procedencia y atribución originales. Sólo produciría un edge utilizable si puede demostrar binding/ocupación current legítimos; códigos/UID/bindings desconocidos quedan históricos/unresolved, no se inventa trayectoria ni occurrence. Una copia histórica sin prueba no debe tener el mismo permiso de creación que un edge vigente.

Necesita inventario, control de escritores, checkpoints, idempotencia y resolución explícita de conflictos, pero no se diseña ni ejecuta ese migrador aquí. No fabricar createdByUid ni interpretar todos los miembros del array como joined. Conservación histórica no equivale a permiso de reactivar. Bootstrap protegido sigue bloqueante por separado.

## Impacto de producto y riesgos

Multi-select aprobado como intentos independientes: estados por destinatario confirmado/falló/pendiente de comprobar. Ante desconexión, no afirmar fallo si el commit puede haber ocurrido; releer identidad/revisión. Reintentar sólo pendientes tras revalidar; no reemplazar todo el conjunto ni deshacer éxitos silenciosamente. Cancelar gesto no cancela commits confirmados. Sin diseño visual final.

Riesgos principales: presupuesto owner/non-owner local aún no probado; corrección de identidad por ocupación; invariantes C; semántica de base vacía/una relación; precisión de display sin datos privados; crecimiento histórico y paginación; unassign/revisión; migración y retiro de base. El número de edges históricos no tiene cota de cinco, aunque la participación current sí. Retención/purga no definida: no hard delete improvisado.

## Experimento mínimo posterior — NO EJECUTADO

1. Reutilizar C completo en fixture separado. Parent con owner + cuatro invited joined reales; base subject creada por actor autorizado. No alterar invitations ni fabricar membresía.
2. Asignar owner; asignar invitee por owner; asignar otro invitee por non-owner distinto del target. Gate temprano: cualquier válido local con expression/access exhaustion implica STOP.
3. Completar cinco relaciones mediante commits independientes. Misma clase de actor/target repetida con cero y con otros edges presentes: demostrar que no consulta los otros edges ni aumenta el proof por su existencia. No batch global de cinco.
4. Duplicate mismo E FAIL; UID/slot/plan/code/binding/catalog/occurrence spoof FAIL; pending, histórico, sexto UID y otra ocupación no dan permiso. Diferenciar rechazo lógico de exhaustion.
5. Archive target: nueva assign/reactivate FAIL sin fan-out; otro target PASS; restore misma instancia permite nueva operación válida sin sharing ON. Incluir owner archivado no involucrado para evitar suspensión global.
6. Release A/reassign B/JOIN B: A stale FAIL, B nuevo PASS, historia A intacta. Mismo UID que vuelve con nueva occurrence debe usar E nuevo, no resucitar el anterior.
7. Frozen actor y target FAIL; control válido nuevamente permite lo que corresponda; close bloquea. Selection/Activity/sharing no alteran resultado.
8. Unassign local, tombstone, reassign en misma ocupación y stale revision; no reiniciar contador por borrar/recrear. Dos actores mismo E, assign/unassign, invalidación/assign con estados finales coherentes.
9. Base ausente/retired y distinta base FAIL. Base vacía no autoriza relaciones. Lecturas privadas y queries de plan no exponen progreso ni planes ajenos.
10. Sólo tras positivos: caracterización acotada de access/expressions owner, non-owner distinto de target y self. Sin asumir caché ni presupuesto universal. Si falla, no añadir un assignmentCheck automáticamente.

Este prototipo puede refutarse con una sola relación non-owner→otro miembro. La quinta debe costar conceptualmente lo mismo que la primera bajo roles equivalentes; la suma de cinco commits no es una nueva promesa de atomicidad o presupuesto agregado.

## Recomendación y frontera final

**Elegir B — subject-member edge por UID y ocupación**, con base común y la semántica independiente aprobada. Prioriza prueba local actor/target, fuentes actuales, revisión local, historia sin fan-out, compatibilidad con C y unicidad determinista; evita copiar operatividad o volver a demostrar cinco personas juntas.

No adopta diseño final, no prueba presupuestos ni sustituye validación de privacidad/concurrencia. No se implementó ningún archivo de código, fixture, Rule, servicio, UI o migración; sólo este documento. No Emulator, producción, publicación, commit, push, deploy, Etapa7 ni bootstrap. STOP para revisión.

RECOMMENDED FOR ISOLATED PROTOTYPE: B — SUBJECT MEMBER EDGE POR UID Y OCUPACIÓN
