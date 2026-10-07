# Etapa 6 — prueba de participante académico operativo

Estado: **RECOMENDACIÓN PARA PROTOTIPO, NO ADOPCIÓN NI IMPLEMENTACIÓN**. 2026-10-01.

Fuentes: `slot-subject-diagnostic.md`, `slot-subject-diagnostic-evidence.json`, `slot-subjects.fragment.rules`, `slot-prototype.fragment.rules`, `slot-expansion.cjs`, y lifecycle en `src/services/careerInstances.js`. Se leyó evidencia existente; no se repitió el diagnóstico ni se ejecutó Emulator.

## Decisión propuesta

Prototipar **B + C: slot operacional directo, con referencias verificadas y distribución de comprobaciones entre subject y subjectCheck**. No crear inicialmente otro documento que copie “operativo”. El subjectCheck sería evidencia transaccional de ESA mutación, no una credencial reutilizable.

La referencia al slot/binding puede ser enviada por el cliente como una afirmación a comprobar. No autoriza nada por sí misma: Rules deben contrastar UID, pertenencia, estado member, binding y revisión contra el slot actual. Se evita la lectura del índice en el camino del subject, **no su invariante de unicidad ni su uso en adquisición/release**. Instancia y authority se consultan actuales; no se materializa su vigencia en el slot.

Esta combinación requiere cambiar el proof experimental del check y repartir comprobaciones. No consiste en omitir la lectura del índice sin reemplazar su función de localización y demostrar las invariantes. Nada de este documento autoriza modificar código ni schemas productivos. La factibilidad de ambos presupuestos sigue sin probarse.

## Evidencia congelada y frontera

Owner + dos invitados pasó; owner + tres falló. Subject completo/check reducido mantiene Service call; subject reducido/check completo pasa. Omitir individualmente índice, slot o instancia permite cuatro en los controles estudiados. Reducir authority elimina el síntoma expressions sin resolver Service call. La posición no cambió PASS/FAIL. No participaron historia, Activity ni friendship en el batch. La calibración anterior no es un margen universal.

No se concluye que C sea inviable ni que subjectCheck esté bien o mal como arquitectura definitiva. La cuestión es representar pertenencia actual con una comprobación más corta y repartir las garantías restantes sin duplicar fuentes de verdad.

## Cardinalidad y estados

Plan: owner + hasta cuatro invitees = **hasta cinco miembros totales**. Subject actual: **2..5 UID propuestos**, únicos. Actor puede no estar en la lista propuesta. Toda alternativa debe validar también al actor: el conjunto de evidencia es participantes relevantes UNION actor, acotado por los cinco miembros del plan, no seis. Si no puede demostrar esa cota desde datos verificados, rechaza.

| Estado | Pertenencia/capacidad | Puede recibir nueva propuesta académica |
| --- | --- | --- |
| pending/invited | Reserva un slot | No |
| joined | Mantiene slot y binding | Sólo si instancia y authority actuales lo permiten |
| joined + instancia archivada | Mantiene slot e historia | No mientras archivada |
| joined + authority frozen | Mantiene historia | No |
| released/histórico | No ocupa slot actual | No |

“Operativo” es una conjunción: plan abierto/no deleting, miembro actual, binding del plan, instancia existente activa del catálogo y authority instances/complete válida. No equivale a invited, Activity, sharing ni amistad. El catálogo del plan no se deriva de selección.

Archive no expulsa, no borra historia, no libera slot y no suspende a los otros miembros. Restore de la misma instancia puede recuperar operatividad, sin reactivar sharing ni reabrir un plan cerrado. `metadataLifecycle` ya desactiva consentimiento al archivar y restore no lo habilita: conservar esa frontera.

### Mutaciones e historia del subject

El fragmento actual comprueba `added`, no todos los UID ya presentes. No esconder esta diferencia. El primer prototipo recomendado prueba CREATE con todos los propuestos y actor operativos. Para UPDATE hay que definir explícitamente qué constituye una nueva asignación/repropuesta y qué es mera conservación histórica.

