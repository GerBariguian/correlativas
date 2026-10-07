# Joint Plan discovery references — prototipo aislado

2026-10-01. Continuación del working tree, sin reinicio ni integración. Diseño fuente:
[discovery D](joint-plan-discovery-decision.md). E — HYBRID sigue intacta.

## Estado inicial verificado

Existían fixture, suite y runner aislados. Aunque el pedido de reanudación indicaba
que aún no se habían ejecutado gates, `.tools/discovery-ref.log` registraba una ejecución
inicial de **1 test PASS**, 8.524 s. Se preservó ese log como antecedente, sin usarlo como
validación final: faltaban controles y padding. Los resultados actuales provienen de
la suite completa después de la última modificación.

## Fixture y schema

`tests/rules/fixtures/discovery-ref.cjs` compone el fixture aprobado `memberEdges()`,
que ya contiene C, release, cycles/Activity, authority, instancias y subjects locales.
Agrega el fragment experimental en memoria; no edita `firestore.rules`.

Path: `users/{U}/jointPlanRefs/{P}`. **Sólo `schemaVersion:1` y `createdAt` timestamp**.
P se deriva exclusivamente del path; se quitó el campo redundante planId según la
preferencia de esta continuación. No catalogId, ownerId, instance, membership, occupancy,
sharing ni operatividad. createdAt identifica creación de referencia, no vigencia.
Create exige request.time. Update y delete están denegados, incluso set idéntico.
Para NEW de un UID que vuelve, el cliente conserva la ref sin escribirla.

Get/list: autenticado y auth.uid==U, sin comprobación de carrera activa o amistad.
Escribir la ref requiere socialUser y transición canónica; no basta ser su destinatario.
Ninguna lectura de source utiliza la ref como condición positiva de autorización.

## Atomicidad recíproca

**CREATE:** parent exige ref exacta after del owner. Ref exige parent C nuevo (ausente
before), owner=U=actor y createdAt=request.time. Parent/4 slots conservan todas sus
Rules originales. Seis documentos confirmados: parent, cuatro slots y ref owner.
Plan sin ref y ref sin plan se rechazan; el batch sin ref no deja parent ni slot probado.

**NEW:** permiso CREATE de inviteeIndex exige ref válida after del U del índice.
Ref exige índice antes ausente/después presente apuntando al slot, slot antes empty y
después pending de U/inviter autenticado/time servidor, parent C. El permiso de slot,
occurrence y Activity deben pasar también; no se repiten sus permisos dentro de ref.
Eso no delega autoridad en una ref preexistente: todos los writes canónicos se evalúan.

Cinco writes del primer NEW: slot, índice, occurrence, Activity, ref. Omisiones de cada
pieza relevante rechazan y comprueban ausencia de ref/index/O/aviso y slot aún vacío.
Schema incorrecto, campo planId extra y timestamp cliente también se prueban dentro
del batch NEW completo, no sólo contra un parent ausente. No hay estados parciales.

REINVITE escribe tres documentos sin índice/ref; JOIN escribe sólo slot. Reingreso
después de release puede hacer NEW de cuatro writes con ref vieja intacta. No requiere
leer ref ajena para autorizar: la consulta interna de Rules no concede get al actor.
El servicio productivo de cómo distinguir primer NEW/reingreso no se implementa aquí.

## Resource gates y secuencia

- CREATE + owner ref: PASS.
- NEW #1, #2, #3, #4 secuenciales, owner/inversa: PASS. Cada recipient tiene ref/index/O;
  Activity contractual queda probada por el batch y las omisiones posteriores.
- No `maximum of 1000 expressions` ni `Service call error` en caminos válidos base.
- Owner y recipient listan y leen refs propias. Otro UID no puede get/list refs ajenas.
- Parent autorizado se lee desde el P descubierto, bajo permiso original C.
- Withdrawal C1, request/certificado/avisos C2 y accept reales del fixture → REINVITE Y
  PASS; ref comparada antes/después sin cambios. Reinvite con cycle viejo rechaza.
