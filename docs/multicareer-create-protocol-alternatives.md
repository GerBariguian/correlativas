# Etapa 6 — CREATE v2: diseño y prototipo aislado A–E

## 1. Estado recuperado y frontera de esta fase

Base HEAD: `96de41a`. Se preservó el working tree acumulado: integración de
saveJointSubject, cuatro fallos funcionales de create, baseline, prototipo anterior
y matriz de expresiones. No se adoptó ninguna refactorización anterior.

Se retomaron los archivos parciales `joint-create-distributed.cjs`,
`joint-create-distributed.test.cjs` y el flag opt-in de `scripts/test-rules.cjs`.
El intento previo sólo había fallado al iniciar Java por EPERM del sandbox.
Esta fase usa únicamente fixtures, tests y documentación; no modifica Rules,
servicios, UI, schema, migrador o gates del producto.

SHA-256 de firestore.rules preservado:
`64e9275713f108ebb93320ec591d5b663edb5da80c9268534d71df32a54659a1`.

Problema confirmado nuevamente: create actual acepta uno/dos invitados y rechaza
tres/cuatro por límite de expresiones. Directa/inversa/mixta no cambia la frontera.
Los cuatro FAIL funcionales originales NO fueron convertidos en éxitos ni borrados.

## 2. Invariantes atómicas y responsabilidades separables

El nacimiento del plan, cada invitación declarada y su Activity obligatoria deben
permanecer en el mismo commit para conservar exactamente la semántica actual.
Owner, authority, instancia activa, catálogo, amistad y sobre válido deben cumplirse
al evaluar ese commit. Un aviso histórico nunca reemplaza estas verificaciones.

Lo separable es **la ubicación del predicado dentro de los permisos del mismo
commit**, no el momento de las escrituras. Una validación del binding pendiente
puede ser responsabilidad del permiso del aviso, si el padre obliga a CREAR ese
aviso preciso en el mismo commit y éste referencia el estado posterior del padre.
No se certifica un dato para uso futuro: se exige la conjunción de permisos ahora.

## 3. Alternativa E: responsabilidades exactas

No hay nuevo schema ni documentos auxiliares:

- `jointPlans/{planId}` conserva schemaVersion 2, catalogId, ownerId, inviteeIds,
  memberIds, participants, name, invitedBy, closed, deleting, createdAt, updatedAt.
- `users/{inviteeUid}/activityInbox/jp_{planId}` conserva el notice actual:
  schemaVersion, type, actorUid, createdAt, target, readAt.
- Owner binding sigue siendo `{careerInstanceId: instanciaPropia, bindingState: resolved}`.
- Cada invitee sigue siendo `{careerInstanceId: null, bindingState: unresolved}`.

Permiso del padre conserva sin cambios: schema completo, unicidad, límite cuatro,
owner fuera de invitees, members exactamente owner, conjunto exacto de claves de
participants/invitedBy, binding/instancia activa del owner y catálogo, tombstone,
campos iniciales y todos los `validInvitee`/`invitationRequired` existentes.

Se trasladan únicamente las cuatro llamadas a `pendingBindingAt`. El permiso de
cada notice comprueba, para un plan v2 NUEVO, `getAfter(plan).participants[uid]`:
claves exactas careerInstanceId/bindingState, instancia null y estado unresolved.
`uid` proviene de la ruta real del inbox, no de un índice o UID arbitrario del payload.
La comprobación se añade a schema/actor/target/tiempo/transición/authority/amistad
ya exigidos por Activity. No introduce ninguna consulta adicional de documentos:
reutiliza el plan posterior y la existencia previa ya consultados por la transición.

El guard `(schema != 2 || exists(planBefore) || validCreationRecipient(after))`
limita el nuevo predicado al create v2. Legacy y transiciones sobre un padre que
ya existía conservan sus condiciones. Esto no implementa invite/join v2 futuros.

## 4. Demostración plan ↔ invitee ↔ binding ↔ notice