Propuesta conservadora para el ensayo: toda nueva propuesta acredita su conjunto resultante; quitar al archivado/retirado y operar con los restantes debe ser posible. No borrar automáticamente sus referencias históricas. **Decisión de producto pendiente**: si una edición sin nueva asignación puede conservar UID non-operational, necesita una transición de mantenimiento separada que no convierta ese histórico en autorización. No cambiar silenciosamente la semántica productiva de UPDATE ni declarar ese pendiente resuelto con CREATE.

## Comparación A–F: estructura, campos y autoridad (puntos 1–4)

Los nombres de campos son conceptuales, no schemas adoptados.

| Alternativa | Paths y campos | Mutable/inmutable | Fuente de autoridad |
| --- | --- | --- | --- |
| A Documento current de participante | `jointPlans/P/participants/U`: membershipState, careerInstanceId, slotId, membershipRevision, currentOccurrence; catálogo derivado de parent o copia contrastada | Estado actual mutable sólo por transiciones; occurrences siguen inmutables | Documento canónico de membresía + instancia actual + migrationUsers actual. Un campo operational=true NO basta |
| B Slot directo | `jointPlans/P/slots/S` existente; UID/member/binding/revision/occurrence. Referencias acotadas S/U/I/R en el proof de la mutación | Slot mutable por protocolo; referencias en check cambian por nueva revisión | Slot leído actual; instancia y authority actuales. El cliente no decide qué contiene el slot |
| C Check transaccional | `jointPlans/P/subjectChecks/C`: revision, actorUid, updatedAt y proof exacto asociado al subject resultante | Check mutable con revisión monotónica; conserva contador tras retirar subject | Predicados actuales comprobados en el MISMO batch. Existencia de check antiguo no acredita nada |
| D Certificado local operacional | `jointPlans/P/operationalParticipants/U`: binding, slotRevision, membershipEpoch, instanceEpoch, authorityEpoch, state | Proyección/certificado mutable derivado, nunca fuente primaria independiente | Sólo si epochs se contrastan con fuentes actuales o toda invalidación lo actualiza obligatoriamente |
| E Preparación multietapa | `jointPlans/P/subjectPreparations/opId` y pruebas por U: target code, actor, referencias, revisiones, estado prepared/consumed/cancelled | Preparación acotada; consumo terminal; IDs no reutilizables | Fuentes actuales en commit final o bloqueo real de TODAS las invalidaciones; timestamp/TTL no lo sustituye |
| F Membresía colocada en instancia | `users/U/careerInstances/I` con mapa `jointMemberships[P]` de slot/epoch/state | Metadata instancia mutable; historia fuera | Instancia combina membresía y lifecycle; authority sigue en migrationUsers actual |

A es una fuente canónica de membresía por UID, no un cache de lifecycle. Si slots e índice coexisten, sus representaciones deben cambiar atómicamente o una debe quedar sólo como estructura de capacidad. D, en cambio, copia un resultado operacional derivado: ésa es precisamente su dificultad de freshness. No confundir A con una credencial autónoma.

F reduce localización para membership+lifecycle, pero mete membresías sociales en la metadata privada y puede crecer con el número de planes de una instancia. No se recomienda imponer un límite global nuevo de planes para hacerlo caber. Si se fragmenta en otros docs, vuelve a necesitar prueba de lifecycle/authority vigente y pierde parte del ahorro.

## Comparación A–F: lifecycle (puntos 5–12)

