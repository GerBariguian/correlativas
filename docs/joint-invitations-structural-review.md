# Etapa 6 — Review estructural de invitation y reinvite

Fecha: 2026-09-30. DISEÑO SOLAMENTE. No arquitectura definitiva, prototipo nuevo ni integración autorizados. Todos los paths/campos siguientes son propuestas, no schema vigente.

## 1. Problema demostrado y límite de la evidencia

El candidato invitationRecipient resuelve NEW posiciones 1–4, cuatro activaciones independientes en directa/inversa/mixta, JOIN hasta cinco miembros y NEW con invitedBy distinto del owner. Reinvite C1→X→withdrawal→C2 accepted→Y sigue alcanzando 1000 expresiones incluso con selección condicional de NEW/RENEWAL desde pre-state. Los controles complementarios muestran Y lógicamente válida y contribución de la renovación del parent; no identifican un operador culpable ni margen de access calls. Los negativos por exhaustion no equivalen a demostrar cada rechazo lógico.

Evidencia: [último candidato](invitation-renewal-optimization.md), [diagnóstico reinvite](reinvite-diagnostic.md), [dispatch](invitation-dispatch-optimization.md). La última ejecución del candidato fue 63 tests, 62 PASS/1 FAIL; son antecedentes, no tests de este review.

Se detienen microoptimizaciones porque una aceptación marginal de NEW no predice viabilidad del compuesto ni de renewal. Se propone cambiar la unidad cuya transición se prueba, no seguir reorganizando el mismo predicado.

## 2. Contrato congelado

Máximo cuatro destinatarios distintos además del owner; CREATE separado; cada activation y su Activity indivisibles; fallar una no revierte las otras. La amistad relevante es invitedBy↔invitee, nunca un sustituto owner↔invitee. Cycle opaque, reservado y no reutilizable; withdrawal invalida pending JOIN y una nueva amistad no revive X. Y tiene nueva identidad e historia. Activity, membership, binding, compatibilidad y selección NO son sharing ni autorización académica.

Authority instances/phase válida, careerInstance activa y catalog se verifican según operación. El destinatario pendiente no recibe una instancia fabricada: binding unresolved/null hasta selección explícita propia en JOIN. Archive suspende operacionalidad de ese participante, no el plan completo; restore no reabre plan ni reactiva sharing. Historia de binding no acredita estado operativo actual.

Sólo cliente + Rules + Firestore en Spark. Sin Functions, backend confiable, Admin online ni nueva fuente de autoridad. No cambiar bootstrap protegido, que permanece RELEASE BLOCKER separado.

Para dimensionar capacity se conserva provisionalmente la semántica actual: pendientes y miembros no-owner ocupan cupo hasta una retirada explícita válida; withdrawal de amistad y archive no liberan cupo automáticamente. Liberarlo de otra forma requiere decisión de producto, no una inferencia de este review.

## 3. Qué concentra hoy el parent

jointPlans/{P} combina owner/catalog/closed/deleting, inviteeIds/memberIds, participants con bindings, invitedBy, maps de cycles/occurrences, serial y selector. Cada activation revalida relaciones entre esas estructuras aunque sólo cambie un destinatario. El historial de avisos no se enumera, pero el current-state agregado obliga a comparar estructuras del plan.

Separar documentos puede reducir condiciones por permiso y alcance de diffs; NO garantiza menor coste total. Puede aumentar get/getAfter, multiplicar escrituras y superar límites agregados. Tampoco autoriza dejar permisos parciales más débiles: toda distribución debe demostrar enlaces en ambos sentidos en el mismo commit.

## 4. Prueba local común a las alternativas

Occurrence Y immutable: identidad O; plan P; invitee U; invitedBy A; friendshipCycleId C; referencia de ocupación/contexto; createdAt. Sin statusMap, emails, progreso ni snapshots privados. Binding académico del destinatario se resuelve en JOIN, no se copia desde datos privados ajenos.