Sea I el conjunto de inviteeIds:

1. El padre exige lista única de uno a cuatro UID válidos, excluyendo owner.
2. Las claves de participants son exactamente I unión owner. No admite binding
   sobrante ni faltante, alias por índice ni claves alternativas.
3. Por cada u de I, el padre exige el documento `users/u/activityInbox/jp_planId`
   inexistente antes y presente después, con tipo/actor/target/tiempo correctos.
4. Por la ausencia previa, esto necesariamente pasa por el permiso CREATE del
   notice. Un update de readAt, aviso antiguo o certificado persistente no sirve.
5. Ese permiso exige `uid in after.inviteeIds`, ID canónico del aviso, actor de
   invitedBy, transición real, autoridad y amistad. Para padre nuevo, valida el
   binding exacto `after.participants[uid]`.
6. Por atomicidad, el commit sólo se acepta si todos los permisos anteriores se
   aceptan. Un aviso extra no satisface la ruta de un aviso faltante; si no está
   invitado o usa ID alternativo, su propio permiso también lo rechaza.

Así, todo binding pendiente que antes comprobaba el padre queda comprobado por
el aviso requerido de ese UID, exactamente sin dejar slots sin cubrir. A la
inversa, un create que cumplía todos los predicados anteriores cumple la nueva
comprobación, pues lee el mismo binding del mismo estado posterior.

El orden de inviteeIds no da autoridad: se probaron reordenamientos válidos e
inválidos en el último slot. Copiar/intercambiar dos objetos idénticos
`{careerInstanceId:null,bindingState:unresolved}` no cambia dato ni identidad y
es válido; esos objetos NO representan una carrera ajena. Punteros a otro binding,
campos de otro plan o intercambio del binding resolved del owner se rechazan.

Un ID canónico admite un único documento de aviso: no pueden existir dos documentos
con la misma ruta. Se rechaza intentar un segundo aviso en otra ruta. No se agrega
una obligación nueva de distinguir dos serializaciones idénticas del mismo objeto.

## 5. Protocolo, operatividad y estados

1. Cliente prepara localmente un ID estable y el intento completo.
2. Envía un batch: padre + n notices (2–5 escrituras).
3. Firestore valida todos los permisos y publica todo o nada.

Estados de creación persistidos: **ausente → constituido**. No draft, manifest,
activation, revision de creación, child ni estado intermedio. Los campos que
pretenden saltar fases (`creationState`, `creationRevision`) son schema inválido.

La operatividad conserva las reglas existentes: plan constituido abierto/no deleting,
miembro autorizado, authority/instancia/binding actuales para operación académica.
Owner es el único member inicial. Invitee unresolved no puede guardar proposals,
convertirse en sharing ni leer statusMap ajeno por tener Activity. Join v2 definitivo
sigue pendiente fuera de este prototipo; no se concede membership por notificación.

Reads, navegación Activity, close, delete y legacy no reciben un nuevo estado que
interpretar. No existe un plan parcial que la UI deba ocultar como medida de seguridad.
La API cliente debe esperar éxito o reconciliar un resultado incierto antes de mostrar
creación exitosa; eso no reemplaza la garantía de Rules.

## 6. Recovery, idempotencia, concurrencia y lifecycle

- Fallo antes del commit/rechazo: no persiste ni plan ni notices. No hay construcción
  abandonada, timeout de draft ni cleanup adicional. Retry completo del mismo ID pasa
  si ahora todas las precondiciones son válidas; se probó tras omitir un notice.
- Respuesta perdida después del éxito: leer padre por ID estable, verificar que es
  el mismo intento (owner/catálogo/participantes/bindings y demás decisiones de
  creación) y confirmar sin reescribir. El test verifica read-confirm sin mutación;
  no se implementó todavía este cliente productivo.
- Replay crudo del batch exitoso es DENY. No reinicia timestamps/readAt ni regenera
  un aviso borrado por su destinatario. Activity no es certificado de autorización.
