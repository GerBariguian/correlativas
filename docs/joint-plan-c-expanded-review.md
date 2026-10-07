# Joint Plan C — Expanded architectural review

2026-10-01. **REVIEW/DESIGN ONLY.** No integración, nuevo prototipo ni ejecución de Emulator.

## 1. Executive conclusion y fuentes

**EXPANDED C REVIEW NEEDS PRODUCT/SECURITY DECISION**.

El núcleo probado compone sin una contradicción material identificada: cuatro slots,
índice UID, invitations inmutables/cycles y edges por ocupación. No vuelve al roster
global ni al subjectCheck global. Pero NO se puede congelar todavía una arquitectura
completa de producto: discovery de planes, lectura de operatividad ajena y frontera de
rollout legacy requieren decisiones que afectan permisos, schema y/o coste de commits.
Retención/cleanup también necesita una decisión de alcance. Se enumeran en §28–30.

Fuentes principales leídas, con precedencia del prototipo más reciente para su dominio:

- [Member Edge report](member-edge-report.md) y [evidencia literal](member-edge-evidence.json).
- [Decisión de Subjects](joint-subjects-structural-decision.md).
- [C slots](slot-prototype-report.md), [expansión release/reassign](slot-expansion-report.md).
- [Diagnóstico Subjects 3→4](slot-subject-diagnostic.md): antecedente del protocolo descartado.
- [Review estructural de invitations](joint-invitations-structural-review.md).
- [Cycles](friendship-cycle-design.md): distinguir actualización canónica de diseño histórico.
- [Contratos multicarrera](multicareer-v1.16-contracts.md), especialmente authority,
  bindings históricos, freeze por plan y bootstrap bloqueado.
- Código contrastado: `tests/rules/fixtures/{slot-prototype.fragment.rules,slot-expansion.cjs,
  member-edge.fragment.rules,member-edge.cjs,distributed-friend-activity.cjs,
  friendship-cycle-design.rules}`, `tests/rules/member-edge.test.cjs` y helpers de
  authority/sharing en `firestore.rules` (sólo lectura).

No convertir los headers históricos NO-GO de otras variantes en rechazo del núcleo
C actual; tampoco convertir su evidencia parcial en PASS de composición final.
Las cifras siguientes son evidencia existente, no pruebas ejecutadas en este review.

## 2. Canonical document model candidato

P=planId; S=slot1..slot4; U=UID; O=occurrence opaca; K=code; E=U:O (owner usa U:owner).
Los números 30/31 son discriminadores experimentales; versión productiva pendiente,
sin aceptar documentos legacy por coincidencia accidental de campos.

| Path conceptual exacto | Propósito/fuente | Mutabilidad y creador/transiciones | Lectura actual del prototipo | Autoriza |
|---|---|---|---|---|
| `jointPlans/{P}` | Owner, ownerInstanceId, catalogId, closed/deleting | Owner crea junto a 4 slots; identidad fija; close sólo owner operativo; no delete/reopen | Owner o UID con índice propio, get; list denegado | Contexto global, no roster |
| `jointPlans/{P}/slots/{S}` | Ocupante/membership/binding/current O | Creados empty con parent; NEW/REINVITE/JOIN/RELEASE protegidos; no delete/reset | Owner, UID del slot o actor operativo; get, no list | Sí, fuente current |
| `jointPlans/{P}/inviteeIndex/{U}` | Unicidad y localización U→S | NEW crea junto a slot; RELEASE propio elimina; no update | Propio U u owner; get | Invariante/index, no operatividad por existencia |
| `jointPlans/{P}/invitationOccurrences/{O}` | Emisión histórica U/S/inviter/cycle/revision/time | Inviter crea sólo con activation+Activity; immutable/no delete | Invitee o inviter de esa emisión; get | Sólo enlazada al slot y ciclo actuales para JOIN; sola no |
| `jointPlans/{P}/subjects/{K}` | Identidad común code/schema/atribución/creatorRef | Actor operativo crea; immutable, sin delete | Owner/miembro joined con authority válida, no deleting; get/list | Existencia/tipo de base, no membership |
| `jointPlans/{P}/subjects/{K}/memberEdges/{E}` | Decisión de asignación en una ocupación | Actor operativo crea/assign/unassign; targetRef/identidad/creación fijos; revisión local | Mismos lectores de base; get/list | Relación, nunca permiso de pertenencia ni progreso |
| `friendships/{relationshipId}` | Estado social y cycle actual | Participantes; request/accept/reject/withdraw/re-friend | Partes de relación, no miembros arbitrarios de un plan | NEW/REINVITE/JOIN y sharing según fórmulas distintas |
| `usedFriendshipCycles/{cycleId}` | Reserva irreutilizable ligada a relación/partes | Request crea atómicamente; no update/delete | Cliente: ninguna | Garantía de no-reuse; no lectura necesaria en JOIN |
| `users/{U}/activityInbox/sp_{P}_{O}` | Aviso de invitación exacta | Inviter crea con O; payload fijo, readAt/del propio según política Activity | Sólo dueño del inbox | Nunca |
| `users/{U}/activityInbox/fr_{cycleId}` / `fa_{cycleId}` | Request/accept social | Actor de transición correspondiente; mismo contrato de lectura/readAt | Sólo dueño del inbox | Nunca |
| `users/{U}/careerInstances/{I}` | Instancia real/lifecycle/catalog/consentimiento | Lifecycle legítimo propio; no creado por plan | Propio U, no acceso privado por membership | Sí, fuente actual |
| `migrationUsers/{U}` | Authority/generation/phase protegidos | Operador/protocolo ya autorizado; cliente no escribe | Propio U | Sí |