Una activation debe probar: plan abierto/no deleting; A owner o miembro operativo con binding válido; authority aplicable de A y U; amistad A↔U accepted con C current; ocupación/recipient consistentes; Y no existe antes y existe después; current pointer avanza exactamente a Y; Activity exacta no existe antes y aparece después. Si renovación, A sigue siendo el invitador permitido, mismo destinatario y ocupación, C distinto del cycle previo. Esto requiere comparar el C previo guardado localmente, no leer toda X.

Occurrence→current y current→occurrence deben exigir cambio real, no mera existencia. Occurrence→Activity y Activity→occurrence deben exigir create fresco y coincidencia P/O/U/A/C. Un documento viejo, readAt update o update de Activity no satisface create. No usar sólo updatedAt==request.time para demostrar novedad: comparar identidad/revisión y ausencia previa.

La prueba local puede distribuirse: occurrence realiza autorización dinámica; current prueba transición/ocupación; Activity prueba sobre exacto y occurrence recién creada. Las lecturas de cada permiso y el total siguen necesitando medición. No hay llamadas recursivas entre Rules: se comparan documentos before/after y Firestore exige todos los permisos del commit.

## 5. Alternativa A — Participants actuales + occurrences + contador verificable

### Documentos y ownership

- jointPlans/{P}: ownerId, catalogId, estado global y contexto owner mínimo.
- jointPlans/{P}/participants/{U}: estado mutable pending/member/released, currentOccurrence, currentCycle, invitedBy, binding y revision local. Un doc por UID, nunca se borra/recrea para reiniciar revisión.
- jointPlans/{P}/occurrences/{O}: immutable.
- jointPlans/{P}/control/capacity: count 0..4, revision, changedUid y tipo de transición, mutable sólo en adquisición/liberación.
- users/{U}/activityInbox/{id(P,O)}: aviso privado, payload inmutable; readAt y eliminación según política actual, no fuente de autoridad.

Owner administra el plan; un miembro operativo puede invitar; sólo U acepta y elige su propia instancia. No existe permiso genérico del owner para reescribir todos los participants. Release sólo según protocolo autorizado existente; sin nueva feature implícita.

### Operaciones

CREATE crea plan y control count0 atómicamente; owner en contexto separado, fuera del contador. NEW escribe participant, occurrence, Activity y capacity (cuatro documentos). RENEWAL escribe participant, occurrence y Activity (tres): no toca contador, no cambia binding/slot, incrementa revision y cambia C/pointer. JOIN actualiza participant pending→member, conserva cupo y occurrence, y valida la prueba actual de JOIN descrita más abajo.

Withdrawal modifica friendship actual, sin fanout a participants ni historia. C2 se crea por protocolo canónico/certificado existente. Reinvite usa currentCycle almacenado y friendship C2 para crear Y; X no se toca. Archive se detecta por lectura de la instancia en acciones/JOIN y proyección de estado operativo, no reescribe todos los planes.

### Capacity y concurrencia: no basta un contador

La prueba debe mantener inductivamente count = número de participants ocupantes, desde CREATE count0. En cada incremento/decremento, capacity identifica exactamente U y una revision nueva, y compara participant U before/after. Recíprocamente cualquier participant que cambia ocupación exige ese mismo capacity before/after, changedUid=U y delta exacto. Dos participants distintos en un mismo commit no pueden usar el mismo changedUid. Un cambio de count sin participante se rechaza y un release no puede repetirse. Revisions y records released se conservan.

Esto es una propuesta de invariant, NO una garantía medida. Se deben probar atajos de create/recreate/delete, dos mutaciones, capacity-only y falsa liberación. Dos destinatarios por último cupo contienden en capacity; dos reinvites en el mismo U contienden en participant. Diferentes renewals no deberían escribir capacity. La prueba no cuenta subcolecciones.

### Coste y migración

