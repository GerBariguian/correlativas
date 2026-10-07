# Evidencia de memberships legacy para C

Diseño para revisión, 2026-10-01. No implementación ni autorización de migración.

## 1. Alcance y fuentes verificadas

Se define clasificación determinista de relaciones usuario↔plan. No se reabre
Discovery, Operability Privacy ni la transición a nuevo planId. No se diseña
retención/borrado, bootstrap ni migración de Subjects.

Inspección del modelo **v1.15, commit `8a4abd4`**: `firestore.rules`, match
`jointPlans/{planId}`, funciones `validPlan`, `changeOwnMembership`, `inviteMember`,
`closePlan`, y `src/services/jointPlans.js`. Complementan `docs/planes-colaborativos.md`,
`docs/multicareer-v1.16-contracts.md` (§ evidencia/control/algoritmo) y
`docs/joint-plan-legacy-cycle-transition-decision.md` (decisión aceptada).
El working tree contiene integración experimental posterior: no se confunde con v1.15.

Observación: CREATE exige memberIds=[owner]; JOIN agrega únicamente al propio
request.auth.uid ya invitado; salida lo retira de ambos arrays. Otras transiciones
no pueden agregar miembros. ownerId/careerId no cambian por UPDATE autorizado.
JOIN exige plan abierto y carrera activa compatible en ese instante, no una prueba
persistida de qué careerInstance existe hoy. No hay log de JOIN ni timestamp por
miembro. Esto prueba el contrato del repositorio, no qué Rules estuvieron desplegadas
para cada escritura real. No se consultó producción.

## 2. Frontera de confianza

Aceptar como estado legacy autoritativo una lectura administrativa coherente del
origen congelado, con schema reconocido y procedencia dentro del contrato legacy
reconocido. No aceptar un JSON aportado por cliente como prueba de estado servidor.
No exigir un event log inexistente a todos los planes válidos ni sumar notificaciones
para compensarlo. La confianza en el estado persistido es la misma premisa necesaria
para migrar cualquier dato autoritativo, no una certificación criptográfica de JOIN.

Una escritura administrativa conocida fuera de contrato, versión de origen no
reconocida, conflicto de inventario o indicios concretos de manipulación requiere
revisión: D, no importación por apariencia válida. Un esquema válido no demuestra
ausencia de manipulación administrativa. Antes de una migración real se debe fijar
qué poblaciones/versiones de origen se admiten; su cobertura productiva no está
determinada por esta inspección. No inventar un historial de despliegues.

## 3. Inventario de evidencia

Fuerte significa autoridad para la dimensión indicada, no para todas las demás.
U=modificable por usuario sujeto a Rules; A=administrador puede eludir Rules en todas.