No documento separado de occupancy, operational=true, membership certificate ni
subjectCheck. `joinedOccurrence`, binding y revisión viven en el slot. El binding
del owner vive en parent. No se añade evidencia técnica al hot path por anticipado.
Manifiesto de migración futura (§18) sería técnico/privado, no permiso académico.

## 3. Una sola fuente de verdad

| Propiedad | Autoritativo | Qué NO sustituye la fuente |
|---|---|---|
| Current participant no-owner | Slot con U/status y biyección índice | Activity, occurrence antigua, edge, friendship |
| Current occupancy académica | Slot member con O==joinedOccurrence y revision | UID solo o slotId solo |
| Binding | Slot member.binding / parent.ownerInstanceId | Selección, catálogo compatible encontrado al azar |
| Membership | Owner fijo o slot member actual | Instancia activa, sharing o amistad |
| Invitation history | Occurrence immutable | Slot actual, que puede apuntar a Y |
| Friendship freshness | Única relación accepted actual con ciclo igual al requerido | Certificado antiguo o aviso accepted |
| Academic operability | Membership+binding+instancia activa/catalog+authority+parent abierto | Booleano persistido/copias históricas |
| Subject assignment | Edge canónico y state/revision | Array legacy, otro edge, supuesto contador |

Copiar U/O/cycle en occurrence o targetRef no crea otra fuente current: son referencias
que deben coincidir con las fuentes actuales. Índice y slot se mantienen recíprocamente,
no son dos registros editables independientes. Los campos de selección no participan.

## 4. Membership state machine

| Estado | Persistencia | Capacidad | Operación que lo cambia |
|---|---|---|---|
| absent | Sin índice de U; no slot suyo | No | NEW válido |
| invited/pending | Slot pending, binding/joinedOccurrence null, índice U | Sí | JOIN, REINVITE o RELEASE propio |
| joined/current | Slot member, binding y joinedOccurrence actuales | Sí | RELEASE propio; no REINVITE |
| academically non-operational | Mismo member; falla lifecycle/authority/catalog/parent | Sí | Restore/autoridad/contexto válido; no nuevo JOIN automático |
| released/historical | Slot vacío o de otro; índice U eliminado; historia permanece | No | NEW nuevo, aun para mismo UID |

Non-operational es estado **derivado**, no otro valor de status ni una expulsión.
Pending cuya amistad se retiró sigue pending y consume cupo; su JOIN queda bloqueado.
Un owner es miembro separado de los cuatro slots. Closed bloquea operaciones según
§13, no transforma a todos los slots en released. No hay movimiento entre slots ni
rebind de un member sin release/reingreso en este candidato.

## 5. Occupancy

Se distinguen reserva de cupo y vínculo académico aceptado. NEW adquiere cupo con
O; aún no hay binding/edge válido. JOIN fija la referencia académica usando la O
vigente, slot revision y binding explícito. Release termina ese vínculo.

La clave académica propuesta es `(P,U,O)`; el edge además guarda S, I y slotRevision.
No hace falta un ID adicional para el comportamiento probado. La identidad se
reserva mediante occurrence no reutilizable, no mediante confianza en UUID aleatorio.
El owner tiene clave reservada `(P,ownerId,'owner')` y revisión de referencia 0.

A1 deja de coincidir al liberar/reasignar; A2 tiene O distinta aunque U y S sean los
mismos. No se permite borrar/recrear parent/occurrences para resetear identidades.
Una futura transferencia de owner o purga necesita contrato propio; no está implícita.

## 6. Invitation occurrence vs occupancy

| Operación | Reserva de cupo | O y vínculo académico |
|---|---|---|
| NEW | Comienza reserva para U en S | O nueva; no binding todavía |
| REINVITE | Conserva U/S y cupo, mismo inviter | O cambia X→Y y revision+1; sólo pending, nunca invalida un edge joined válido |
| JOIN | Mismo cupo | Conserva O/revision; fija binding y joinedOccurrence=O, status member |
| RELEASE | Termina reserva | Limpia current; O histórica no cambia |
| REASSIGN / mismo UID vuelve | Nueva reserva | O nueva, revision no se reinicia, necesita JOIN propio |