NEW 4 escrituras; RENEWAL 3; JOIN 1 si no requiere índice adicional. Dependencias: global, current U/A, authority A/U, instancia A (y propia de U en JOIN), friendship directa/inversa, occurrence y Activity; además capacity para NEW. Historia independiente. Riesgo expressions MEDIUM relativo; access calls HIGH relativo en NEW por contador y enlaces; contention global sólo adquisición/liberación.

Se conserva ciclo/certificados y semántica Activity/JOIN, pero hay que separar maps del parent, introducir participants y reconstruir capacity desde un inventario consistente. Migración no puede confiar en un contador aportado por cliente ni en ausencia de docs. invitationRecipient deja de ser necesario: U proviene del path. Parent y queries cambian sustancialmente.

## 6. Alternativa B — Occurrences/eventos como unidad + head roster acotado

### Documentos y distinción estructural

- jointPlans/{P}: global mínimo.
- jointPlans/{P}/control/heads: mapa máximo cuatro UID→{currentEventId, revision}; sin bindings/cycles/historia agregada.
- jointPlans/{P}/events/{E}: immutable, tipos invitation/join/release. Invitation contiene P/U/A/C; JOIN referencia invitation y binding elegido; cada evento referencia head anterior y revisión.
- Activity por invitation E.

Aquí no hay participant mutable: estado y binding operacional se leen del evento pointed por heads. La occurrence autoriza sólo cuando el head vigente la referencia y pasan controles dinámicos; su existencia aislada nunca basta. Es una representación basada en eventos, distinta de A y de slots.

### Operaciones y invariantes

CREATE plan+heads vacío. NEW: head único U añadido + invitation Y + Activity (tres escrituras). RENEWAL: head U cambia a invitation Y con revision+1, validando un único evento previo de ese U; no recorre la cadena. Si el previo es JOIN vigente, no se admite renewal de pending ni se pierde binding; release sería una transición explícita distinta. JOIN: evento immutable de aceptación con binding + avance del head (dos escrituras), validando invitation actual/cycle y contexto. No se asume Activity nueva en JOIN si el contrato no la exige.

Capacity: keys de heads representan cupos ocupados, size<=4 y UID único. El permiso heads exige diff de una sola key para cada transition y reciproca creación del evento exacto; ningún borrado de head libera capacidad sin release válido. Records de historia permanecen. No hay serial global: revisiones por head, con identidad opaque de evento; hay que preservar contador de ocupación o anchor si se elimina la key al liberar, para evitar reset. Propuesta: mantener releases en events y una reserva permanente por identidad E; ningún E se recrea. Activity identity no depende de revisión reiniciable.

Withdrawal/C2 actúan igual que A: head antiguo no se reactiva; JOIN compara cycle y current head. RENEWAL conserva invitedBy permitido y destinatario, comprueba previo local, Y fresco/C2, X immutable. Owner/member role se obtiene de evento current y contexto operativo actual. Archive no cambia el evento histórico ni cierra globalmente.

### Coste, races y migración

Todas las invitaciones/JOIN/release escriben heads: contención global por plan, incluso entre distintos U. Último cupo queda serializado en ese doc; doble mismo destinatario/reinvite debe comprobar head before. Las lecturas requieren global+heads+evento previo y, si A no es owner, evento actual A, además de friendship/authority/instancias/notice. Riesgo expressions MEDIUM-HIGH relativo: se retiene un mapa global de cuatro y la tipología de eventos agrega ramas. Access calls HIGH relativo por indirecciones; historia no recorrida, pero al menos un evento previo sí.

Se conserva más noción de roster del parent, pero se traslada a un doc con schema pequeño. No es sólo mover el parent intacto: bindings/cycles/serial salen de él y JOIN se vuelve append-only. Cambia más el servicio JOIN y su lectura que A/C. La frontera entre head actual y evento immutable exige nuevos ataques cross-event y release. No recomendada como primera prueba sin evidencia: puede reproducir contención/composición agregada.