- JOIN X stale rechaza aun con ref; JOIN Y PASS sin modificar ref.
- Archive y restore mediante lifecycle real conservan ref listable e idéntica. Sharing
  sembrado OFF permanece OFF. Crear subject como miembro archivado falla y restaurado
  pasa: ref no decide operatividad. No se afirma probar aquí consentimiento ON→OFF;
  esa evidencia pertenece al prototipo Member Edge anterior.
- readAt y delete de Activity Y por recipient pasan; ref permanece idéntica.
- RELEASE propio deja ref residual listable, pero parent get, JOIN y lectura de Subject
  se deniegan para el released. Ref no recupera acceso. NEW del mismo UID con O nueva
  reutiliza ref inmutable y pasa sin escribirla.
- CLOSE owner cambia sólo parent; ref permanece. No fanout sobre referencias.

El test usa current source real de fixture, no booleanos operational copiados ni
selección. Owner/recipient tienen el mismo catálogo sintético: la independencia de
catálogos del listado se acredita estáticamente por auth.uid/path, no por una matriz
multicatálogo/paginada que no se ejecutó en este mínimo.

## Negativos y privacidad

Se rechazan ref aislada, inexistente/unrelated, bajo UID ajeno, legacy parent sin
schema C, schema/ref manipulada, campo extra planId, timestamp incorrecto, update/delete,
replay CREATE/NEW, omisiones atómicas, stale cycle/JOIN y acceso con ref residual.
Los payloads inválidos también se prueban en contexto NEW válido para no depender
solamente de la ausencia de source.

No se permite group/list global ni lectura ajena por inviter; no se añade esa query.
El permiso de own list depende del path U, no de resolver cada parent. Ref residual
puede recordar P pero no devuelve subjects/instancias/progreso/sharing ni owner/catalog.
No se usa como prueba de membership en JOIN ni en Subjects. No es una réplica de status.

Clasificación: A = rechazo sin síntoma de evaluación/recursos; B = Service/access;
C = exhaustion de expressions; D = evaluation/harness/other. Mensajes completos en
[evidencia](joint-plan-discovery-prototype-evidence.json). No se reclasifica evaluation
error como un rechazo lógico limpio por tener una condición falsa en el código.
Los tres rechazos B deliberados son padding; no garantías de seguridad por agotamiento.

## Concurrencia y replay

Dos NEW equivalentes con mismo pre-state/O: exactamente un éxito y un permission-denied.
No retry de aplicación. No se presenta una sola carrera como cobertura de todos los
interleavings. Replay CREATE y NEW rechazan; REINVITE no recrea ref. El protocolo no
requiere una transacción global entre recipients diferentes.

## Hot path y comparación de coste

| Operación | Antes C (evidencia previa) | Este prototipo | Nueva dependencia |
|---|---|---|---|
| CREATE | 5 writes PASS | 6 writes PASS | Parent→ref owner after; ref→parent before/after |
| NEW inicial | 4 writes PASS | 5 writes PASS #1..#4 | Índice→ref target after; ref→parent/índice/slot before/after |
| NEW con ref previa | 4 writes | 4 writes PASS al volver | Índice verifica ref target after, no write ref |
| REINVITE | 3 writes PASS | 3 writes PASS | Ninguna lectura/ref añadida a su proof |
| JOIN | 1 write PASS | 1 write PASS | Ninguna lectura/ref añadida |
| RELEASE/CLOSE/lifecycle | Protocolos previos | Ref sin cambios | Ninguna dependencia de ref |
| Subjects/edges | Participant-local | Código anterior conservado | No consulta refs |

`discoveryRef()` sólo se invoca desde CREATE parent, CREATE inviteeIndex y CREATE de
la propia ref. NEW #4 no enumera refs previas ni consulta owner ref para autorización.
Ref invitado comprueba rutas de ese U/S/P; no todos los participants. La familia de
rutas nuevas es acotada, pero get/getAfter y coste de ramas no se equiparan a contador
interno ni se deduce caching. No presupuestar futuras lecturas con estos resultados.

Los permisos originales C comprueban actor, control, instancia, amistad/cycle y demás
en los documentos correspondientes. La ref es una obligación adicional de completitud,
no una prueba sustitutiva ni un permiso académico.

## Padding acotado

Sólo después de todos los gates válidos/seguridad. Docs sintéticos distintos existentes
`discoveryPadding/pN` con ok=true; se agrega un get por escalón, sin quitar checks.
Cada intento prepara datos bajo Rules base y luego carga la variante padded.