**No afirmar que REINVITE conserva una occupancy ID inmutable desde el primer NEW.**
Eso no es lo implementado: conserva la reserva, pero cambia O pendiente. No existe
ningún edge legítimo de esa pending que necesite conservar identidad. Una vez joined,
REINVITE está prohibida: la identidad aceptada sí permanece hasta release.

La propuesta inicial de generation separada en el review estructural fue sustituida
en prototipos posteriores por O reservada+revision; no mezclar ambos schemas. Si el
producto requiriese identidad estable de reserva a través de reinvites, sería una
nueva decisión, no una garantía de este candidato. No hay necesidad demostrada aquí.

## 7. Friendship cycles

NEW/REINVITE prueban amistad actual accepted entre invitedBy y invitee y O liga ese
cycle. JOIN repite esa prueba contra el inviter original, no contra owner por defecto.
C1 retirado no revive bajo C2: X sigue C1; Y exige nuevo cycle/O y aviso nuevo.

La variante canónica usa participantes ordenados para altas nuevas. Las lecturas de
JOIN soportan una relación directa o inversa, exactamente una. El prototipo aún usa
fixtures con relaciones inversas existentes: **lectura compatible no prueba que un
cliente pueda renovar una amistad legacy inversa con las Rules canónicas de escritura**.
La transición de orientaciones/formatos existentes es prerequisite de rollout (§17–18).

Certificate reserva cycle globalmente y no se borra. JOIN no lee toda su historia.
Subject create/assign/unassign, release y close no consultan amistad. Sharing consulta
amistad actual accepted, pero no exige el cycle histórico de la invitación al plan.

## 8. Owner

OwnerId y ownerInstanceId fijos, catálogo único; sin slot5 ni índice owner. Su edge
usa U:owner. Operar como actor/target exige authority instances/complete e instancia
propia activa compatible. Archive del owner no debe bloquear operaciones entre otros
miembros: esas operaciones sólo consultan contexto parent y actor/target relevantes.
Esto se infiere de helpers, no fue una prueba específica del último member-edge run.

Close implementado exige owner operativo; owner archivado no puede cerrar hasta
restaurar. No se disfraza como permiso administrativo ya resuelto. No owner release,
transfer ni cambio libre de binding. Restore no reabre plan ni reactiva sharing.

## 9. Subjects/member edges

Base schema31 con code/path y atribución; creación por owner/member operativo. Cero
edges es válido; no cambia progreso ni crea membership. ID E exacto U:O evita una
segunda relación equivalente sin scan. Puede haber más de cinco edges **históricos**;
máximo cinco identidades current deriva del parent+cuatro slots, no del número físico.

Assign/create/reactivate revalida actor y target; unassign revalida actor, plan y CAS
del edge, pero no requiere que un target histórico siga operativo. Identidad,
targetRef y createdBy/time inmutables; state cambia assigned↔unassigned con revision+1,
updatedBy actor autenticado/time servidor. No delete que reinicie revisión.

Multi-assign son operaciones independientes con resultado por persona. No batch global,
rollback prometido ni ocultamiento de parciales. Edge assigned histórico no se presenta
como autorización current; ni siquiera un current implica cursada/aprobación real.
Retire/base delete no implementados. No añadir Activity por cada edge.

## 10. Archive/restore y freshness

Archive afecta instancia+sharing según lifecycle; no libera slot, borra historia,
reescribe edges ni cierra el plan. Target archivado no recibe assign nuevo; los demás
continúan. Restore misma instancia permite operar si todavía coincide contexto actual;
sharing sigue OFF y closed permanece closed. Authority frozen falla por fuente actual,
sin propagar un flag a cada plan.

Rules del edge prueba `targetRef → slot member actual/owner → instancia → authority`
y contexto parent. No necesita otros edges. getAfter impide aprovechar un estado
previo si el mismo commit invalida fuentes. Matriz integrada de todas las combinaciones
maliciosas en un commit aún pendiente; PASS secuencial no equivale a esa matriz.

## 11. Release/reassign

Alcance candidato: **retiro voluntario del propio UID pending/member**, no expulsión
por owner ni admin online. Slot vacío/nulls y revisión siguiente + delete índice propio,
atómicos y recíprocos. Requiere authority válida y no deleting, no instancia activa.
Historia y edges quedan. Retirarse no borra datos ajenos ni eventos.

REASSIGN es NEW después de release, nuevo o mismo U, binding null y O nueva; no hereda
edges ni binding. No se necesita generación global. Reinvite de otro inviter exige
release previo: no puede apropiarse de un pending ajeno. Slot revision falla cerrado
al agotar rango; no reset.

## 12. Withdrawal