## 7. Alternativa C — Cuatro slots explícitos + índice UID + occurrences

### Documentos y responsabilidades

- jointPlans/{P}: ownerId, catalogId, closed/deleting y contexto owner mínimo; sin roster/mapas de invitaciones ni serial global.
- jointPlans/{P}/slots/{S}, S exactamente 1,2,3,4: mutable, empty/pending/member; occupantUid, occupancyGeneration, revision, currentOccurrence, currentCycle, invitedBy, binding. Generación aumenta al reasignar ocupante; revision aumenta en transiciones. No delete/reset desde cliente.
- jointPlans/{P}/participantIndex/{U}: mutable active/released, slotId y occupancyGeneration; registro por UID conservado. No historial de invitations ni progreso. Owner excluido de estos cuatro cupos.
- jointPlans/{P}/occurrences/{O}: immutable con P/U/S/generación/A/C y contexto mínimo.
- Activity exacta P/O en inbox U.

Este diseño reemplaza contar participantes por cuatro recursos físicos. El índice UID es indispensable: cuatro slots solos permitirían que U ocupara dos. Binding vive en slot y lo actualiza su dueño al JOIN. Un actor no puede resolver binding ajeno.

### CREATE y NEW

CREATE plan + cuatro slots vacíos en un commit de cinco documentos, SIN invitados ni avisos. Cada slot verifica parent nuevo/owner y estado vacío; parent exige los cuatro slots exactos after. Si esa inicialización excede presupuesto es blocker de esta alternativa, no se elimina una comprobación. No crear slots 0/5, no lazy create de slots extra, no reset de existentes.

NEW elige un slot vacío y escribe: slot ocupado pending, participantIndex U, occurrence Y y Activity Y (cuatro documentos). Slot exige index after con U/S/generación exactos; index exige slot before vacío y after ocupado por U y su propia transición inactiva→activa. Dos slots para U no pueden ambos coincidir con el único index after. Dos U en un slot no pueden coincidir con el único occupantUid after. Verificar después de cada commit la invariante, no contar en cliente.

Un miembro A distinto de owner se localiza por participantIndex A→slot A; debe estar member y operativo. Friendship A↔U, no owner↔U. El índice sólo localiza: ni su existencia ni Activity conceden autorización.

### RENEWAL y JOIN

RENEWAL escribe únicamente slot S + occurrence Y + Activity Y (tres). Index U no cambia: mismo UID/S/generación. La Rule compara schema local de slot, status pending, mismo invitedBy permitido/binding/ocupación, revisión+1, pointer fresco Y, C distinto y current. No compara estructuras de otros tres slots ni lee X completa. El currentCycle previo necesario se guarda en slot; occurrence conserva la copia histórica.

JOIN actualiza slot pending→member con binding a instancia propia explícita, mantiene índice/ocupación, y debe presentar expectedOccurrence=Y (con mecanismo verificable aún a definir en schema; no simple hint). Rule comprueba pointer y occurrence current, U/path, plan abierto, accepted friendship A↔U/current C2, authority/instancia/catalog y generación. Una carga vieja X/C1 debe fallar aunque el cliente no relea. No se cambia el diseño conceptual JOIN, pero sí paths y witness; esto necesita prototipo específico.

Withdrawal sólo cambia friendship; current check bloquea JOIN X/Y inmediatamente después de withdrawal. C2 no revive X porque C1!=C2; Y necesita nuevo O. Archive mantiene ocupación e historia y vuelve no-operativo sólo el participante afectado. Restore no cambia closed ni sharing. Si el inviter se archiva, las operaciones que requieran su binding activo deben fallar sin suspender a miembros no relacionados.

### Reuse, historial y capacidad