- Dos tabs con el mismo ID: exactamente un ganador y un estado completo. Dos IDs
  diferentes son dos planes distintos; no se inventa deduplicación global de intención.
- Cross-plan: avisos de p no constituyen q; q exige sus propios notices.
- Archive/freeze antes del commit se verifica en el estado real al escribir, no
  en lo que recordaba la UI. Restore legítimo permite un nuevo create, no reabre
  planes cerrados ni reactiva sharing. Se mantienen los controles ya existentes.
- Invitado legacy pending sigue siendo socialmente invitable; su binding queda
  unresolved. Legacy no es autoridad suficiente para el actor creador de un plan v2.
  Frozen/blocked/invalid de actor o destinatario rechazan la creación.

No hay modificación de consentimientos, compatibilidad, carrera seleccionada,
progreso, catálogo ni datos académicos cruzados. No se crean careerInstances.

## 7. Expression budget y document access budget

La fixture E acepta owner + 1/2/3/4 en directa, inversa y mixta. Ningún permiso del
commit válido fue rechazado por expresiones o access calls. No hay contador exacto
de expresiones ni se afirma holgura de X expresiones. Los mensajes de límite en
casos inválidos siguen siendo posibles durante la búsqueda de otros allow; una
denegación no demuestra por sí sola qué predicado se agotó primero.

Cuenta estática del peor caso inverso, distinguiendo conceptos:

| Permiso | Consultas en el camino válido |
|---|---|
| Padre | instancia owner 1 + tombstone 1 + cuatro notices antes/después 8 = 10 |
| Cada notice | plan posterior y previo, controles actor/recipient y ambas amistades: 6 pares ruta/estado distintos; hasta 8 invocaciones sintácticas por exists/get repetidos |
| Traslado del pending binding | 0 documentos nuevos; lectura del mapa ya obtenido |

No se suma 10 + 4×6 como si fuera el contador efectivo del batch. Hay recursos y
consultas repetidos/caché. El conjunto de rutas distintas en el peor caso tiene
20: plan 1 + notices 4 + controles 5 + amistades 8 + instancia 1 + tombstone 1.
Antes/después no se presentan como una sola versión arbitrariamente: hay 25
pares ruta/estado en la enumeración completa, y el contador efectivo no se expone.

La evidencia adicional es una **calibración real del mismo Emulator**: una escritura
con diez documentos distintos pasa y once falla; un batch de tres escrituras con
7+7+6 documentos disjuntos pasa y 7+7+7 falla. Por tanto el máximo E pasó con los
límites individual y agregado activos, no sólo en un entorno sin ese enforcement.
No se afirma margen agregado para agregar futuras validaciones o documentos.