Withdraw de amistad corta JOIN pending inmediatamente; re-friend no revive X. No
expulsa joined, no toca slots/edges y no impide sus operaciones por amistad perdida.
Sharing corta futuras lecturas por su condición independiente; no puede retirar bytes
ya leídos. Si re-friend ocurre y consentimiento sigue ON, puede volver a permitir
lectura: no confundirlo con restore de carrera, que mantiene consentimiento OFF.

## 13. Close

| Operación con closed=true | Candidato |
|---|---|
| NEW / REINVITE / JOIN | Denegada por openPlan |
| Crear subject / assign / unassign | Denegada por openPlan |
| RELEASE propio | Permitido mientras no deleting y authority válida; inferido de releasing, prueba closed pendiente |
| Leer parent/slots/historia/edges | Según rol; closed no agrega lector ni revoca por sí solo |
| readAt/eliminar aviso propio | Según Activity, no reabre ni modifica plan |
| Emitir invitación nueva | No; su fuente está bloqueada |

Close cambia parent sin fanout; no elimina historia. No hay reopen. La emisión de
avisos de amistad no depende de un plan cerrado.

## 14. Activity

Sólo friend request received, friend request accepted y joint invitation. C usa sobre
experimental SLOT_INVITATION/schema30 con P/O/cycle/actor; friendship usa schema2 y
target relationship/cycle. No asumir que el parser productivo soporta esos sobres.

NEW y REINVITE obligan occurrence+Activity del mismo commit; occurrence prueba slot
before/after y aviso nuevo, aviso prueba occurrence nueva y vínculo exacto. X permanece
histórica al emitir Y; readAt es independiente por ID. Delete del aviso no permite
recrear X porque la fuente ya no es nueva. Activity no es discovery exhaustivo ni auth.
Un clic antiguo sólo intenta resolver fuentes autorizadas; no acepta Y usando X.

readAt y delete propios heredan permisos existentes en fixture. La composición final
de todos los grants Activity y parsers old/new necesita revalidación: Rules coincidentes
permisivas podrían crear bypass aunque una rama nueva sea correcta.

## 15. Sharing

Fórmula para lector distinto: authority válida de ambos AND amistad actual accepted
AND instancia del dueño activa AND consentimiento explícito por esa instancia
AND lector con instancia activa del mismo catalogId (catalogMemberships contrastado)
AND snapshot current/compatible (revisión de progreso, timestamps, consentEpoch y versión).

Ni slots, edges, bindings, Activity, compatibilidad sola ni selección sustituyen un
término. `activeCareerId`/`activeCareerInstanceId` no autorizan C. El permiso propio
del dueño del snapshot es distinto de este acceso cross-user. No direct statusMap ajeno.
La no transitividad exige amistad directa lector/dueño, no amistad de otro miembro.

## 16. Migration authority

Se reutiliza control schema1, generation `multicareer-v1`, manifestId=U, origin legacy|new,
authority instances y phase complete, validados estructuralmente. Blocked no opera;
no basta `authority=instances` sin phase/generation válidas. No cliente crea controles.

CREATE: actor. NEW/REINVITE: actor y destinatario. JOIN: joiner. RELEASE: propio U.
Subject create/close: actor. Assign: actor+target; unassign histórico: actor.
Legacy/frozen sin esos controles no recibe permiso de escritura C. History gets de
parent/slot/occurrence tienen políticas distintas y no equivalen a mutación académica.
El fixture no exige authority actual del antiguo inviter para JOIN: valida joiner,
occurrence y amistad. No añadir esa lectura por conveniencia sin revisar contrato/coste.

Freeze de usuario no congela todos los planes; freeze/cutover por plan debe impedir
escritores concurrentes de esa unidad. No dual-write ni fallback por ausencia de datos.
Bootstrap protegido permanece RELEASE BLOCKER independiente, fuera de este review.

## 17. Legacy coexistence — estrategia elegida para el diseño

**Legacy stays legacy hasta migración explícita; nuevos planes C tienen discriminador
inmutable y nunca son interpretados por permisos legacy.** No conversión cliente.
Planes legacy/v2 y C no comparten una rama OR permisiva ni arrays current+slots current.
Datos reales existentes y schemas presentes: no determinado, sin acceso a producción.

La conservación de datos legacy NO significa conservar un JOIN sin cycle después de
habilitar withdrawal: eso reabriría el bypass que el contrato prohíbe. Antes de activar
cycles/withdrawal, la estrategia segura debe cerrar JOIN/emisión legacy sin evidencia
de ciclo o completar una transición explícita compatible. Miembros históricos no se
expulsan. Esa suspensión y la ventana de rollout requieren aprobación (§28).

Amistades legacy inversas o sin cycle/certificado necesitan inventario y transición
propia; no inferir certificado de una invitación vieja. Identity canónica nueva no
acredita actualización directa de todos los docs inversos existentes. No ejecutar
rename ni backfill: sólo diseñar, sin doble relación current.