Release no equivale a withdrawal de friendship. Cuando exista retirada autorizada de participante, slot→empty e index→released deben ser atómicos; occurrence nunca se borra. Reasignar slot incrementa generación, y un pointer/índice viejo no sirve. Reinvite al mismo U sin release conserva generación y avanza occurrence; reingreso después de release exige nueva generación/O. UID y generación inmutables dentro de una ocupación. No liberar y reocupar de forma que se oculte al ocupante previo sin transición autorizada.

La cota cuatro se deriva de paths permitidos y del owner fuera de ellos, no de un contador o array. Con tres ocupados hay un único recurso libre; dos transacciones compiten en él, y un cliente malicioso que escriba sin transacción también debe superar before empty/generación/índice en Rules. Slot diferente para mismo U compite en index U. Una escritura masiva que intente violar la biyección debe rechazarse.

### Coste y migración

NEW 4 escrituras; RENEWAL 3; JOIN 1 si witness cabe en slot; release 2 (sin funciones nuevas asumidas). El número de campos y paths por prueba no depende de historia ni posición. Menor riesgo relativo de expressions que roster global, pero MEDIUM, no LOW demostrado; access-call-risk HIGH por índice adicional y actor no-owner. No se asume ventaja neta hasta cargar todo el compuesto.

Requiere convertir roster viejo a cuatro asignaciones explícitas y guardar manifest de mapping; no elegir slot arbitrario para inventar membership. Preservar unresolved/catalog-unavailable y no fabricar instances. Ciclos/certificados/Activity histórica se conservan; JOIN/subjectCheck/cleanup/listado necesitan adaptar referencias. invitationRecipient ya no es necesario como selector de mapa: slot y index demuestran UID. No se migra ni integra en este review.

## 8. Serial e identidad de occurrence

El serial global actual aporta identidad de nueva transición, orden local al plan y enlace único Activity. No está demostrado que orden TOTAL entre diferentes destinatarios sea requisito de seguridad/producto. Retirarlo sería decisión de representación revisable, no algo ya aplicado.

Opciones: A revisión por participant; B revisión por head + E opaque; C revisión/generación por slot + O opaque. La identidad opaque sólo es única si la Rule exige inexistencia y occurrence immutable/no-delete; aleatoriedad de cliente no demuestra permiso. Sin delete, un O usado queda reservado incluso si se elimina el aviso. ID de Activity debe incluir P y O de forma no ambigua (gramática/versionado); JOIN compara O esperado y actual, no timestamp ni readAt.

cycle+invitee solo NO alcanza globalmente: hay varios planes e invitadores; además no está definido si una cancelación permite otra invitación dentro del mismo cycle. P+U+A+C fija como máximo una por ciclo y sería otra decisión. Preferible experimentar O opaque y mantener cycle como evidencia de frescura, no como sustituto de identidad. Contadores locales conservan el orden de un participante y no serializan todo el plan. Reuse requiere generación persistente o reserva immutable, nunca reset silencioso.

## 9. Concurrencia: obligaciones por alternativa

| Carrera | A | B | C |
| --- | --- | --- | --- |
| Mismo U desde dos tabs | participant U/revision | heads U/event | index U + slot/revision |
| Dos U por último cupo | capacity count3→4 y witness | heads size3→4 | único slot libre |
| Reinvite simultáneo | mismo participant/pointer | mismo head | mismo slot/pointer |
| Reinvite vs withdrawal | current friendship y versión leída | igual | igual |
| Reinvite vs close | global abierto al commit | igual | igual |
| JOIN vs withdrawal/nuevo cycle | expected pointer + friendship actual | head/invitation + friendship | slot/generación/O + friendship |
| Activity replay | O fresco y aviso exacto | evento fresco y aviso | O fresco y aviso |

Resultados admitidos dependen del orden de commits: si activation gana antes de withdrawal, queda histórica pero JOIN después falla; si withdrawal gana, activation falla. Close análogo; archive no modifica historia, pero invalida el contexto operativo que la operación necesita. La transacción cliente debe leer dependencias dinámicas antes de escribir; Rules verifica también el estado actual/post-state pertinente para impedir combos maliciosos en un batch. No basta confiar en que el servicio use runTransaction.

