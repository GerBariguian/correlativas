# Joint Plan discovery — decisión arquitectónica

2026-10-01. DESIGN / SECURITY REVIEW ONLY. Recomendación, no implementación/adopción.

Fuentes locales: [Expanded Review](joint-plan-c-expanded-review.md), [operatividad E
aceptada](joint-plan-operability-privacy-decision.md), [C](slot-prototype-report.md),
[release](slot-expansion-report.md), [Member Edge](member-edge-report.md);
`tests/rules/fixtures/slot-prototype.fragment.rules`, `slot-expansion.cjs` y queries
existentes en `src/services/jointPlans.js:subscribeJointPlans`.

## 1. Recomendación y frontera

**D — source canónico del plan + pointer privado por usuario**, concretado como la
variante mínima de B. Path candidato: `users/{uid}/jointPlanRefs/{planId}`.

La ref identifica un plan C con el que ese usuario adquirió relación legítima; NO
afirma que la conserve ni que pueda operarlo. Payload propuesto mínimo: `{schemaVersion: 1,
planId: P, sourceKind: 'C'}`, exacto e inmutable. P también está en el path, ambos deben
coincidir. No contiene ownerId, catalogId, careerInstanceId, occurrence, estado, nombre,
updatedAt ni operatividad. Versión propuesta del pointer, no cambio del schema del plan.

Sólo U puede get/list su colección, sin exigir carrera seleccionada, sharing, amistad
o lifecycle activo. El creador del plan/actor invitador sólo puede crear la ref ajena
vinculada a la transición autorizada, no leer el listado ajeno. No create arbitrario
por el dueño del inbox, no update ni delete ordinario. Reutilizar una ref íntegra al
reingresar no concede permiso de reingreso: NEW/JOIN siguen probándose completos.

CREATE owner y NEW invitee deben garantizar ref válida after en el mismo commit de
adquisición. JOIN/REINVITE no cambian identidad de relación de discovery; no requieren
reescribir ref. RELEASE conserva pointer no autoritativo; CLOSE/archive/restore tampoco
lo borran ni actualizan. No se replica el estado del plan en cinco documentos.

**Técnicamente listo para diseñar un prototipo refutable, no GO de integración.**
La retención/presentación de referencias de usuarios released requiere decisión de
producto separable (§14); no se inventa plazo ni acceso histórico al contenido del plan.
No se reabren operatividad E ni los otros blockers de transición/cleanup/migración.

## 2. Qué es relevante y qué completitud se promete

| Relación | Discoverable | Actionable | Historical |
|---|---|---|---|
| Owner | Todos sus C, sin slot | Según Rules/contexto actual | Closed puede seguir visible |
| Pending | Todos, incluso aviso borrado o ciclo stale | JOIN sólo con O/cycle/contexto actuales | X antigua no se convierte en Y |
| Joined | Todos, aunque ya no exista amistad | Operaciones según C | Edges previos se clasifican aparte |
| Académicamente no operativo | Sí, no filtrar archive/frozen | No asumir operatividad; E sigue vigente | Membership no termina por lifecycle |
| Released | Pointer residual descubrible en candidato; política final pendiente | No por pointer | No equivale a permiso de leer parent/subjects |
| Closed | Sí para relaciones anteriores conservadas | Según matriz closed; no nuevas asignaciones | Sección closed si source puede leerse |
| Legacy | Camino de discovery legacy separado | No agregar permisos JOIN | Cobertura histórica según contrato legacy, no inventada |

Contrato técnico mínimo: **todo plan C vigente donde U sea owner/pending/joined tiene
una ref privada válida**. No se limita al catálogo activo ni a current slots: incluye
owner, todas las carreras, closed y referencias residuales de antiguas relaciones.

Completo no significa snapshot global atómico entre listado y todos los parents. Se
debe recorrer toda la colección por páginas, no sólo la primera; errores/caché no
se traducen en lista vacía. Con cambios concurrentes, listeners/reconciliación deben
converger al conjunto actual. No prometer fotografía única de múltiples lecturas cliente.
Una lista filtrada por catálogo para presentación no redefine el universo descubierto.