## 18. Joint Plan migration conceptual e idempotente

Unidad separada de migración de usuarios. Propuesta conservadora para revisión:
mantener fuente legacy intacta/no operativa durante cutover y crear destino C bajo
P nuevo reservado, sin mutar discriminator cliente del original. No elegir bindings
por selección. Registro técnico conceptual `jointPlanMigrations/{sourcePlanId}` sólo
operador, sin grants cliente; aún NO schema/Rules implementados ni acceso aprobado.

1. Inventory fuente/subcolecciones/referencias; clasificar owner, miembros, pendientes,
   inviter, catálogo y cada binding. Manifest reserva P destino y mapping S/O/E estables,
   hashes/versiones, checkpoints, conflictos y procedencia. No progreso personal en logs.
2. Maintenance/freeze de TODOS los escritores del plan y transiciones relacionadas;
   verificar enforcement y reread. No suponer que el freeze del owner basta.
3. Owner/catalog/bindings demostrables: conservar explícitamente instancias existentes;
   archive no borra binding histórico. Faltante/unknown no se convierte en carrera nueva.
   Si no se puede demostrar owner o preservar semántica de un miembro, no activar destino.
4. Miembros ya joined con evidencia inequívoca: mapping de migración documentado, identidad
   nueva de transición (no una aceptación/evento original inventado). La excepción de
   importación al constructor client-side de slots/occurrences requiere contrato específico
   y prueba: NO hacer pasar un registro importado por invitación emitida con Activity.
5. Pending no se autoacepta ni se valida con el cycle nuevo. Preservar historia; requerir
   nueva invitación explícita y JOIN real para activarla. No fabricar avisos retroactivos.
6. Copiar Subjects según §19, validar pérdidas/privacidad/mappings; igualdad exacta con
   checkpoint → no-op, divergencia → conflicto. Nunca sobrescribir destino diferente.
7. Activar destino sólo tras validación/cutover protegido; fuente deja de autorizar.
   Recovery reanuda mapping reservado, no duplica plan ni O. Rollback conserva maintenance;
   no reabre escrituras legacy que pierdan nuevos cambios o bypass de cycle.

Este protocolo es especificación de fronteras, NO migrador listo. Especialmente falta
aprobar/definir evidencia de importación de membresía y destino de históricos; por ahora
no migrar planes es la política segura elegida. Ningún registro social crea careerInstance.

## 19. Subject migration

| Fuente legacy | Tratamiento conceptual seguro |
|---|---|
| UID miembro, binding y ocupación destino demostrados | Base+edge mediante importación controlada con procedencia; no fingir createdAt/actor originales desconocidos |
| Participante histórico/released | Preservar payload original bajo archivo legacy no autoritativo; no edge current por UID solo |
| Ambiguo / array incluye pending | Preserve/report; no inferir JOIN de proposedParticipantIds |
| Instancia inexistente | Unresolved, no crear instancia ni binding para satisfacer plan |
| Catálogo desconocido | Catalog-unavailable, literal preservado; no reemplazo arbitrario |

Si no hay representación aprobada para un caso, destino no se declara migrado completo.
No llenar targetRef con occurrence nueva por mera conveniencia de conversión. No usar
subjectChecks antiguos como certificado de nueva ocupación. Archivo histórico mínimo
puede ser la fuente legacy congelada; no necesita grants públicos nuevos por ahora.

## 20. Schema isolation

| Ataque | Obligación de Rules futuras |
|---|---|
| Cliente legacy escribe C | Discriminator exacto + schema C + authority; no grant legacy coincidente |
| Cliente C reinterpreta legacy | Parent contract exclusivo; paths hijos dependen del mismo tipo |
| Cambiar schemaVersion / generación | Identidad de contrato inmutable por cliente |
| Slots C y roster legacy mezclados | Keys exactas y invariantes de inicialización; no dos fuentes current |
| Edge bajo subject legacy | Parent C + base schema C/code requeridos |
| Subject legacy bajo C | Schema de base estricto, sin proposedParticipantIds autoritativo |

El fixture reemplaza el bloque de planes, no carga coexistencia legacy/C productiva.
Estas obligaciones son bloqueables conceptualmente, NO tests integrados aprobados.
Schema/generation experimentales no se publican tal cual por este documento.

## 21. Read model y queries

- Parent conocido: get autorizado. Roster: cuatro gets puntuales de slots + owner;
  no escanear occurrences para buscar current. Pending/member vienen del slot.
- Subjects: collection local al plan. Relaciones: subcollection memberEdges por K,
  paginable; comparación U/O/S/revision distingue stale por ocupación.
- Estado académico: propios datos pueden comprobarse; sobre otros, el cliente NO
  obtiene careerInstances/migrationUsers por membership. Mostrar desconocido/no verificado
  hasta un canal autorizado; Rules decide cada write. No persistir una copia como permiso.