Para impedir doble avance por retry en el mismo ciclo, current conserva cycle/inviter y niega renewal con C igual; si otra tab ya creó Y, el perdedor relee y reconoce Y, sin otro write por permission-denied. SDK retries por contención no son autorización para recrear una occurrence. Pruebas concurrentes pendientes, no garantías empíricas nuevas.

## 10. Access-call shape y expresiones

| Aspecto | A | B | C |
| --- | --- | --- | --- |
| Escrituras CREATE propuestas | 2 | 2 | 5 |
| NEW / RENEWAL | 4 / 3 | 3 / 3 | 4 / 3 |
| JOIN | 1 | 2 | 1 condicionado a witness |
| Estado compartido escrito | capacity en alta/baja | heads en toda transición | slot afectado; index en alta/baja |
| Lecturas estructurales adicionales | capacity + participant actor/target | heads + current events actor/target | index actor/target + slots |
| Dependencia de historia | ninguna enumeración | un predecessor, no cadena | ninguna enumeración |
| Riesgo expressions relativo | MEDIUM | MEDIUM-HIGH | MEDIUM |
| Riesgo access calls relativo | HIGH | HIGH | HIGH |

Son formas de grafo y riesgos, no presupuestos medidos ni ranking final. En todos se suman global, authority actor/receptor, instance del actor no-owner/owner según contrato, friendship directa/inversa, estado de participante y parejas occurrence/Activity before-after. GET y GET AFTER de igual path no deben contarse como una sola llamada sin medir; no contar con caché para justificar viabilidad. No duplicar todos los predicados en cada doc por comodidad, pero tampoco delegarlos a un documento preexistente que no pasa por permiso CREATE en ese commit.