| Camino | Punto de inyección | Último adicional PASS | Primero FAIL |
|---|---|---:|---:|
| CREATE + owner ref | Predicado CREATE parent antes de discoveryRef | 7 | 8 |
| NEW #1 + recipient ref | Predicado CREATE inviteeIndex antes de discoveryRef | 9 | 10 |
| NEW #4 + recipient ref | Mismo predicado, 3 NEW previos | 9 | 10 |

31 probes: 28 aceptados, 3 rechazados. Los tres errores literales incluyen
`Service call error. Function: [get]` sobre padding p7/p9, sin 1000 expressions.
Mensajes íntegros preservados, no sólo etiquetas. NEW #1 y #4 usan el mismo target
four y cycle para comparar; sólo cambia posición/ocupación previa de otros slots.

**No margen universal.** NEW C antiguo +7/+8 se inyectaba sobre UPDATE del slot,
no sobre CREATE del índice: no se puede restar ni concluir que agregar ref abarata NEW.
Este ensayo no separa todos los límites por write/agregado ni contabiliza caché.
CREATE sin ref no se repitió para calibrarlo. No hay medición non-owner/demás
orientaciones en este mínimo; deben considerarse en Expanded Review, no extrapolar.

## Completitud y límites

CREATE garantiza owner ref; NEW recipient ref; JOIN/REINVITE/archive/restore/close la
conservan. Ref inmutable impide que un cliente la elimine mientras sigue relacionado.
Actividad puede eliminarse y discovery permanece. Es evidencia de invariante de
transiciones probadas, no auditoría exhaustiva de datos históricos de producción.

No depende de activeCareerInstanceId, catálogo seleccionado, sharing o localStorage;
no implementa UI, paginación ni Android/iOS. Firestore impone el mismo protocolo por
cliente, pero no se ejecutaron SDKs móviles. Operatividad sigue E — HYBRID.
Retención/presentación tras release, legacy, cleanup y migración quedan separados.
Protected new-account bootstrap permanece RELEASE BLOCKER sin cambios.

## Archivos y validación

- `tests/rules/fixtures/discovery-ref.cjs`: fragment experimental/generador aislado.
- `tests/rules/discovery-ref.test.cjs`: suite ordenada y padding, reutiliza helpers C.
- `scripts/test-discovery-ref.cjs`: runner demo/loopback heredado, sin instalación.
- Este reporte y `docs/joint-plan-discovery-prototype-evidence.json`.

Logs/generado locales bajo `.tools/`, ignorados. Runner: `node scripts/test-discovery-ref.cjs`.
Sólo `demo-correlativas-rules`, Firestore 127.0.0.1:8088, runner aislado sin credenciales
de producción. No se ejecutan suites productivas/build innecesarios.
Sintaxis CJS, whitespace y git diff --check comprobados al cierre. Conteos exactos
de la última ejecución se registran en la sección siguiente.

Ningún archivo productivo modificado por esta fase. SHA256 firestore.rules permanece
`7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.
Working tree acumulado preservado. Sin producción/Console/migración/publicación,
deploy/git add/commit/push/Etapa7/bootstrap. No se hizo microoptimización de presupuestos.

## Conteos finales

Última suite completa: **1/1 test Node PASS**, 0 FAIL/cancelled/skipped; 58.410 s.
**20 gates positivos**, **29 negativos rechazados**, **1 carrera de dos NEW** (un
ganador y un permission-denied), **31 probes** (28 PASS, 3 Service/access esperados).
81 registros JSON: la carrera tiene un registro de outcomes además de su gate positivo.
Negativos funcionales: **5 A, 24 D-evaluation, 0 B, 0 C**. Padding: 3 B, 0 C.
Gates contienen operaciones compuestas y setup; no se presentan como 81 tests Node
ni como un conteo de todos los RPCs. No se suman ejecuciones preliminares a estos totales.

## Dictamen

Gates mínimos aprobados; no hay blocker observado dentro del alcance probado.
GO sólo para Expanded Review del prototipo, no integración ni release.

JOINT PLAN DISCOVERY REF PROTOTYPE PASSED — READY FOR EXPANDED REVIEW