| Operación | A Current doc | B Slot directo | C Check transaccional | D Certificado | E Multietapa | F Membresía en instancia |
| --- | --- | --- | --- | --- | --- | --- |
| CREATE plan | Owner participante creado atómicamente; slots de capacidad coherentes | Parent owner/binding y cuatro slots vacíos como C | No check hasta subject | Certificado owner necesita origen atómico | Sin preparación todavía | Registrar owner/P junto al parent; mayor acoplamiento |
| NEW invitation | Estado pending, nunca operativo; slot/index pareados | Flujo C existente; sin binding operativo | No check académico | No cert operativo para pending | Pending no puede preparar autorización | No membership activa; no escribir metadata ajena libremente |
| JOIN | Transición propia member + binding; slot/índice/doc coherentes | Slot member + binding actual; comprobar cycle como hoy | Un check futuro verifica este estado | Crear cert junto a JOIN y fuentes válidas | Sólo joined puede preparar | Actualizar propia instancia + slot/índice en mismo commit |
| REINVITE | Sigue pending, nueva occurrence, sin resucitar member | Protocolo C; nueva occurrence/revision | Check viejo no sirve | Invalidar prueba pending previa | Cancelar/revalidar preparación afectada | Sin membership académica activa hasta JOIN |
| RELEASE | Inactivar/eliminar doc current y liberar slot/índice atómicamente | Protocolo slot/index; revision persiste, punteros null | Nuevo check debe ver ausencia de miembro | Revocar cert junto a release | Preparación no puede sobrevivir sin revalidar epochs | Quitar membership[P] junto a release; permisos de escritura cruzada son riesgo |
| REASSIGN | Doc B propio, A no operacional; no hereda binding | B/occurrence nueva; UID/revision contrastados | Proof de A no coincide con slot nuevo | Nueva identidad/epoch, nunca copiar A | Preparación de A stale | Alta propia B y A invalidado sin trasladar autoridad |
| Archive | No tocar todos los docs de planes; leer instancia actual | No tocar slots; leer instancia actual | Check nuevo ve lifecycle archived | Cache sólo es seguro con lectura actual o fan-out de revocación | Revalidar al consumir; bloqueo global de archive sería cambio contractual | Lifecycle local invalida membresías sin fan-out, pero metadata crece |
| Restore | Mismo miembro recupera operatividad si resto válido | Mismo slot/binding y plan abierto | Nuevo check; no reutilizar el anterior | Epochs/lectura actual, no revivir automáticamente cache | Nueva validación completa | Instancia activa, sin activar sharing ni reabrir plan |

Friendship withdrawal invalida JOIN pendiente según el protocolo previo, pero no expulsa al member unido ni libera slot en ninguna alternativa. A–F no añaden una condición de friendship para cada subject. Cancelación por owner/inviter no definida se conserva como decisión pendiente; no se introduce mediante este review.

## Comparación A–F: writes, frescura y ataques (puntos 13–18)

| Aspecto | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- |
| Subject write | Doc U + instancia + authority; aún necesita distribuir coste | Slot directo verificado + instancia + authority | Mismo batch; correspondence exacta y revisión fresca | Cert sólo no basta; verificar revocaciones | Final commit revalida todo lo mutable o no es seguro | Instancia/membership + authority y contexto plan |
| SubjectCheck | No necesariamente desaparece: repartir comprobaciones | Recomendado estudiar reparto, no duplicar toda cadena | Su función es proof del commit, no credencial persistente | Puede certificar transición, no vigencia eterna | Puede consumir preparación, pero no omitir freshness | Puede separar authority de membership/lifecycle |
| Close | Gate parent actual | Gate parent actual | Check y subject exigen parent abierto | Cert stale no sobreescribe closed | Consumo denegado tras close | Parent actual sigue necesario |
| Stale occupant | Estado U invalidado atómicamente | UID + estado + binding + revision/occurrence de slot actual | Rev/check vinculado a proof actual exacto | Epoch actual requerido, no el copiado | Preparación anterior no puede consumirse | Entrada P removida/inactivada atómicamente |
| Concurrencia | CAS y reciprocidad con slot/index | Revisión slot + contraparte after; no confiar en lectura UI | Revisión check, dos writes indivisibles | Invalidación y certificación deben competir por fuentes | Riesgo TOCTOU central entre preparación/consumo | Contención entre planes que escriben misma instancia |
| Spoof | Cliente no puede autodeclararse member/operativo | S enviado no autoriza: leer slot y contrastar U/I/R | Check solo, replay, code/plan ajeno rechazan | Campo active/epoch arbitrario nunca acredita | opId ajeno, replay/consumo doble/cancelado rechazan | Metadata académica no puede admitir membership arbitraria |