Firestore documenta 1000 expresiones y límites de access calls de 10 por operación y 20 por petición multioperación, con posible caché. Deben satisfacerse ambos ejes. [Límites oficiales](https://firebase.google.com/docs/firestore/quotas).

getAfter permite comprobar el estado posterior y exigir escrituras conjuntas; no ejecuta ni autoriza por sí mismo los demás permisos. La unión atómica propuesta requiere pruebas de cada mitad y ausencia previa. [Condiciones Rules](https://firebase.google.com/docs/firestore/security/rules-conditions).

Firestore documenta serialización de transacciones por commit; clientes web/móvil usan control optimista con reintentos por contención. No se transforma un permission-denied en retry ciego. [Aislamiento oficial](https://firebase.google.com/docs/firestore/transaction-data-contention).

Documentación pública consultada sólo para fundamentar límites/plataforma, sin acceso a proyectos Firebase. Más documentos implican más escrituras/lecturas: compatibles conceptualmente con las restricciones sin backend, pero consumen cuota Spark; no se promete capacidad de tráfico ni coste cero ilimitado.

## 11. Privacidad, Activity, JOIN y navegación histórica

Occurrence puede leerse sólo por sus partes autorizadas o por miembros con permiso explícitamente definido para historia no académica; no se propone directorio global de invites/cycles. No incluir progreso, participantes académicos privados ni IDs de instancias ajenas innecesarios en avisos. El actor valida su propia instance; el joiner valida su propia instance. Sharing/snapshots cross-user requieren consentimiento independiente por instance como antes.

Activity apunta a occurrence, no a un estado snapshot que conceda acceso. Leer un aviso histórico sólo prueba que el usuario conserva ese aviso. Al navegar se resuelve current y se vuelve a comprobar acceso al plan; si fue retirado/deleting o falta catálogo, mostrar indisponible/histórico sin filtrar documentos privados. No conceder acceso al plan por conservar Activity o occurrence. La política exacta de lectura histórica tras leave debe definirse antes de UI.

Los listados actuales en src/services/jointPlans.js usan ownerId/inviteeIds del parent. A/C rompen ese acceso directo: harán falta queries explícitamente seguras de participants/index por U, o un índice de navegación por usuario mantenido con reglas de integridad. Ese índice no puede ser autoridad y agregaría escrituras al presupuesto. B puede consultar heads sólo con diseño de query/index y autorización adecuados. NO asumir que Rules filtra resultados ni que Activity reemplaza discovery: el aviso puede borrarse. Medir el índice si resulta obligatorio para la operación, no añadirlo después del GO.

JOIN no debe perder defensa stale-payload: necesita expected occurrence verificable aunque el binding propuesto sea igual; el prototipo actual usa joinOccurrence. O opaque exige test de la adaptación, sin copiar ciegamente el entero global. Current freshness no exige revalidar toda la historia; sí la occurrence exacta current y la amistad vigente.

## 12. Reutilización frente a costo hundido

Reutilizable: contrato cycles/no-reuse y certificates; matrices de orientación y carreras opuestas; atomicidad y privacidad de Activity; casos readAt/replay; semántica de authority/lifecycle/catalog/bindings y JOIN stale; pruebas de no-dual-write; fixtures de estado real; taxonomía y runners seguros; diagnósticos del límite. Los servicios legacy siguen como referencia y deben conservar su semántica mientras no haya cutover autorizado.

No reutilizar como autorización futura: resultados verdes de fixtures reducidas, márgenes de otros prototipos, negativos por exhaustion, invitationRecipient como autoridad, mapas/serial del parent si la alternativa los sustituye. invitationRecipient fue un hallazgo útil de dispatch, pero A/C ya tienen identidad de target por path. B podría requerir witness de diff de head, demostrado por Rules.

Prototipos no viables/diagnósticos se conservan íntegros y se marcan por documentación: CREATE global distribuido/manifest/preparación antiguos, dispatch y único refactor renewal. No borrarlos ni ejecutar sus PASS como release gate nuevo. Documentos antiguos que exigen CREATE+cuatro avisos atómicos son historia superada por la decisión de invitaciones independientes; no reintroducir ese contrato.

No está determinado qué variantes existen en datos reales: NO se accedió a producción. Cualquier migración futura necesita inventory, authority freeze/cutover aprobado, versión explícita y conversión determinista sin dual-read permisivo ni dual-write. Si falta evidencia para reconstruir una occurrence, no fabricar cycle, binding o aceptación; registrar unresolved para decisión. Immutable history y borrado de plan necesitan contrato conjunto: no reintroducir huérfanos ni eliminar historia silenciosamente por el drain actual.

## 13. Primera alternativa a prototipar: C, con condiciones

Recomiendo C como primer experimento, NO como arquitectura elegida. Separa capacidad (cuatro paths) de autorización local y permite que NEW/renewal compartan exactamente occurrence+Activity sin schema global de roster. El índice por UID hace explícita la unicidad en vez de ocultarla dentro del contador. La principal hipótesis a refutar pronto es que index/slot del actor y del target más authority/cycle excedan access calls. A sería una alternativa distinta si el índice resulta demasiado caro, con el riesgo adicional del invariant contador. B conserva más coordinación global y agrega indirectas para JOIN, por eso no es el primer experimento propuesto.

No se afirma C viable ni se autoriza su implementación con este documento. Se requiere aprobación del experimento y de las decisiones mínimas de identidad/reuse/historia.

## 14. Experimento mínimo propuesto, no ejecutado

1. Fixture aislada con todos los helpers reales relevantes y schema provisional C; sin permisos constantes ni backend. Medir separado CREATE plan+cuatro slots vacíos; cliente no puede crear quinto ni resetearlos.
2. NEW 1,2,3,4 en commits individuales con occurrence+Activity+slot+index. Directa/inversa/mixta, orden de slots permutado. Verificar cuatro cupos/avisos, biyección UID↔slot y plan independiente de fallos.
3. Con plan lleno y owner más miembro invitador, ejecutar withdrawal, request/certificado C2/accept con friendship Activity real; no sólo seed C2. Reinvite Y debe usar mismo slot/generación y nuevo O sin tocar X.
4. JOIN Y vigente PASS; carga stale X FAIL; withdraw C2 y nueva amistad C3 no reviven Y. Archive de un participante no bloquea operaciones independientes de los otros.
5. Correr carreras por último slot y mismo U en slots distintos; dos reinvites; close/withdrawal/archive. Para cada resultado observar parent/slot/index/O/Activity y descartar partial states. Un solo ganador lógico; perdedor relee, no permission-denied write retry.
6. Atomicidad adversarial: cada subconjunto de las cuatro escrituras NEW y tres RENEWAL; Activity vieja, O existente, pointer de otro U/P/generación, timestamp spoof, index-only, slot-only, doble mutación, reuse y release falso. Los negativos críticos deben ser lógicos sin exhaustion; si no, no acreditan seguridad suficiente.
7. Calibrar NEW y RENEWAL separados, actor owner/no-owner, con y sin navegación materializada si se necesita. Identificar último padding permitido/primero rechazado sólo si el harness discrimina access calls de expressions. Ensayar composición final, no helper aislado.
8. STOP ante cualquier camino válido con exhaustion, brecha de capacity/privacidad/atomicidad o contrato contradictorio. No construir el resto de Etapa6 ni otra microoptimización automática. Entregar datos y revisión.

Los doce puntos pedidos quedan incluidos: CREATE; cuatro NEW; withdrawal; C2; Y; JOIN Y; stale X; capacity race; Activity bidireccional. Sólo después de ese gate se consideran subjects/subjectCheck, listado/navegación, limpieza y coexistencia completos. Esos dominios deben incorporarse antes de un GO de integración, no se extrapola el prototipo a ellos.

## 15. Preguntas abiertas antes de arquitectura definitiva

- Confirmar ausencia de necesidad de orden global de invitations; aceptar O opaque + revisión local y el formato de IDs Activity.
- ¿Pending invalidada por withdrawal sigue consumiendo cupo hasta retiro explícito? Se conserva así provisionalmente; no liberar por archive automáticamente.
- ¿Qué operación libera/reasigna slot y quién puede ejecutarla? No inventar cancelación feature. Cómo impedir reuse histórico y si existe reingreso del mismo U en el mismo ciclo.
- Reinvite mantiene mismo invitedBy, como candidato actual; ¿qué hacer si ese inviter dejó el plan o se archivó? Fail closed provisional, sin transferencia automática al owner.
- Política de lectura/retención/borrado de occurrences y avisos históricos tras leave y eliminación del plan. Immutable desde cliente puede requerir conservar stub/tombstone en vez del drain histórico: decisión pendiente, no cambio aprobado.
- ¿Índice de navegación obligatorio? Debe incluirse en coste de commit y pruebas antes de GO si no basta query segura del índice por UID.
- Versión de schema, tratamiento de catálogos unavailable y witness expectedOccurrence de JOIN con IDs opaque.
- Alcance final de distribución de permisos entre occurrence/current/Activity y no-owner reads: NO DETERMINADO hasta prototipo. No autorizar lectura cross-user de metadata privada para simplificar servicio.

## 16. Entrega y frontera

Único archivo creado en este review: docs/joint-invitations-structural-review.md. No se modificaron Rules, servicios, UI, migración, fixtures, tests ni runners. No se ejecutaron tests/build/Emulator porque no hay implementación nueva. Working tree acumulado conservado, sin limpieza/revert. Fuentes públicas oficiales y archivos locales únicamente; sin producción/Console, publicación, deploy, commit, push ni Etapa7.

Estado: NO-GO de integración sigue vigente. Propuesta de primer experimento C pendiente de autorización; no hay arquitectura definitiva. Protected new-account bootstrap sigue RELEASE BLOCKER separado. STOP para revisión.