- Historia: occurrence sólo por partes autorizadas; Activity permite intentar navegación
  puntual, no volver a ver parent tras release ni reconstruir listado completo.

**Discovery pendiente:** parent.list y slot/index.list están denegados. El índice
actual sólo contiene slotId, UID en nombre; no se ha demostrado una query collection-group
autorizable que enumere todos los planes de U. Filtrar ownerId podría servir para propios
con Rules específicas, no para invitaciones/membresías. No asumir que documentId aislado
en collection-group resuelve consulta global ni que Rules filtra resultados.

Opciones a decidir: (a) permitir una query mínima de discovery con campos/índices y
alcance de lectura acotados, a prototipar; (b) índice privado por usuario mantenido
atómicamente, con coste nuevo; (c) aceptar sólo navegación puntual sería degradación
funcional, no solución implícita. Ninguna implementada ni presupuestada.

Índices potenciales: ownerId+schema/closed; discovery U; edges uid/state/orden si se
requiere filtrar/paginar. Query exacta determina índice; no inventar una lista de índices
remotos ni afirmar que están creados. No dependencia oculta de carrera seleccionada.

## 22. Privacy matrix (get existente; list sólo donde indicado)

| Documento | Owner | Current member | Pending invitee | Unrelated |
|---|---|---|---|---|
| Parent | Sí | Sí por índice propio | Sí por índice propio | No |
| Slots | Los 4 | Los 4 si actor operativo; propio aun no operativo | Sólo propio | No |
| inviteeIndex | Gets individuales | Sólo propio | Sólo propio | No |
| Occurrence | Sólo si es inviter/invitee | Sólo si es parte de esa emisión | Sus emisiones | No, salvo parte histórica legítima |
| Subject base/edges | Sí con authority instances válida/no deleting | Sí joined con misma condición; archive no elimina lectura | No | No |
| Friendship | Sólo relaciones propias | Sólo relaciones propias | Sólo relaciones propias | No acceso por conocer plan |
| Certificate de cycle | No | No | No | No |
| Academic snapshot ajeno | Sólo fórmula §15 | Sólo fórmula §15 | Sólo fórmula §15 | No por plan; posible por amistad/consentimiento independientes |
| Progreso/instancia privada | Sólo propia | Sólo propia | Sólo propia | Sólo propia |

Released pierde current/index; puede leer sus occurrences/avisos históricos, no obtiene
parent ni edges por conservarlos. Invitador que salió conserva lectura de su occurrence,
no membership. Colecciones parent/slots/index/occurrence no tienen list aprobado.
Edges/base sí admiten list dentro del plan con edgeReader. Matrix no agrega nuevos permisos.
Resolver operatividad ajena o leer roster completo estando archivado necesitaría decisión
si se pide más que esta matriz. No inferir privacy completa del sólo PASS de writes.

## 23. Delete/cleanup

Parent delete denegado en C; slots/occurrences/base/edges no admiten delete ordinario.
El drain legacy actual no cubre estas subcolecciones ni sus reservas. Borrar parent
solo dejaría huérfanos; purgar O y recrear P permitiría reuse si no hay tombstone protegido.

No demostrado que un cleanup cliente+Rules completo sea imposible; tampoco demostrado
viable. Requiere modo deleting, escritores cerrados, orden de drain, idempotencia,
prueba de autorización, tratamiento Activity/historia y reserva permanente P. No se
promete prueba exhaustiva de subcolecciones vacías en Rules ni se inventa backend.

Alternativas pendientes de producto: diferir borrado físico C y conservar closed/history,
o exigir protocolo protegido probado antes de release. Retención de occurrences/cycles
crece; no borrar certificados de no-reuse por ahorrar almacenamiento. CareerInstance
physical deletion continúa diferida y separada.

## 24. Rules-cost inventory cualitativo

En toda fila se incluye recurso propio before/after sin contarlo como get externo.
GA=getAfter necesario para fuentes y vínculos del commit. No se suman rutas como calls
facturadas, ni se presupone caché. A=actor; T=target.