| Fuente | Demuestra / fuerza | No demuestra | Frescura y control |
|---|---|---|---|
| Plan.ownerId | Ownership histórico y actual en estado válido; fuerte | Binding, sharing, instancia activa | Inmutable por cliente; CREATE propio; A |
| Plan.memberIds | Miembros consolidados actualmente registrados; fuerte bajo §2 | Binding actual, cycle histórico, sharing | JOIN/salida propios; snapshot tras freeze; A |
| Plan.inviteeIds | Participantes no-owner invitados, incluidos aceptados | JOIN por sí solo | Emisión por editor, salida propia; U/A |
| Plan.invitedBy | Atribución histórica de invitación | JOIN, cycle, amistad/issuer vigente | Ausencia legacy admitida; entrada nueva controlada; A |
| Plan.careerId | Identidad académica elegida para ese plan | Trayectoria personal de cada UID | Inmutable cliente; mapping exacto requerido |
| closed/deleting | Cierre/intención irreversible de borrado en flujo legacy | Salida individual | Owner controla según Rules; releer tras freeze |
| createdAt/updatedAt | Fecha del documento/última mutación | Fecha u orden de JOIN individual | Server timestamps; updatedAt cambia también por rename |
| friendships/{id} | Estado social registrado | Membership, binding, sharing | Directa/inversa, puede cambiar; U bajo protocolo |
| planningSharing/U | Consentimiento propio validado; fuente fuerte de trayectoria según contrato | Membership ni consentimiento para otra instancia | U; validar alcance/versión y evidencia congelada |
| planningSnapshots/U/careers/K | Datos derivados, corroboración | Trayectoria o membership por sí solos | Puede estar stale; sourceUpdatedAt no es log de JOIN; U restringido |
| users/U/careers/K | Progreso privado; fuerte de trayectoria | Membership ni vigencia de amistad | U privado; validar ID/schema y copia protegida |
| users/U/careerProjections/K | Proyección privada; fuerte de trayectoria | JOIN ni progreso real aprobado | U privado; no convertir simulaciones en progreso |
| users/U.activeCareerId | Elección propia válida; fuerte de trayectoria vacía | Binding automático/autorización C | Mutable, puede cambiar tras JOIN; usar inventario legítimo |
| socialProfiles/U.careerId | Presentación contextual | Trayectoria suficiente o membership | Puede diferir por cambio de selección; derivado/U |
| users/U/activityInbox/* | Historia de avisos | JOIN/autoridad/cycle importable | Avisos borrables/readAt propio; invitación no equivale a aceptación |
| Plan/subjects/* | Propuestas/atribución histórica | JOIN de destinatarios: pueden incluir pendientes | Editores proponen; no son registro de aceptación |
| jointPlanTombstones/P | ID eliminado/reservado; veto fuerte a resurrección | Identidad de antiguos miembros | Inmutable cliente; no contiene roster |
| migrationUsers/U, manifiestos/índice de instancias | Procedencia/copia y resolución ya validadas | JOIN del plan por sí solos | Protegidos, no cliente; verificar generación/fase y conflictos |
| careerInstances propias | Identidad/binding existente y lifecycle actual | Membership del plan | Validar owner/catalog/índice; archive puede cambiar |

No se encontró un ledger legacy autoritativo de todos los JOIN/salidas. Ausencia
de Activity no invalida memberIds; ausencia del padre no prueba ausencia de hijos.
Refs C no son evidencia legacy de JOIN. Datos de caché no sustituyen lectura congelada.

## 4. Siete dimensiones y cinco resultados

Registrar separadamente historia social, membership estructural, occupancy, binding,
operatividad, friendship y sharing. Ni siquiera A autoriza sharing.

| Resultado | Criterio normativo |
|---|---|
| A CURRENT C MEMBER IMPORTABLE | Membership actual probada, plan elegible, catálogo exacto, binding único legítimo y control instances/complete válido; elegible para importación protegida, no ya importado |
| B HISTORICAL MEMBER ONLY | Membership demostrada en un plan cerrado/en eliminación o estado histórico autoritativo, sin promover a plan C actual |
| C PENDING LEGACY INVITATION | Plan válido registra UID no-owner en inviteeIds y no en memberIds; evidencia histórica pendiente, jamás actionable C |
| D UNRESOLVED / INSUFFICIENT EVIDENCE | Corrupción/conflicto/procedencia insuficiente o membership probada pero binding/catálogo/control sin resolución; conservar subdimensiones probadas |
| E NOT A MEMBER | Inventario válido no registra owner/member/pending ni otra prueba autoritativa de membership histórica para esa relación |

E significa sin membership acreditada por el inventario, **no prueba de que nunca
participó**. Activity/subject solos no elevan E a B; se conservan como referencias
históricas no concluyentes. Fuente ausente/incompleta impide usar E como certeza:
clasificar D si se está intentando resolver una relación referenciada no verificable.

Orden: validar procedencia/integridad; aplicar veto tombstone/deleting; identificar
rol (owner, joined no-owner, pending, ausente); aplicar cierre; resolver catálogo,
binding y control para miembros de plan abierto. Errores no se convierten en ausencia.
La clasificación de miembro no cambia por amistad o sharing actual.

## 5. Owner, memberIds y significado de JOIN

ownerId válido basta para preservar ownership; owner en memberIds es obligatorio,
no prueba de que ejecutó JOIN: su membresía nace en CREATE. Para no-owner, pertenecer
a memberIds en origen válido basta para preservar la afirmación estructural de JOIN
consolidado bajo contrato legacy. No exigir aceptación actual ni friendship retroactiva.

**memberIds no basta aislado para construir C**: requiere padre íntegro, procedencia,
estado elegible, capacidad, binding y publicación protegida. Su fuerza estructural
no se degrada por faltar trayectoria. En ese caso D conserva explícitamente
`legacyStructuralMembership=confirmed`, no lo presenta como nunca miembro.

Owner sin binding: D, publication bloqueada. Ownership se conserva; no se sustituye
owner ni se crea instancia por ownership. No publicar C con owner académico unresolved.

## 6. Trayectoria y resolución de binding

No cambia la tabla de trayectoria v1.16: progreso privado, proyección privada,
activeCareerId válido y consentimiento propio validado son fuentes fuertes cuando
corresponde. Una fuente fuerte puede justificar la resolución por el migrador de
trayectorias existente; no autoriza a este clasificador a fabricar una instancia.

Para A debe existir una resolución única validada: UID, careerInstanceId, catálogo
exacto, índice/manifiesto coherentes y control instances/complete. Fuente fuerte
todavía sin instancia validada → D `trajectory-resolution-pending` hasta completar
ese protocolo, no una nueva regla de creación. Instancia archivada sigue siendo
binding histórico resuelto; operatividad=false. Restore no reactiva sharing.
Si hay varias instancias candidatas legítimas y no existe mapping inequívoco, D;
no elegir la activa/seleccionada por conveniencia.

| Evidencia además de memberIds válido en plan abierto | Resultado de trayectoria/binding |
|---|---|
| Fuente fuerte compatible cualquiera | Resolvable por contrato existente; A solo tras resolución validada |
| Solo socialProfile compatible | Insuficiente: D, membership estructural preservada |
| Solo snapshot compatible | Insuficiente: D, membership estructural preservada |
| Progreso privado compatible | Fuerte; mismo requisito de resolución validada |
| Proyección privada compatible | Fuerte aun sin progreso; mismo requisito |
| activeCareerId válido compatible | Fuerte para trayectoria incluso vacía; mismo requisito |
| Consentimiento propio validado compatible | Fuerte bajo alcance ya aprobado; mismo requisito |

Cambio de activeCareerId a otra carrera no borra trayectoria privada anterior.
Consentimiento OFF no se transforma en ON por importar un miembro.

## 7. Occupancy y límite explícito de C

Política: preparar occupancy importada solo para A. Necesita membership estructural
demostrada, mapping protegido de origen, binding único y asignación estable de slot;
owner conserva su representación propia, sin ocupar uno de los cuatro slots.

El prototipo C vigente identifica occupancy de invitado con la O aceptada en JOIN.
**No tiene todavía constructor de occupancy importada sin O/cycle.** Por tanto A
es clasificación de elegibilidad, no permiso para escribir hoy un slot member.
Se requiere posteriormente un origen importado protegido, identidad estable propia
y validación equivalente de actor/target/edges; no inventar O, cycle o JOIN.
El schema y coste de esa extensión no se declaran aprobados/probados aquí.

Miembro demostrado sin binding: opción conservadora D con estructura legacy
confirmada, occupancy C no materializada. No degradar automáticamente a B ni crear
un slot current con null binding: C no soporta esa variante. El plan puede copiarse
staged pero no publicarse omitiendo silenciosamente a ese miembro.

## 8. Pending, invitedBy, friendship y sharing

Pending legacy es C, también si es amigo actual o tiene trayectoria perfecta.
No occupancy ni O actual. Requiere NEW C genuino bajo cycle vigente, emisor válido,
Activity y discovery atómicos. invitedBy solo atribuye invitación histórica; ausencia
admitida puede mostrarse con convención legacy de owner, pero no certifica issuer C.

Friendship no prueba membership. Un joined confirmado conserva estructura aunque
ya no sea amigo. No atribuirle cycle inexistente; futuras invitaciones/reinvite
requieren contrato C. Membership, binding, sharing y amistad siguen independientes.

Snapshots pueden corroborar coherencia de una fuente fuerte, nunca sustituirla.
Subjects corroboran propuestas, no aceptación; Activity corrobora notificación,
no JOIN. Ni múltiples fuentes débiles sumadas alcanzan autoridad. No scores.

## 9. Señales negativas y precedencia

Tombstone: no resucitar plan bajo otro ID. Con padre coexistente → conflicto D y
bloqueo global; con padre ausente → no inventariar roster desde hijos. Historia ya
demostrada por fuente autoritativa preservada puede ser B, sin crear C operativo.
Deleting válido → B para owner/joined, conservar intención de borrado; no migrar
a activo. Closed válido → B para owner/joined, solo historia en origen, sin crear
representación C actual ni reabrirlo. Pending sigue C histórico/no actionable en
planes cerrados/deleting; no es miembro B por haber recibido invitación.

Precedencia: estado autoritativo íntegro y veto de eliminación; luego contrato de
membership; luego resolución privada de trayectoria; fuentes derivadas solo contexto.
No votar entre documentos. socialProfile o snapshot de otra carrera no contradicen
JOIN confirmado ni progreso compatible. Conflicto de índices/owner/catalog privado
sí bloquea resolución. Sin trayectoria no implica salida del plan.

Catálogo desconocido o mapping no exacto: D para miembros abiertos,
`catalog-unavailable`, historia/estructura preservadas, no C operacional. Carrera
aparentemente borrada exige inventario de instancias/manifiestos y fuentes admitidas;
no adivinar ni recrearla por referencia social. Plan inexistente con hijos → D,
no reconstrucción automática del padre.

## 10. Capacidad, duplicados y corrupción

Owner+4 participantes máximos incluidos pendientes: es también invariante legacy
v1.15. Más participantes → D/bloqueo de publicación, no elegir primeros cuatro.
No importa que algunos pendientes no se importen: una fuente fuera de contrato
no se vuelve confiable truncándola.

Normales: owner presente una vez en memberIds; joined no-owner presente en ambos
arrays; pending solo en inviteeIds. Esos solapamientos NO son duplicados.
Owner en inviteeIds, owner ausente de memberIds, member no-owner fuera de inviteeIds,
UIDs repetidos dentro del mismo array, tipos inválidos o arrays malformados → D.
No deduplicar para hacerlos válidos. Se permite ordenar una copia solo para hashes
canónicos/reportes sin cambiar fuente ni semántica; comparar sets tras validar unicidad.

invitedBy ausente/mapa parcial legacy conocido es admisible. Entrada explícita
malformada, clave fuera de inviteeIds o schema desconocido → D/revisión, no sustituir
por owner para sanear. Inviter histórico que ya salió no es corrupción por sí mismo:
su atribución no confiere permiso actual. Missing deleting se interpreta false solo
por el default legacy documentado; no rellenar campos obligatorios faltantes.

## 11. Matriz central

“Elegible” significa A condicionado a importación/publicación futura protegida.
En todas las filas **cycle no se fabrica** y **sharing no se concede por migración**.

| Combinación | Historia | Estructura actual demostrada | Occupancy C | Binding | Cycle | Sharing | Resultado/acción |
|---|---|---|---|---|---|---|---|
| Owner íntegro abierto + resolución válida | Ownership | Sí, owner | Propia elegible | Resuelto | Ninguno importado | Independiente | A |
| Joined íntegro abierto + resolución válida | JOIN | Sí | Importada elegible | Resuelto | Ninguno importado | Independiente | A |
| Igual, sin amistad actual | JOIN | Sí | Igual | Resuelto | No inventado | Independiente | A; no reinvitación forzada |
| Igual, instancia archivada | JOIN | Sí | Elegible no operativa | Resuelto archivado | No inventado | OFF por lifecycle | A; no bloquear otros por archive |
| memberIds + fuente fuerte sin resolución | JOIN | Sí legacy | No materializar | Pendiente | No inventado | Sin cambio | D; resolver trayectoria |
| memberIds + solo profile/snapshot | JOIN | Sí legacy | No | Insuficiente | No inventado | Sin cambio | D; no elevar derivados |
| memberIds + catálogo desconocido | JOIN | Sí legacy | No | Catalog-unavailable | No inventado | Sin cambio | D; bloquea publicación |
| Pending + amistad + trayectoria | Invitación, no JOIN | No | No | No necesario aquí | Solo NEW futuro | Independiente | C; reinvitar genuinamente |
| Friendship/sharing sin pertenencia | No prueba JOIN | No | No | Puede existir aparte | No importa membresía | Independiente | E en inventario completo |
| Solo subject/Activity/profile | Referencia contextual | No | No | No inferido | No | No inferido | E o D si origen no verificable |
| Closed/deleting válido + joined | Confirmada | No importable actual | No | Puede conservarse histórico | No | Sin reactivación | B; preservar origen |
| Tombstone + padre coexistente | En disputa | No certificar | No | No promover | No | No promover | D; conflicto global |
| Arrays corruptos/sobrecupo | No certificar | No certificar | No | No promover | No | No promover | D; no normalizar autoridad |

## 12. Publication y fallos

Bloquean publicación: owner unresolved, un joined sin binding/prueba suficiente,
catálogo desconocido, capacidad/corrupción, conflicto de manifiesto/índice, authority
no instances/complete para participante a importar, constructor de importación
todavía no aprobado/probado. Conservar datos/staging no implica abortar y borrar.

Todos los pendientes sin resolver **no bloquean por ser pendientes**: se preservan
como C, sin crear slots pending ficticios. Si todos los no-owner son pendientes y
owner cumple A, puede prepararse plan C con slots vacíos según CREATE C, sujeto a
gates de publicación. Si “todos los invitees unresolved” incluye un joined D,
sí bloquea. Un A puede estar resuelto individualmente mientras el plan no se publica.

Closed/deleting/tombstone no se publican activos. Una fuente B histórica no exige
resolver binding para preservar historia. El bloqueo de un joined D evita quitarle
continuidad silenciosamente, coherente con transición aceptada; no exige que todos
los miembros estén operativos o compartan datos.

## 13. Manifest, determinismo e idempotencia

Por relación: sourcePlanId, uid, rol legacy, versión de contrato, generation,
identificador del inventario congelado/huella, paths y versiones de evidencia usada,
dimensiones confirmadas, clasificación A–E, careerInstanceId si resuelto, reasonCode
acotado, decisión occupancy (no materializar/elegible/reservada tras protocolo),
targetPlanId reservado, checkpoint y timestamps administrativos.

No copiar progreso/proyección/emails ni payload de consentimiento al manifiesto
si bastan referencias y huellas. Protegerlo de otros participantes. El plan publicado
solo contiene resultados estructurales mínimos autorizados, nunca razonamiento privado.

Misma evidencia congelada + versión de política + generación → mismo resultado.
Rerun verifica y no promueve B/D a A por datos vivos cambiantes. Nueva evidencia
requiere revisión explícita del inventario antes de publicación, nueva revisión
protegida y revalidación de dependencias; preservar revisión anterior. No descongelar
JOIN legacy para recolectarla. Lifecycle/authority actuales se revalidan al publicar
para impedir autoridad stale: no se confunde esa guardia con reclasificar historia.

IDs de destino/occupancy aprobada se reservan una vez; no crear cycles, O o avisos
por rerun. Ninguna clasificación por sí sola publica ni activa el plan.

## 14. Privacidad y frontera UX

Herramienta administrativa futura puede leer evidencia necesaria bajo autorización
separada. No exponerla a compañeros. Estados mínimos: migrated/current, historical,
unresolved, requires reinvitation. A previo a publicación no se muestra como ya activo.
Razón ajena genérica; no revelar ausencia de progreso, estado de consentimiento,
authority o archivo privado. Operatividad ajena continúa no verificada según E.

## 15. Security review

| Ataque | Mitigación |
|---|---|
| Fabricar miembro con JSON/array suelto | Fuente servidor congelada, integridad/procedencia y rol; constructor importado protegido |
| Owner fabrica binding | Resolver por UID/índice/manifiesto privado, no por rol de owner |
| Escalar snapshot/socialProfile | Fuentes derivadas nunca suficientes, tampoco sumadas |
| Escalar Activity/Subjects | No evidencian JOIN; no generan occupancy |
| Escalar friendship/sharing | Dimensiones independientes; pending sigue pending |
| Adivinar catálogo | Mapping exacto o D |
| Truncar capacidad | Blocker, sin elegir participantes |
| Normalizar corrupción | No deduplicar/rellenar para crear autoridad |
| Reutilizar ciclo para importación | Ningún ciclo inventado; origen importado explícito pendiente de prototipo |
| Resucitar borrado/cierre | Veto de publicación activa, conservar historia |
| Publicar después de cambio de authority | Revalidación de controles protegidos, no solo snapshot antiguo |

## 16. Recomendación y validación posterior

A. memberIds demuestra JOIN consolidado no-owner dentro de fuente legacy íntegra
y confiable; owner adquiere membresía en CREATE, no JOIN.
B. Basta para reconocer estructura legacy persistente; no basta solo para C.
C. Occupancy importable requiere ese reconocimiento, binding resuelto, identidad
reservada y constructor protegido sin ciclo ficticio, aún no implementado.
D. Binding requiere resolución legítima única usando evidencia fuerte ya congelada.
E. Membership probada sin binding → D con estructura confirmada, no B arbitrario.
F. Un joined D bloquea publicación del plan, no preservación incremental; pending
histórico no bloquea por sí solo. G. Closed/deleting válidos preservan miembros como B.

No quedan umbrales heurísticos ni decisión de producto que pueda elevar autoridad.
La política de evidencia queda lista para revisión; representación/constructor de
importación y su presupuesto necesitan prototipo futuro antes de integrar.

Tests Node puros propuestos: tabla A–E completa, owner/overlaps legítimos, todas
fuentes fuertes/débiles, closed/deleting/tombstone, arrays corruptos, sobrecupo,
catálogo desconocido, múltiples bindings, archive, amistad retirada, orden canónico,
misma evidencia/misma clasificación, revisión explícita y ninguna promoción por rerun.

Emulator posterior: v1.15 permite solo auto-JOIN y no inserción por owner/tercero;
freeze bloquea JOIN concurrente; cliente no escribe manifiesto/importación; membro
importado probado sin amistad/cycle ficticio funciona; pending no JOIN; NEW requiere
cycle actual; staging denegado; publicación valida bindings/authority; refs/Activity/
edges no autorizan; replay/idempotencia y coste real de constructor/importación.
Una fixture administrativa prueba la transición con evidencia certificada, no que
una población productiva satisface esa evidencia. No ejecutar estos experimentos ahora.

Compatibilidad: nuevo P, legacy congelado, pending requiere NEW, joined importado
sin ciclo ficticio, future invites con cycle actual, histórico/unresolved sin JOIN C.
Retention/delete permanece separado. Protected new-account bootstrap sigue RELEASE
BLOCKER. No GO de integración/release ni avance a Etapa 7.

Solo documento de diseño; sin tests, build, Emulator ni acceso remoto. STOP para revisión.

HISTORICAL MEMBERSHIP EVIDENCE DECISION READY