Una carrera contra archive/freeze/release puede ser válida si la propuesta se confirma ANTES de la invalidación. Si invalida primero, la nueva propuesta debe fallar. No se promete cancelación retroactiva de una operación ya confirmada. getAfter se requiere para no ocultar invalidaciones incluidas en el mismo batch. La UI y las lecturas previas de cliente no son la prueba de seguridad.

## Comparación A–F: coste y consecuencias (puntos 19–24)

No se asignan presupuestos numéricos medidos a estos diseños. Las siguientes son familias de lecturas esperadas con hasta cinco miembros, no predicción de llamadas deduplicadas ni de expresiones.

| Alternativa | Reads esperadas al máximo | Riesgo expressions / access | Migración e impacto | Reutilización C / principal riesgo |
| --- | --- | --- | --- | --- |
| A | Parent; current docs por UID; instancias; authorities; pareja subject/check si existe | Lineal acotado, pero dos fuentes por participante más authority no caben por arte de magia | Nuevo current schema, poblar sólo por transición legítima/migración futura explícita | Reusa capacidad/historia; nueva sincronización slot/doc/index y duplicación de membresía |
| B | Parent; slots referenciados directamente; instancias; authorities; contraparte de write | Evita índice por participante. Reparto necesario; margen desconocido | Añadir proof experimental, sin convertir planes legacy | Máxima reutilización slots/index/historia; spoof de referencias si no se contrastan exactamente |
| C | Parent, fuentes actuales repartidas y ambas direcciones subject/check | Trasladar todo a check sólo mueve el límite. Comparaciones grandes/repetidas pueden agotar expressions | Cambiar proof/schema del check requiere discriminación/versionado futuro | Reusa contador y atomicidad; exactitud de correspondencia y replay son críticos |
| D | Cert por U + gates de instancia/authority/parent o epochs actuales | Sin gates es inseguro; con ellos ahorro no demostrado | Documento/invalidación nuevos en todos los lifecycle | Reusa datos C, añade fan-out o más fuentes; cert viejo aceptado tras archive/freeze |
| E | Preparaciones más todas las fuentes que puedan cambiar hasta commit | Menor trabajo previo no garantiza menor proof final; locks añaden costes | Nuevos estados/recovery/cancel y posible cambio de atomicidad | Poco ahorro demostrado; TOCTOU, bloqueos abandonados, operación parcial |
| F | Instancia con entrada P + authority + parent + check | Lecturas más cortas, map y diff crecen con planes | Cambia metadata/lifecycle y escrituras permitidas; fuera de solución mínima | Evita una cadena, pero map sin cota, contención y acceso cruzado; no recomendada |

A/B seguros siguen consultando lifecycle actual; D no puede reemplazarlo simplemente almacenando operational=true. Un epoch copiado no es fresco sin leer el epoch fuente. Authority puede invalidar muchas instancias/planes: no hay prueba local autónoma por plan sin un gate actual o invalidación exhaustiva. No se delega esta responsabilidad a la buena conducta del cliente.

## Candidata B+C: diseño del proof, aún sin schema definitivo

### Localización verificable

El check transportaría un mapa de evidencia acotado por posiciones **owner, slot1, slot2, slot3, slot4**. Cada entrada requerida contiene UID, careerInstanceId y, para slots, occurrence/revision vigente. Las ausentes tienen una representación estricta. No se buscan participantes en un array de posiciones desconocidas ni se intenta cada rama hasta que una coincida.

Rules deben demostrar:

1. Keys exactas/acotadas, tipos y ausencia de UID duplicados; conjunto de UID del proof exactamente el conjunto académico requerido UNION actor. No omitir al actor si no figura en subject.
2. Owner se vincula a parent.ownerId/ownerInstanceId; nunca a una afirmación de rol enviada por cliente.
3. Cada entrada slotN consulta ESE slot y exige UID igual, status member, binding igual a I, occurrence/joinedOccurrence/revision exactas. Pending, released, otro UID, otro plan y revision vieja rechazan.
4. Slots distintos y UID únicos; ningún UID obtiene dos seats. Mantener las Rules atómicas índice↔slot de adquisición/release como invariante inductiva. El proof no puede reparar un índice incoherente ni habilitar writes administrativos arbitrarios.
5. Catálogo de cada instancia igual al parent.catalogId, instancia existente/activa y authority válida para todos los requeridos.

El localizador es una **afirmación no confiable contrastada**, no un hint que sustituye la prueba. Se puede obtener mediante cuatro gets a slots conocidos durante preparación de UI, pero ese cache de cliente nunca autoriza el write.

### Distribución conceptual de responsabilidades

Para no volver a poner toda la prueba en una mitad, se propone ensayar:

- **subject:** schema, atribución y transición propias; parent abierto; correspondencia con check nuevo; lifecycle/catalog de las instancias de todo el conjunto relevante; authority de las posiciones owner y slot1 presentes.
- **subjectCheck:** schema/revisión/actor/time propios; parent abierto; correspondencia con subject cambiado; pertenencia/binding/revision de los slots presentes; authority de slot2, slot3 y slot4 presentes.

La partición de authority es fija por seat, no por “primeros UID que el cliente eligió”. Una entrada no puede moverse de seat para evitar validación porque el slot/owner real la contradice. Cada gate de authority debe ejecutarse exactamente en su mitad asignada; no vale que ambas mitades supongan que la otra lo hizo. Los campos de authority siguen validados completos: no adoptar las ablaciones diagnósticas.

Esto es una hipótesis de reparto, no un presupuesto certificado. Las familias esperadas son:

| Mitad | Fuentes del peor conjunto relevante |
| --- | --- |
| subject | parent; check before y after; instancias del conjunto; authorities de owner/slot1 presentes |
| check | parent; subject before y after; slots no-owner del conjunto; authorities de slot2/3/4 presentes |

Tratar cada llamada como coste a auditar, incluidas repeticiones entre mitades y before/after; **no descontar por caché**. El conjunto máximo incluye owner + cuatro slots. El actor no-owner ausente de la lista propuesta debe entrar en el proof y en su partición sin otra búsqueda índice→slot. Un helper que vuelva a hacer esa búsqueda invalidaría el objetivo del diseño. No se declara margen disponible. El primer gate debe medir composición completa; si no cabe, STOP sin recortar condiciones.

La comparación de conjuntos y el acceso a entradas ausentes pueden consumir expressions o producir evaluation errors. Usar despacho por posiciones fijas no garantiza por sí solo bajo coste: debe probarse con owner/no-owner y diferentes subconjuntos. No añadir ORs de alternativas permissivas o loops de búsqueda por cada UID.

### Correspondencia bidireccional y revisiones

Se propone conservar inicialmente los mecanismos del protocolo, no eliminarlos por ahorro supuesto:

- Subject compara check previo y posterior: revision avanza, actor=request.auth.uid, timestamp servidor y proof exactamente del subject resultante/conjunto requerido.
- Check compara subject previo/posterior: cambio real y misma operación; revision propia monotónica y actor/time correctos.
- Las dos mitades deben compartir la interpretación de proof; no se permiten participants extra, omitidos, distinto code, distinto parent o binding discrepante. La ruta P/code fija ambos destinos.
- Check solo, subject solo, replay, revisión stale y check para otro código/plan se rechazan. El check no se borra al retirar subject, para no reiniciar revisiones. Recreate exige nueva revisión y proof actual.

No se usa request.time como único mecanismo antirreplay ni timestamps del cliente para certificar freshness. El contador + cambio real + after correspondiente son indispensables. Si el reparto exige un cambio de schema, será experimental y discriminado; no se cambia v2 productivo implícitamente.