Referencia oficial: límites de 10 por operación y 20 para batch, con llamadas
cacheadas que no se cuentan: [Firebase Rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions#access_call_limits).
Esto no es una prueba ejecutada contra producción ni sustituye revisar presupuestos
cuando se integre invite/join u otra modificación.

## 8. Comparación A–E

A–D se evaluaron como diseños, NO como implementaciones medidas. Los números de
writes son de las variantes conceptuales indicadas, no contratos ya adoptados.
E domina para este problema porque satisface el máximo sin nuevos recursos ni fases;
no hace falta afirmar que A–D sean imposibles para descartarlas en esta fase.

| Criterio | A: draft/activation | B: invitaciones hijas | C: manifest/revision | D: owner + invitaciones individuales | E: mismo commit distribuido |
|---|---|---|---|---|---|
| Seguridad | Todos los paths deben negar draft; revalidar precondiciones vivas al activar | Padre debe exigir conjunto exacto y children deben exigir padre | Debe ser testigo de transición, nunca credencial reutilizable | Cada invitación valida precondiciones vivas; owner operativo antes de completar intención | Mismos predicados distribuidos entre escrituras obligatorias |
| Atomicidad | Separa preparación de activación; avisos deben nacer con invitación válida | Puede ser un commit o fases, requiere decisión | Preferible mismo commit con revisión antes/después | Cada parent update + notice atómico, NO los cuatro juntos | Padre + todos los notices, un commit |
| Expressions | No medido; activación puede concentrar costo otra vez | No medido; distribuye por child | No medido; distribuye permisos | No medido; trabajo por invitación menor | 1–4 PASS, sin contador exacto |
| Access calls | No medido; frescura de authority/amistad más children puede superar presupuesto | Nuevos caminos por child; no medido | Nuevo manifest + comprobaciones cruzadas; no medido | No medido; menor fan-out por commit | Máximo PASS; límites 10/11 y 20/21 calibrados |
| Writes para 4 | Ejemplo draft + 4 parejas child/notice + seal = 10 | Parent + 4 children + 4 notices = 9 si single commit | Ejemplo parent + manifest + 4 notices = 6 | Owner create + 4 parejas parent update/notice = 9 | 5 |
| Intermedios | Sí: draft/prepared/active/abandoned | Ninguno si atómico; sí si por fases | Ninguno si atómico | Plan con 0,1,2,3 invitados antes de 4 | Ninguno |
| Rules | Alta: guards universales, activación, cleanup | Alta: conjunto exacto, spoof y vínculos extra | Alta: revisión/replay/frescura/cleanup | Media: create owner-only e invite v2 | Traslado acotado a notice de create v2 |
| Cliente | Orquestador y reanudación | Orquestación de children | Escritura y revisión adicional | Cola de invitaciones/recovery parcial | Mismo batch; cliente v2 sigue pendiente |
| Recovery | Reanudar/abandonar/limpiar draft | Reconciliar children si fases | Reconciliar testigo/source | Explicar éxito parcial y reintentar faltantes | Retry completo o read-confirm por ID |
| Idempotencia | Revisión y estados persistidos nuevos | IDs deterministas por invitee | Revisión monotónica vinculada al plan | Por invitación; no intención global atómica | ID estable, sin replay de avisos |
| UX | Estado construcción; posible aviso a plan aún no operativo | Sin cambio si atómico; UI pending si fases | Sin cambio si atómico | Cambio observable: plan usable aunque falten invitados | Sin cambio observable |
| Activity | Decidir cuándo hay invitación válida; nunca eventual | Child + notice mutuamente obligatorios | Avisos ligados a source, no sólo manifest | Invitación individual + notice | Mismo aviso obligatorio y canónico |
| Bindings | Owner real, pendientes; nunca autoridad certificada por draft | Pending de child debe cubrir cada UID | Manifest no puede certificar carrera del invitado | Owner bound, cada nuevo invitado unresolved | Owner en padre, pending en permiso de su notice |
| Lifecycle | Cambios entre fases requieren revalidación | No usar child histórico como autoridad | No usar revisión vieja como autorización | Cambios entre invitaciones dejan resultado parcial legítimo | Consulta actual en un commit |
| Migración | Nuevo estado/versionado y tratamiento de drafts | Nuevos paths/bindings e historia | Nuevos testigos y política de historia | Cambia contrato de creación vacía | Sin nueva migración/schema |
| Legacy | Separación explícita y guards nuevos | No exigir children a legacy | No exigir manifest a legacy | Legacy conserva create atómico viejo | Rama legacy preservada y probada |
| Riesgo principal | Draft filtrado o activación con credenciales obsoletas | Conjunto incompleto/extra y presupuesto adicional | Credencial persistente, stale/replay, contador reiniciado | Prometer cuatro cuando sólo se completaron algunos | Romper vínculo obligatorio notice/create en cambios futuros |

Si E no pasara, A–D requerirían otro diseño/autorización antes de adoptar schema,
fases o semántica observable. No se eligieron ni implementaron esos cambios.

## 9. Validación y ataques

Suite del prototipo compara **las mismas 53 mutaciones negativas** con Rules actuales
y E, cada una con uno y cuatro invitados (212 comprobaciones de rechazo). Comprueba
ausencia física del padre, notices intentados y writes extra tras cada rechazo.
La matriz positiva tiene 12 casos por variante: actual mantiene seis aceptaciones y
seis denegaciones por presupuesto; E acepta los doce. La reproducción funcional
original sigue roja y sin cambios fuera de esta suite diagnóstica.

Ataques: owner/actor/invitedBy, duplicados, extra/missing invitee, owner invitado,
binding faltante/extra/spoof, referencia a otro invitee/plan, intercambio con owner,
notice ausente/extra/duplicado en ruta alternativa/otro inbox/otro plan/otro actor,
compensación de faltante, timestamps/readAt/schema, amistad ausente/rechazada,
authority legacy/frozen/blocked/invalid, instancia ajena/archivada, catálogo distinto,
schema extra/faltante/tipo, members extra/duplicados, estados/revisiones inventados,
plan solo, notices solos, cero invitados, closed/deleting.

Además: cada uno de los cuatro slots inválido; permutaciones; retry sin parciales;
replay; notice eliminado no regenerable; dos tabs/un ganador; otro plan exige otros
avisos; aviso preexistente no sirve; Activity no concede proposals ni statusMap;
freeze/archive antes de commit y destinatario legacy sin trayectoria fabricada.

Resultados finales:

- Prototipo/comparación/recovery: **253/253 PASS** (incluye contenedores Node).
- Calibración access calls: **4/4 PASS**.
- Runner focalizado completo: **257/257 PASS**, cero omitidos/cancelados.
- Regresiones con fixture E y archivos históricos sin modificar: **261/261 PASS**:
  Firestore históricas 148, Activity 43, subjects integrados/servicios reales 70.
- Total de estas dos suites finales: **518 tests PASS**. No se suman ejecuciones
  exploratorias repetidas para inflar el total.

Las denegaciones con cuatro invitados en Rules actuales pueden quedar enmascaradas
por presupuesto; se repiten con uno. En E el control válido de cuatro sí pasa,
aportando también control de disponibilidad para esos ataques.
Los tests apoyan la prueba de composición anterior, no una prueba formal universal.

## 10. Archivos, riesgos y recomendación

Archivos de esta fase:

- `tests/rules/fixtures/joint-create-distributed.cjs`: transformación aislada.
- `tests/rules/joint-create-distributed.test.cjs`: comparación y ataques/recovery.
- `tests/rules/joint-create-access-probe.test.cjs`: límites calibrados.
- `tests/rules/fixtures/joint-create-distributed-register.cjs`: preloader opt-in de
  suites históricas con fixture; nunca configuración de aplicación/deploy.
- `scripts/test-rules.cjs`: flags aislados, mismos guards demo/loopback; default
  consolidado no adopta E ni cambia las cuatro reproducciones fallidas.
- Este documento.

Ningún campo, documento auxiliar, contrato observable o estado intermedio nuevo.
No se tocaron servicios/UI/Rules productivas ni se adelantó invite/join/sharing.
Las validaciones de saveJointSubject se mantienen intactas y pasan bajo la fixture.

Riesgos/deudas: no hay margen exacto de expresiones; futuras modificaciones deben
revalidar máximo fan-out y la composición de permisos. No relajar noticeRequired,
allow create ni la clave canónica del inbox sin reanalizar pending bindings.
El cliente v2 productivo y el resto de Etapa 6 siguen pendientes. El bootstrap
protegido continúa siendo RELEASE BLOCKER; esta fase no acredita release v1.16.

**GO técnico para proponer la integración de E, sujeto a revisión/autorización.**
No se integra en esta fase. Es el único candidato medido que conserva el contrato
completo y admite cuatro invitados sin nuevas fases/documentos. La aprobación no
es GO de Etapa 6 completa ni de release. Sin producción, publicación, migración real,
commit, push, deploy ni Etapa 7.