| Operación | Global/contexto | Actor | Target / enlaces after | Historia / otros participantes |
|---|---|---|---|---|
| CREATE | Parent nuevo, tombstone y 4 slots after | Control+instancia owner | Inicialización recíproca | 4 slots fijos; no historia |
| NEW | Parent abierto | Control+instancia; índice/slot si miembro | Índice T/slot before-after, O nueva/ausencia, control T, amistad A↔T ambas rutas, aviso before-after | Sólo nueva O; no otros targets |
| REINVITE | Parent | Igual NEW | Mismo slot/index, cycle distinto, O y aviso nuevos, control T/amistad actual | No cadena X; no otros targets |
| JOIN | Parent | Joiner: control+instancia | Índice propio, O actual por get, friendship actual GA, slot after joinedOccurrence | Una O vigente, no roster global |
| RELEASE | Parent no deleting | Control U, slot propio | Índice before/ausente after; slot vacío after/revision | Ninguna historia, ningún otro target |
| REASSIGN | NEW sobre slot empty | Igual NEW | Nuevo U/O/index/aviso | No herencia ni scan de occupants previos |
| Subject create | Parent abierto | Control+instancia y slot si no owner | Ninguno | Ningún edge |
| Edge assign owner | Parent+base GA | Control+instancia | Control+slot+instancia T, o self ya validado | Ningún otro edge/history/amistad/Activity |
| Edge assign non-owner | Parent+base GA | Control+slot+instancia | Igual target anterior | Independiente de ordinal #1/#5 |
| Edge unassign | Parent+base GA | Control+instancia+slot si aplica | Identidad/revisión propia; no exigir operatividad target histórico | Sólo edge propio; no otros |

NEW tiene 4 writes; REINVITE 3; JOIN 1; RELEASE 2; subject create 1; edge 1.
No promover un conjunto de 5 edges a un batch con presupuesto agregado sin nuevo ensayo.
Discovery o metadata visible NO están incluidos en esos costes.

## 25. Known margins / RISK

| Medición existente | Último extra PASS / primero FAIL | Alcance |
|---|---|---|
| Member edge #1 owner→four | +3 / +4 | Fixture Member Edge actual |
| Member edge #5 owner→four | +3 / +4 | Misma pareja, cuatro edges previos |
| Member edge non-owner one→four | +2 / +3 | Fixture actual |
| NEW C | +7 / +8 | Slot padding, owner, amistad inversa, fixture C inicial |
| REINVITE C | +6 / +7 | Mismo alcance inicial |
| JOIN C | +3 / +4 | Mismo alcance inicial |

Fronteras con Service call error, sin 1000 expressions en esos probes. No son márgenes
universales ni números exactos de calls base. Los tres umbrales de C NO se midieron de
nuevo con todas las ampliaciones. No-owner NEW/REINVITE padding: no determinado.
El antiguo JOIN +6/+7 del núcleo cycles era otro fixture: no sustituye JOIN C +3/+4.
No usar el viejo CREATE global +0/+1 como presupuesto de CREATE C sin invitados.
La integración no puede agregar lecturas casuales ni grants alternativos sin medir.

## 26. Invariant matrix

| Invariant | Docs fuente | Operación mantenedora / proof | Evidencia |
|---|---|---|---|
| Máximo 4 invitees | Cuatro slots exactos | CREATE 4 vacíos; denegar slot5/delete/reset | C gates 1/7/8 |
| UID único | Slot↔inviteeIndex/U | NEW recíproco, release recíproco | C duplicate UID y carreras; expansión release |
| Historia immutable/no-reuse | O / certificado cycle | Create-only reservado, no delete/recreate | C mutate/delete/replay; cycles |
| Stale cycle no JOIN | Friendship actual+slot/O | Cycle exacto, accepted invitedBy↔U | C C1→C2/Y/stale X |
| Stale occupancy no assign | Slot actual+targetRef | UID/O/revision/binding iguales | Member Edge A1→B1→A2 sobre edge ausente + reactivación |
| Binding actual | Slot/parent+careerInstance | Instancia propia/active/catalog | C JOIN; Member Edge wrong binding/catalog |
| Archive freshness | CareerInstance after | Nueva asignación falla, sin fanout | Member Edge archive/restore/otro miembro |
| Authority | migrationUsers | Control válido instances/complete | Member Edge frozen actor/target; C negatives |
| Edge único/CAS | E=U:O, resource.revision | ID exacto, state alterna, revision+1 | Duplicate/alternate/replay/carrera |
| No transitive sharing | Consentimiento/snapshot+amistad directa+compatibilidad | Fórmula independiente de plan | Auditoría actual y negativos de privacidad; matriz integrada pendiente |
| Activity atómica | Slot↔O↔aviso | Fuente nueva exacta, antes/after recíprocos | C mitades/omisión/replay, carrera último cupo |
| Schema aislado | Parent/base discriminator | Branches exclusivas y keys estrictas | Base mutation/old-client negativos; coexistencia NO probada |

## 27. Prototype coverage matrix