## Freshness sin fan-out

| Evento posterior al proof antiguo | Qué debe consultar la nueva mutación | Resultado |
| --- | --- | --- |
| Archive | getAfter instancia.lifecycle | No acepta nuevas propuestas para ese UID; resto del plan continúa |
| Restore | Misma instancia activa + slot aún member + plan abierto + authority | Puede operar de nuevo con check nuevo, sin sharing automático |
| Release/reassign | Slot UID/member/binding/revision actuales | Proof occupant anterior falla; nuevo JOIN puede producir proof válido |
| Close/deleting | Parent actual | Niega nueva mutación; historia permanece |
| Authority frozen/legacy | Control actual en mitad asignada | Niega operación multicarrera; no fallback legacy |
| Binding cambiado/invalidado | Slot actual y revisión | Proof antiguo falla; cambios de binding fuera de protocolo permanecen prohibidos |
| Instancia eliminada/inexistente | Documento actual requerido | Fail closed; no recrear trayectoria ni inferir por catálogo |
| Cliente stale | Check revision y fuentes actuales | Rechaza; puede releer, nunca se acepta por snapshot local |

No requiere enumerar todos los planes al archivar o congelar. La historia permanece. Si un owner archivado NO es actor ni destinatario relevante de la propuesta, no debe impedir a miembros operativos continuar por el mero hecho de ser owner. Prueba obligatoria para evitar suspensión global accidental.

## Atomicidad y fuentes de verdad

Slots son fuente de membresía/binding del prototipo C; instancia es fuente lifecycle/catalog; migrationUsers es fuente authority; parent es fuente de owner/catalog/close. Índice es la estructura de unicidad/capacidad, no un certificado académico. Check sólo vincula un commit a estas fuentes.

JOIN, release y reassign mantienen el protocolo protegido de slot/index/occurrence. Si se adopta A o D en otro ensayo, toda transición que cambie membresía debe incorporar su estado current/certificado en la misma atomicidad y no admitir media transición. Cualquier nueva operación que pueda violar la invariante slot↔index tiene que bloquearse; omitir índice en lectura no autoriza desincronizarlo.

Subject/check debe ver estado after cuando otra escritura del mismo commit archiva/libera/invalida. Si la mutación se confirma antes que una invalidación concurrente, es histórica válida; si la invalidación gana, el nuevo write no puede pasar. El prototipo debe probar ambos órdenes y que el perdedor no deje una mitad.

## Privacidad, authority y coexistencia

No conceder get de careerInstance/statusMap ajenos para construir el proof: Rules pueden contrastar fuentes sin abrir su lectura al cliente. Binding/UID del roster requieren como máximo lectores ya autorizados por plan, sin publicar catálogo académico personal o progreso.

Para A/D: get del propio current doc o miembro legítimo según la privacidad de roster acordada; list global y collection group denegados por defecto. Un pending no gana enumeración de bindings de otros. Estos documentos no se vuelven un directorio de carreras. B evita crear esa nueva superficie, pero el proof en check contiene bindings: sus reads deben limitarse a quienes ya pueden ver ese contexto operacional, no a cualquier invitado o usuario que conserve Activity histórica. Schema/límites de lectura forman parte del siguiente ensayo.

`activeCareerId` y `activeCareerInstanceId` nunca autorizan modelo nuevo. Legacy conserva sólo su semántica preexistente; frozen falla cerrado; instances usa fuentes explícitas. Friendship/membership/binding/Activity/compatibilidad no equivalen a sharing; consentimiento unilateral por instancia sigue separado y no se reactiva con restore.

Legacy plan y C deben usar discriminadores inmutables no solapados. En el prototipo, schema nuevo experimental; en una eventual integración, versión decidida explícitamente. No permitir convertir legacy→C actualizando un campo, ni un OR permisivo que interprete un doc como ambos. Todas A–F podrían coexistir sólo con esa separación y migración futura explícita; ninguna la implementa aquí. Bootstrap protegido permanece RELEASE BLOCKER, fuera del review.