Prueba inductiva propuesta: CREATE establece ref owner; NEW establece ref target;
JOIN/REINVITE conservan U/P; operaciones ordinarias no borran refs; release/close no
invalidan esa existencia. La prueba sólo vale si todas las adquisiciones están protegidas,
no hay grants alternativos y los datos preexistentes tienen cobertura verificada.
Backfill/integración aún no probados; no afirmar exhaustividad productiva hoy.

## 3. Query model real de Firestore

Rules no filtra una consulta global: debe poder autorizar todos sus resultados
potenciales. Una igualdad UID en la query puede demostrar una condición correspondiente
en resource; un path privado `users/U/...` permite basar autorización en U==auth.uid.
Las collection-group queries requieren Rules v2 con match recursivo apropiado y alcance
de índice de grupo; abarcan todas las colecciones con ese ID, no sólo el path imaginado.
[Documentación oficial](https://firebase.google.com/docs/firestore/security/rules-query).

Una collection-group con `where('uid','==',U)` es viable conceptualmente si cada documento
permitido tiene UID inmutable/protegido y la regla del grupo exige auth.uid==resource.uid.
Eso NO prueba integridad de las escrituras ni autoriza leer su parent. Tampoco permite
filtrar un campo inexistente: inviteeIndex actual sólo tiene slotId, UID en nombre.
No suponer que documentId==UID aislado localiza ese nombre bajo cualquier parent.

Colecciones de grupo incluyen subcolecciones del mismo nombre en cualquier jerarquía;
se necesita namespace/schema consistente y permisos de escritura que no permitan
fabricar resultados. [Alcance de collection groups](https://firebase.google.com/docs/firestore/query-data/queries#collection-group-query).

Las consultas conceptuales siguientes usan U del usuario autenticado, no
`request.auth.uid` como expresión ejecutable del SDK. No se implementan ni ejecutan.

## 4. Alternativas y query shapes

### A. Array/campos queryables en parent

`query(collection(db,'jointPlans'), where('discoveryUids','array-contains',U))`;
owner puede incluirse o requerir query adicional `where('ownerId','==',U)`.
Parent Rules debe exigir esa relación y discriminator de schema adecuados.

Array current duplica estado de slots; NEW/RELEASE necesitan mantenerlo recíprocamente,
añadiendo parent write y contención. Si el array permite leer parent por sí solo,
un stale array mantiene acceso tras release: se transforma en segunda autoridad.
Si sólo sirve como hint, la query del parent entrega igualmente sus campos; no es un
pointer inocuo. Guardarlo histórico crece con antiguos usuarios y amplía exposición.
Cuatro slots limitan current, no historia acumulada. CLOSE no arregla stale arrays.
No recomendado: reintroduce sincronización/lectura de roster en parent. Array index
y posibles compuestos schema/orden, a verificar. Legacy actual usa ownerId/inviteeIds,
pero no se extrapola ese modelo a C.

### B. Índice user-scoped con estado replicado

`query(collection(db,'users',U,'jointPlanRefs'), orderBy(documentId()), limit(N))`.
Con hints pending/joined/closed habría que actualizar en JOIN/CLOSE/RELEASE y prevenir
que una clasificación vieja o query filtrada oculte planes. Copiar catálogo/owner/nombre
también agrega disclosure y mantenimiento. Funciona sin backend sólo con atomicidad
recíproca y pruebas de presupuesto; no reparar eventualmente como garantía de completitud.
D recomienda este path pero elimina TODOS los hints mutables para evitar ese problema.

### C. Participant documents + collection group

`query(collectionGroup(db,'jointPlanDiscoveryRelations'), where('uid','==',U),
orderBy(documentId()), limit(N))` sobre colección dedicada conceptual. La regla de grupo
exige resource.uid==auth.uid, schema y escrituras protegidas. Podría incluir owner y
retener relaciones históricas; requiere nuevos docs/atomicidad similares a D, además de
campo UID consultable/índice de grupo. No autoriza parent por existir la relación.

Reutilizar memberEdges de subjects NO es completo: planes sin subjects o sin asignación
desaparecerían y la historia crece por código. Reutilizar inviteeIndex exige más schema/
query Rules, owner aparte y pierde release. No basta el get puntual existente.
Viable como diseño de índice nuevo, menos simple de aislar que path privado por usuario.

### D. Source C + pointer privado mínimo — recomendado

Query propia sin filtros de estado/catálogo/authority, con paginación §10. La regla de
lectura depende exclusivamente de U autenticado en path; no consulta cada parent para
autorizar la lista. Así un pointer stale no invalida toda la página ni abre un parent.
La ref es índice DERIVADO; la autorización de detalles sigue en parent/slots/edges.

Sin repair worker. La prevención atómica es obligatoria; una lista local eventual no
es sustituto. Se admite reconstrucción explícita de una ref propia si se conoce P y
se demuestra owner/current index↔slot por fuentes actuales, sólo como repair separado
futuro. Eso no permite detectar un P perdido desconocido: no resuelve por sí solo la
completitud de datos corruptos/preexistentes. Candidato mínimo no agrega ese repair API.

### E. Fixed slot query directa

Unión de `query(collectionGroup(db,'slots'), where('uid','==',U))` y query parent
`where('ownerId','==',U)` (más schema C donde corresponda). No requiere consultar cuatro
IDs diferentes: group incluye todos. UID actual permite pending/member y archive no
lo cambia. Rules actuales NO autorizan group/list: hay que diseñar regla de consulta,
índice y namespace exclusivo; no asumir permiso por existir get del propio slot.

Release vacía UID y reasignación reemplaza occupant: no descubre historia ni owner por
sí sola. Agregar occurrences group para historia exige otro permiso/índice, deduplica
muchas emisiones y sólo cubre partes de cada emisión, no un roster universal.
No elegida: combina varias fuentes de discovery y no cumple historia por sí sola.
No es insegura intrínsecamente; es insuficiente como mecanismo único solicitado.

### F. Activity o catálogo como discovery

Activity propia es útil para deep links pero borrable/paginada y no cubre owner;
catálogo/selección no identifica pertenencia y pierde otras carreras. Rechazadas como
fuente completa. No se propone backend ni indexador server-side.

## 5. Fuente canónica y writers de D

Parent es fuente de owner/catalog/closed; slot+índice actual de membership/occupancy;
occurrence de historia de invitación. Pointer sólo certifica que se indexó una relación
legítima en algún momento. No contiene ni reemplaza esas decisiones.

Crear ref ajena requiere pruebas protegidas de transición, no sólo `request.auth.uid`
igual a un campo aportado. Propuesta mínima de enlace:

- Ref owner: parent no existía before, existe after con owner U y contrato C; parent
  CREATE exige la ref exacta after. Parent conserva todo su proof de inicialización.
- Ref invitee: adquisición NEW de índice U/slot vacío→pending del mismo U, actor inviter
  autenticado, parent C, O/Activity protegidas por protocolo; la adquisición exige ref
  after. Ref compara before/after relevantes para no aceptar un pointer aislado.
- Si ref ya existe por relación anterior, NEW puede conservarla: comprobar schema/P
  exactos after. No exigir volver a crear ni permitir reset. El servicio puede emitir
  set idéntico con update permitido **sólo si after==before y shape exacto**, sin nuevos
  campos; esta opción evita que el invitador necesite lectura de la colección privada.
  No-op no certifica NEW; sus permisos siguen independientes. Debe ensayarse su coste.

Ubicación propuesta de garantía target: permiso CREATE de inviteeIndex, que necesariamente
participa en NEW/reassignment. Así no se agrega la lectura a JOIN/REINVITE ni a edges.
No se deja que el cliente elija omitir esa garantía. Colocar el enlace definitivamente
depende del prototipo, sin reducir ninguna comprobación existente si no cabe.

La ref no debe usarse en allow get/list del parent, NEW, JOIN o edge para probar
membership. Su exigencia en adquisición es una invariante de completitud, no autorización.

## 6. Atomicidad y costes afectados

| Operación | Writes C previos | Propuesta D | Mantenimiento |
|---|---:|---:|---|
| CREATE owner | 5 | 6 | Parent+4 slots+ref owner indivisibles |
| NEW primera relación | 4 | 5 | Slot/index/O/Activity+ref target indivisibles |
| NEW/reassignment con ref previa | 4 | 4 o 5 | Ref intacta after; set idéntico opcional cuenta como write |
| REINVITE | 3 | 3 | Mismo U/P, no copiar O en ref |
| JOIN | 1 | 1 | Ref persiste, no copiar status |
| RELEASE | 2 | 2 | Conserva ref residual; borra índice operacional, no ref |
| CLOSE | 1 | 1 | No replicar closed |
| Archive/restore / edge writes | Sin cambio por discovery | Sin cambio | Ninguna proyección de operatividad |

CREATE/NEW agregan getAfter/validación y permiso de ref con before/after; número exacto
de accesos/expressions NO medido. No considerar gratis el set idéntico ni cached una
ruta repetida. REINVITE/JOIN mantienen forma de write pero necesitan regresión con
nuevas ramas cargadas; no prometer budgets finales por falta de campo nuevo.

Márgenes históricos C owner/inversa: NEW +7/+8, REINVITE +6/+7, JOIN +3/+4 (PASS/FAIL).
Pertenecen a padding de slot de otro compuesto, no al nuevo batch. CREATE+ref carece
de margen medido. Member Edge owner +3/+4 y non-owner +2/+3 siguen acotados al fixture;
D no los consume por diseño, pero composición final igualmente debe probarlos.

Fanout: alta owner/NEW afecta sólo una ref. Copiar close a 5 refs sería fanout acotado
pero añade presupuesto; NO se propone. A lo largo de la historia puede haber MÁS de
5 usuarios con ref residual: actualizar todas en close sería fanout no acotado por
los cuatro slots. Nada requiere recorrer subjects ni todos los planes de un usuario.

## 7. Lifecycle de discovery

NEW confirma → pointer ya existe cuando la invitación es visible. REINVITE confirma
→ el mismo pointer resuelve slot/O nueva; no hay occurrence cacheada en ref que reviva X.
Pending no significa actionable: freshness de ciclo y demás condiciones se comprueban
en JOIN; un deep link X no se transforma automáticamente en aceptar Y.

JOIN no borra pointer ni exige amistad posterior para listar. Archive/frozen no borran
pointer; un miembro no operativo sigue descubriendo su relación. Restore no recrea
discovery ni reactiva sharing. E — HYBRID permanece intacta: no publicar operatividad.

CLOSE conserva refs; si get parent autorizado revela closed, se clasifica como cerrado.
No filtrar por closed en el índice mínimo ni eliminar antes de leer source. Activity
readAt/eliminación no afecta refs, membership o permisos. No crear tipos de Activity nuevos.

RELEASE deja ref residual, pero get parent puede denegarse. Mostrar “referencia sin
acceso actual/no verificable”, no afirmar release, borrado o archive por permission-denied.
El propietario de la ref ya conoce ese P por una relación legítima; no descubre nuevos
datos ni nuevas membresías. Una decisión posterior de historia/purga es distinta.

## 8. Stale refs, conflictos y reparación

| Caso | Riesgo | Conducta |
|---|---|---|
| A: ref existe, source ya no autoriza | UX residual; sería seguridad si permitiera parent | Detail fail closed, no borrar automáticamente ni ampliar permiso |
| B: source autoriza, ref falta | Completitud rota | Adquisiciones deben impedirlo; no reportar completo bajo corrupción conocida |
| C: hint distinto del source | No aplica a estado: ref no contiene hints | P/sourceKind incorrectos son corrupción/schema, no reinterpretar |
| D: duplicate | Duplicación de UI/forja | Path canónico U/P, payload P exacto; alternate ID rechazado |
| E: replay | Ref sola no debe fabricar relación | Creación exige transición real; set idéntico no cambia estado ni autoriza operación |
| F: cliente stale | Clasificación/acción obsoleta | Releer fuentes autorizadas; Rules prueba contexto actual; no refresh de permiso desde caché |

Sin backend, repair desde un P conocido puede ser seguro si se autoriza expresamente
con fuentes actuales; no se introduce ahora y no puede descubrir P desconocidos. Para
datos preexistentes, la garantía exige inventario/backfill controlado en otra fase o
mantener su mecanismo legacy. No declarar que polling/Activity repara exhaustivamente.
Source desaparecido no prueba quién borró ni qué pasó; retención no se decide por error.

## 9. Privacy y ataques de enumeración

Reads de refs: sólo authenticated U del path; sin list de `users`, sin group grant para
jointPlanRefs, sin lectores owner/inviter de refs ajenas. Cada ref entrega sólo un P
ya relacionado y tipo de contrato. No catálogo/owner/carrera privada para enumerar.

- PlanId adivinado: get source requiere permiso propio de C; no existe API “agregar
  favorito” que permita crear pointer y ganar ese permiso.
- UID adivinado: query/get de sus refs denegados. Queries globales/group no heredan el
  permiso de subcolección propia ni actúan como directorio.
- OwnerId/catalogId adivinados: D no ofrece búsqueda por ellos; no scan global para
  encontrar planes “compatibles”. Filtros UI sólo sobre datos propios autorizados.
- Manipular ref/sourceKind: shape/path y transición protegidos; nunca cambiar reader
  de legacy a C por preferencia del cliente.
- Membership/pointer no da subjects/progreso: pending puede descubrir parent, pero
  subjects/edges mantienen sus lectores propios; sharing conserva fórmula independiente.

No se promete eliminar información ya conocida: referencias históricas pueden recordar
existencia de P, pero no revelan su estado actual tras pérdida de acceso. Evitar enrich
automático desde datos que no son legibles. No ampliar lectura privada para clasificar.

## 10. Queries exactas conceptuales e índices

Recomendación D, cliente autenticado con UID U (pseudocódigo, NO implementación):

```js
query(collection(db, 'users', U, 'jointPlanRefs'),
  orderBy(documentId()), limit(50))
// siguientes páginas: misma query + startAfter(lastDocumentSnapshot)
getDoc(doc(db, 'jointPlans', P)) // por referencia recibida; permiso independiente
getDoc(doc(db, 'jointPlans', P, 'inviteeIndex', U)) // propio, si no owner
getDoc(doc(db, 'jointPlans', P, 'slots', S)) // S obtenido de índice propio
```

Regla conceptual de query: U==auth.uid y sesión autenticada, sin condición sobre estado
de cada parent. Puede imponer page limit coherente si se decide, no necesario para
autorizar ownership del path. Nunca query por activeCareerInstanceId/catalogId para el
universo completo. Índice de documento para orden por ID; no compuesto nuevo previsto
para esta forma. No se publica ninguno. Nuevos sort/filter requieren análisis aparte.

A: array index discoveryUids, potencial compuesto con schema/orden; C/E: índice de grupo
por UID (y compuesto si se agrega orden/filtro), match recursivo explícito; query owner
requiere ownerId y tipo/schema exclusivo. Ninguna está autorizada por Rules C actuales.
No usar get de documentos individuales como evidencia de permiso list/group.

## 11. Read flow, coste de lectura y multicarrera

1. Login: consultar colección privada user-level y recorrer todas las páginas. Si hay
   error, conservar diagnóstico de carga incompleta, no “no tenés planes”.
2. Resolver P conocidos por refs mediante gets autorizados con concurrencia acotada.
   No pedir cinco readers distintos ni recorrer subjects para construir listado.
3. Parent legible: owner se identifica allí; no-owner consulta índice propio/slot para
   distinguir pending/member. Detectar cambios entre lecturas; no snapshot coherente
   fingido. Hint de estado nunca habilita acción.
4. Clasificar abiertos/pending/closed según evidencia; sin acceso actual queda una
   referencia no verificable, no desaparece silenciosamente ni se ofrece detalle privado.
5. Cargar subjects/edges sólo al abrir detalle y si sus Rules lo permiten. E mantiene
   operatividad privada no verificada; cualquier write se autoriza por fuentes reales.

Coste lineal por página: refs + parent por P + índice/slot para no-owner cuando haga
falta. Es N+1 acotado/paginado aceptado por seguridad; no global scan ni cross-product
de usuarios/catálogos. Una denegación de un detalle no debe hacer fracasar toda la página.
No poner todos los P en una query permisiva para evitar esos gets. Optimizaciones de
resumen mutable volverían a introducir sincronización y no se adoptan aquí.

Todas las carreras/universidades participan del mismo conjunto U. Nombre/catalog
pueden presentarse tras lectura autorizada del source, no como condición de discovery.
Web/Android/iOS comparten los mismos paths y contrato. Caché/offline sirve como última
vista, no como autorización/completitud confirmada; distinguir pending local de commit
servidor. Paginación más cambios concurrentes exige refresh/listener, no lista local fija.

## 12. Coexistencia legacy (sólo discovery)

C usa refs propias. Legacy mantiene por ahora las dos queries actuales ownerId==U e
inviteeIds array-contains U según permisos vigentes, con separación inequívoca de contrato
antes de combinar resultados. Devolver descriptor `{P, contractKind}` y deduplicar por
identidad; jamás interpretar arrays legacy como slots C. Producto actual sin discriminator
explícito necesita una estrategia query/partition verificable en integración; no afirmar
que un filtro inventado incluya documentos con campos ausentes.

Las nuevas Rules de listado legacy deberán demostrar que C no entra por otra rama.
La unión de ambos canales es legítima para discovery, no dual-read académico permisivo
ni dual-write. Mapping de migración y backfill se resolverán en su blocker; no se crean
refs de legacy por inferencia ni se garantiza historia released que legacy no registra.
Este documento NO abre JOIN legacy ni resuelve rollout de friendship cycles.

## 13. Comparación

| Diseño | Completitud/privacy/aislamiento | Query viable | Writes/coste | Stale | Sin backend/multicarrera/mobile | Migración/complejidad |
|---|---|---|---|---|---|---|
| A parent array | Current si sincronizado; riesgo grants a stale U/historia | Sí con constraints equivalentes | Parent write en cambios, contención | Puede filtrar mal o revelar parent | Sí con protocolo; no selección | Reconstrucción roster; alta |
| B refs con hints | Completo si atómico; scope privado | Sí por path | JOIN/close/etc actualizan hints | Copia drift, riesgo filtrar planes | Sí con reciprocidad | Backfill y hints; media/alta |
| C group relations | Completo si incluye owner/history; UID protegido | Sí conceptualmente, nueva Rule grupo | Docs adicionales/enlaces | Debe resolver source | Sí, no backend | Namespace/grupo/backfill; media/alta |
| D refs mínimas | Completo current por invariante; privadas, no autoridad | Simple por path | +1 CREATE/NEW; más gets de detalle | Residual seguro, sin estado copiado | Sí, user-level y multiplataforma | Backfill futuro, protocolo medible; media |
| E slots+owner | Current, no historia released por sí sola | Nuevas Rules/índice grupo | Sin docs nuevos, dos canales | Slot reutilizado pierde historia | Sí para current | No completa contrato sola |
| F Activity/local/catalog | Incompleto | Queries posibles no arreglan cobertura | Variable | Borrado/caché pierde planes | Local no; Activity no exhaustiva | No recomendable |

## 14. Product input aislado

Pendiente explícito: tras RELEASE, ¿conservar una entrada histórica visible, permitir
ocultarla o retirarla, y durante cuánto tiempo? ¿Sólo recordar P o alguna información
histórica adicional? Esto no concede lectura del plan actual. No elegir retención
indefinida como política final ni inventar acceso histórico por conveniencia de UX.

El candidato técnico **no borra refs automáticamente**, como medida de conservación
hasta decidir esa política, no como plazo aprobado. El prototipo puede validar seguridad
de esa ref residual y completitud current sin resolver presentación o purga. Si se
exige historia completa después de purgar refs, hará falta un repositorio histórico
aprobado; no prometerlo usando Activity. Ocultar no debe borrar una ref necesaria si
la relación vuelve a ser current, ni perder descubrimiento de una nueva invitación.

Esta decisión de producto no bloquea recomendar D ni diseñar su prueba mínima. Sí
impide cerrar la experiencia released/retención de release final. Los otros blockers
permanecen abiertos, sin nueva resolución en este documento.

## 15. Prototipo mínimo para refutar D — NO ejecutado

Fixture aislado derivado del C aprobado, sin tocar producto. Antes de adopción:

1. CREATE+ref owner completo; parent/slots sin ref, ref sin parent, ref ajena, schema/P
   falso y alternate ID deben fallar. Owner query propia encuentra plan sin slots suyos.
2. NEW máximo contexto (4.º invitado), owner y non-owner, directa/inversa/mixta: cinco
   writes completos, omisión de cada mitad rechaza sin estado parcial. Pointer sólo no
   crea invitación. Primera ref y ref histórica existente con set idéntico.
3. Query user-scoped incluye varios catálogos, owners/pending/joined/closed; más de una
   página. Comparar con universo esperado construido por harness, sin usar Activity.
4. Borrar/leer avisos no pierde plan. REINVITE cambia O real, no pointer; X no acepta Y.
   JOIN conserva discovery. Withdrawal posterior no elimina discovery joined.
5. Archive/restore/frozen conservan refs; operatividad permanece privada/no verificada.
   Close mantiene discovery. RELEASE/reassign/same-UID-return conservan ref segura pero
   A1 no revive; tras release la ref no concede parent/subjects/write.
6. Cross-user get/list de refs, collection-group sin scope, UID/catalog/owner guessing,
   insert/update forjado, no-op alterado y delete parcial denegados. Sin exposición de
   instancias/progreso. Concurrent CREATE/NEW no duplica pointer ni genera refs huérfanas.
7. Sembrar ref stale en harness: source sigue negando. Sembrar source sin ref como
   corrupción: se reconoce pérdida de completitud, no se proclama reparación automática.
8. Revalidar NEW/REINVITE/JOIN y CREATE con todas las ramas cargadas, contando writes/
   calls/expressions reales. Padding acotado sólo tras positivos; nada de sumar márgenes
   antiguos. Regresión Member Edge hot path sin lectura de refs.
9. Probar la política de query con SDKs/Rules reales en Emulator e índices necesarios
   fuera del supuesto de que una query por docId local sirve como collection-group.

STOP si un camino contractual válido agota presupuesto, si omisión del pointer permite
adquisición, si pointer concede acceso, si listing expone ajenos o pierde un current.
No optimizar debilitando proof ni reducir cuatro invitados. Esta lista no autoriza
ejecutar el prototipo.

## 16. Cierre y verificaciones de esta sesión

Único archivo nuevo: `docs/joint-plan-discovery-decision.md`. Revisión de código/evidencia
local y documentación pública oficial; sin acceso a proyectos Firebase ni Console.
Sin Emulator, implementación, tests ejecutables de producto, modificación de Rules/
prototipos/servicios/UI, migración, publicación, deploy, commit/push, Etapa 7 o bootstrap.
Se verifica preservación de archivos previos, whitespace y git diff --check.

Recomendación técnica lista para revisión; coste adicional todavía no validado.
E — HYBRID sigue congelada. STOP antes de prototipar o integrar.

JOINT PLAN DISCOVERY DECISION READY