| PROVEN IN ISOLATED PROTOTYPE | ARCHITECTURALLY INFERRED | NOT YET TESTED IN COMPOSITION |
|---|---|---|
| C CREATE, NEW 1..4 directa/inversa/mixta, REINVITE C2, JOIN stale | Coste no crece con historia | Mismo corpus completo con branches legacy y schemas finales |
| Inviter no-owner != owner | No-owner consulta sólo contexto relevante | Todas orientaciones/márgenes no-owner finales |
| Release/reuse A→B→C, carreras locales | Release closed permitido por código | Closed-release/authority especiales y eliminación completa |
| Edges: 24 gates, 43 negativos, 5 carreras, 14 probes | Owner archivado no relacionado no bloquea otros | Prueba específica owner archived + todos los combos after maliciosos |
| A1 no revive, unassign A1 conserva A2 | Más historia no añade reads de asignación | Paginación histórica, UX/read model final |
| Negativos cross-user/privacidad focalizados | Membership nunca entra fórmula sharing | Regresión exhaustiva sharing unilateral/no transitivo con C final |
| Cycles canónicos/concurrencia y versiones de Activity en fixtures | Identidad social independiente de membership | Backfill de orientaciones/schemas legacy y rollback final |
| Schema estricto de edge/base | Aislamiento parent puede imponerse por guards | Todos los grants reales coincidentes y old-client/new-client |

Evidencia congelada Member Edge: 1/1 Node, 24 gates, 43 rechazos (6 A, 37 D-evaluation),
5 carreras y 14 probes. No reejecutada. No se convierte D en rechazo lógico limpio.
C inicial: 4 tests Node entre gates/padding, 35 negativos, 5 carreras y 22 probes
(§7 del informe C). Expansión posterior tuvo STOP en subjectCheck: no presentarla
como suite integral verde; evidencia release parcial se conserva con ese alcance.

## 28. Contradictions / uncertainties / decisiones

No se identificó contradicción material entre los **contratos vigentes** de los núcleos
probados. Diferencias de documentos históricos se resolvieron por precedencia explícita,
no cambiando prototipos: generation separada/serial global/subject roster/min2 como
invariante de persistencia ya no describen el candidato probado. REINVITE vs occupancy
queda precisado en §6; no hay REINVITE sobre joined que invalide sus edges.

Decisiones pendientes que impiden congelar el producto:

1. **Discovery completo y privado.** Elegir query derivable del índice con schema de
   consulta verificable o índice privado adicional. El segundo agrega writes; el primero
   puede cambiar grants/fields. Ambos requieren prototipo, ninguno viene del PASS actual.
2. **Operatividad visible de terceros.** ¿Aceptar estado no verificado y decisión final
   de Rules, o requerir una proyección mínima autorizada? En ese caso definir campos,
   lectores, freshness e invalidación sin fanout/información privada. No backend nuevo
   autorizado. Una copia stale no puede ser fuente de permiso.
3. **Coexistencia/cutover social legacy.** Aprobar suspensión temporal de JOIN/emisión
   sin cycle y protocolo de transición de relaciones inversas/sin certificados antes de
   habilitar withdrawal. Mantener silenciosamente JOIN legacy sería contradicción con
   invalidación permanente de pendientes; por eso NO se propone esa combinación.
4. **Delete/retención C.** Aprobar diferir borrado físico o exigir diseño/viabilidad del
   cleanup antes de release. Close no se presenta como borrado. No reusar drain legacy.
5. **Migración de planes.** Si es requisito de esta entrega, aprobar semántica de membresía
   importada/archivo histórico y su prueba de origen. Mientras tanto legacy permanece
   aislado, no se ejecuta conversión parcial ni se inventan bindings/occurrences.

No son solicitudes para rediseñar invitations/edges. Decisiones que NO se agregan:
owner kick, transferencia de owner, rebind, nueva Activity por edge ni auto-release.
La política actual de close exige owner operativo; flexibilizarla sería otra decisión,
no ajuste implícito de este review.

## 29. Integration prerequisites y validación del review

Antes de integration plan definitivo: resolver §28; fijar versiones/exact fields y
matriz de queries/lectores; mantener constructor y mutaciones recíprocas; asegurar que
schema C no hereda grants legacy; especificar rollout sin ciclo bypass; medir todos
los commits reales con discovery si añade obligaciones; pruebas de old/new client,
read model, Activity versionada, freeze/cutover, no-dual-write y cleanup elegido.

Antes de release: además matrices integradas privacy/cost/concurrency/rollback y
bootstrap protegido resuelto por etapa autorizada. Este review no autoriza nada de ello.

Sólo se crea `docs/joint-plan-c-expanded-review.md`. Se leyeron documentos/código y
evidencia local JSON; **cero tests/Emulator/build ejecutados**, porque no hay implementación.
Se comprueban whitespace/diff y preservación de archivos previos por hashes. El working
tree acumulado no está limpio y se conserva. Sin producción, Console, publicaciones,
servicios/UI, migración, deploy, commit/push, Etapa 7 ni bootstrap.

## 30. Exact decision gate

Núcleo local coherente, evidencia aislada aprobada preservada. Arquitectura completa
todavía no congelable por decisiones de privacidad, discovery y transición legacy.
No GO de integración ni de release. STOP para revisión.

**EXPANDED C REVIEW NEEDS PRODUCT/SECURITY DECISION**