## Experimento mínimo propuesto — NO ejecutado

Primero un fixture aislado nuevo derivado de C, sin modificar baseline ni Rules productivas. **Una única candidata B+C**, no campaña de variantes ni optimizaciones automáticas.

1. Crear parent + cuatro slots vacíos; invitaciones y JOIN de los cuatro por operaciones legítimas. Proof de máximo owner+cuatro. Intentar subject/check con cinco; probar actor owner y actor member, incluido actor ausente de una lista de cuatro. Si un camino válido no cabe: STOP inmediato con error íntegro y estado de ambas mitades.
2. Demostrar bidireccionalidad: subject solo/check solo, proof distintos, sujeto sin cambio, revision replay/stale, cross-plan/cross-code, timestamps/actor spoof. Ninguna mitad persiste.
3. Archivo de un participante: nueva propuesta que lo incluya falla; otra entre operativos pasa. Repetir owner archivado no relevante. Slot/history permanecen. Restore misma instancia permite un proof nuevo; sharing continúa OFF; closed no se reabre.
4. Release A/reassign B/JOIN B: referencias UID/slot/occurrence/revision viejas fallan y B válido pasa. Probar dos UID declarando mismo slot, UID duplicado, slot de otro plan, binding ajeno, instancia inexistente/catálogo incorrecto y proof pending.
5. Frozen de cada seat, especialmente ambas mitades de la partición y actor fuera de lista, rechaza; legacy nunca obtiene permiso multicarrera. Ninguna selection altera el resultado.
6. Carreras contra archive/release/freeze/close y dos revisions de check. Registrar orden/ganadores y ausencia de parcialidad, sin reintentar permission-denied como nueva escritura.
7. Prueba acotada de reads privadas del proof y no acceso cross-user al progreso. Actividad/historia no concede autorización.
8. Sólo si los positivos completos pasan: calibración pequeña de lecturas adicionales separada por mitad y actor. Reportar el primer rechazo y presencia literal de expressions/Service call; no convertir agotamiento en negativo lógico. No asumir caché ni deducir presupuesto agregado por suma de margenes.

Validar el máximo antes de ampliar navigation/legacy/delete. Validar después, mediante decisión explícita, UPDATE/mantenimiento de históricos. Cualquier garantía que sólo pueda conservarse cambiando un contrato se reporta, no se resuelve por conveniencia del test.

## Balance de decisión

**Recomendada para prototipar: B+C.** Prioriza fuentes actuales demostrables y atomicidad; acorta localización sin materializar una vigencia que luego requiera fan-out. Reutiliza slots/index/occurrences/release y prueba antes de introducir otro tipo de documento. El check cambia de distribución de proof, no se declara innecesario ni salvador automático.

Garantías a conservar: pertenencia joined actual, binding explícito/catálogo, lifecycle y authority actuales para actor/destinatarios relevantes, referencias sin historia, revisión y bidireccionalidad, hasta cinco, privacidad y ausencia de autorización por selección/sharing/Activity/amistad.

Riesgos pendientes: presupuestos reales por escritura y agregados, expressions del proof exacto/partición, semántica UPDATE histórica, legitimidad de todo camino que pueda mutar slot/index, privacidad de bindings del check y coexistencia productiva. No hay margen medido ni promesa de viabilidad.

**Refutación rápida:** el máximo completo con actor owner y no-owner, checks de ambas mitades y todas las fuentes vigentes. Un fallo válido de presupuesto o un half-write/spoof aceptado obliga a STOP. No quitar autoridad, lifecycle, igualdad de proof, max participants o atomicidad para obtener verde.

Sólo se creó este documento. No código, fixtures, tests ni evidencia anterior modificados. No Emulator, producción, publicación, commit, push, deploy, Etapa7 ni bootstrap. **STOP para revisión antes de prototipar.**
