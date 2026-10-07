# Etapa 6 — Prototipo aislado C: cuatro slots + índice UID

Ampliación posterior: ver `docs/slot-expansion-report.md`. La composición con subjects alcanzó un STOP en cardinalidad válida 4. El GO de este documento es evidencia histórica de factibilidad parcial, no autorización de integración.

Fecha: 2026-10-01. **GO PARA CONTINUAR PROTOTIPANDO C**, exclusivamente con el alcance y límites detallados aquí. NO GO de integración ni release. No se adopta arquitectura definitiva.

## 1. Modelo exacto y campos

Schema experimental 30. No producto, no migración. Paths:

- jointPlans/{P}: schemaVersion, ownerId, ownerInstanceId, catalogId, closed, deleting, createdAt. No roster, array de invitados, serial global ni maps de occurrences.
- jointPlans/{P}/slots/{S}: sólo slot1, slot2, slot3, slot4. Campos status (empty/pending/member), uid, revision, occurrence, cycle, invitedBy, binding, joinedOccurrence, updatedAt.
- jointPlans/{P}/inviteeIndex/{U}: sólo slotId. Create atómico en NEW; update/delete prohibidos en este gate.
- jointPlans/{P}/invitationOccurrences/{O}: slotId, uid, invitedBy, cycle, revision, createdAt. P y O provienen del path. Sólo create; update/delete prohibidos.
- users/{U}/activityInbox/sp_{P}_{O}: schemaVersion30, type SLOT_INVITATION, planId, occurrence, actorUid, cycle, createdAt, readAt. Es un sobre experimental; no modifica el servicio/contrato productivo de Activity.

P y O son IDs opacos alfanuméricos de 16–40 caracteres. El separador underscore no es parte de P/O, evitando ambigüedad del ID del aviso. O se reserva por documento immutable/no-delete, no por confiar en aleatoriedad o en timestamp. No hay orden global; revision local al slot avanza en cada activation. joinedOccurrence presenta evidencia explícita del O que se intenta aceptar: un payload viejo no se transforma silenciosamente en aceptación del actual.

Binding pendiente null; JOIN elige la instancia propia y pasa a member. Sin statusMap, sharing, selección como autorización ni binding ajeno fabricado.

No se implementa liberación/reasignación: un slot adquirido no cambia UID. Por ello NO se introduce occupancyGeneration todavía. Reinvite mismo U avanza revision/O/C sobre su ocupación actual. Una futura liberación para otro U requiere decisión y protocolo de generación/reserva; no deducirlo de este PASS.

## 2. Escrituras y prueba de seguridad local

| Operación | Escrituras atómicas |
| --- | --- |
| CREATE | Parent + cuatro slots empty: 5 |
| NEW | Slot + index U + occurrence X + Activity X: 4 |
| REINVITE | Slot + occurrence Y + Activity Y: 3; index intacto |
| JOIN | Slot: status, binding, joinedOccurrence, updatedAt: 1 |
| Friendship request C2 | Relación + certificado immutable + fr_C2: 3 |
| Friendship accept C2 | Relación + fa_C2: 2 |

CREATE exige exactamente slots vacíos iniciales y owner con authority válida e instancia activa/catalog correcto. Cada slot inicial sólo puede crearse junto al parent nuevo. No slot5, reset, delete o alta tardía de slots adicionales.

NEW/REINVITE: permiso del slot verifica parent abierto/no deleting, actor owner o miembro operativo (índice/slot propio), authority instances completa, instancia activa/catalog, diff local permitido, destinatario distinto de owner, correspondence de índice, revision+1, occurrence fresca, inviter y transición empty→pending o pending→pending mismo UID/inviter con cycle distinto. Binding no cambia. El slot exige occurrence nueva exacta en ese commit.

Occurrence verifica slot before/after apuntando a O nuevo, UID/inviter/cycle/revision coincidentes, authority del destinatario y friendship accepted actual invitedBy↔invitee (directa/inversa únicas), además de Activity nueva. Activity comprueba occurrence inexistente antes/presente después, actor/UID/cycle/P/O/tiempo exactos. Cada documento debe pasar su propio permiso; existencia de historia o Activity no concede permiso.

JOIN: plan abierto, slot pending de auth.uid, index al mismo slot, joinedOccurrence igual al pointer actual, occurrence de ese P/S/U/inviter/cycle, friendship vigente de ese inviter, authority del joiner e instancia propia activa/catalog. No acepta X después de Y ni Y tras withdrawal C2.

Capacity: los cuatro paths físicos más owner separado limitan ocupantes. Un quinto slot no tiene permiso de creación/update. UID único: slot exige index after con su S; index exige slot before empty y after pending con U. Dos slots del mismo U no pueden satisfacer el único índice after. Dos índices para un slot no pueden coincidir con el único UID after. Índice existente no puede reescribirse; slot ocupado no puede tomar otro UID. No contador, recorrido histórico ni conteo cliente.

## 3. Composición y reutilización

La fixture deriva de firestore.rules del working tree, aplica el protocolo canónico/certificados y friendship Activity existente mediante distributed-friend-activity.cjs, y reemplaza únicamente el bloque Joint Plans por el modelo C experimental. Conserva helpers/Rules reales de authority, careerInstances, privacidad y Activity; agrega permiso específico de sobre de slot. No carga constantes true ni deshabilita seguridad durante las operaciones de los gates.

Se reutilizan helpers del harness y fixture de authority/instancias. Admin del harness sólo prepara estado inicial o situaciones negativas (frozen/archived/closed); withdrawal/request/accept C2 se ejecutan autenticados por el protocolo real. La primera amistad C1 accepted se prepara con certificado; no se afirma haber creado fr_C1/fa_C1 por cliente en este gate.

El prototipo sólo invita destinatarios con control instances completo (slotAuthority); no acredita coexistencia de destinatarios legacy, migración, queries de navegación ni compatibilidad de envelopes productivos. El binding/authority de cada operación se comprueba sin selección. No se modifica src ni firestore.rules. Los subjects/subjectChecks y operaciones de eliminación de planes no están en el bloque experimental C: este GO no valida esos dominios.

## 4. Gates en orden y resultados

1. CREATE parent mínimo + cuatro slots vacíos: PASS.
2. NEW X sobre slot1: PASS, occurrence/Activity X.
3. Withdrawal C1 y request/certificado/fr_C2 + aceptación/fa_C2 reales: PASS.
4. REINVITE Y mismo UID/slot, nueva revision/O/C2: PASS sin exhaustion. Índice intacto; occurrence X y Activity X comparadas byte-semánticamente antes/después, intactas.
5. JOIN X rechazado; JOIN Y después de withdrawal C2 rechazado. Reproducción independiente limpia del flujo C1→C2→Y: JOIN Y PASS. No se revive C2 mediante admin.
6. Source↔Activity: omisiones de Activity/occurrence y Activity sola, actor/recipient/cycle/O incorrectos rechazan. Y sin Activity y reutilizando ID Activity X rechazan. X update/delete y pointer de vuelta a X rechazan.
7. NEW slots1–4 PASS en directa/inversa/mixta. Se comprueban cuatro UID y cuatro índices exactos.
8. Quinta ocupación slot5 rechaza sin exhaustion ni Service call error; permiso slotId es false.
9. UID one en slot1→slot2 y slot2→slot4 rechaza; índice original intacto y slot destino vacío.
10. Último cupo: cuatro carreras D/E por slot4 con tres slots ocupados, exactamente un commit aceptado por carrera. Ganador/índice coinciden; índice, occurrence y Activity del perdedor ausentes. Además una carrera mismo UID sobre slot1/slot2: exactamente un ganador, segundo slot vacío y un solo aviso. Perdedor permission-denied sin 1000/Service call error. Son batches con mismo pre-state capturado para forzar competencia, no validación de un servicio de retry productivo.
11. NEW y REINVITE por member one ya unido, para two en slot2: PASS. No existe amistad owner↔two en esa fixture. Friendship relevante one:two, withdrawal/request/accept nuevos reales; pointer final Y e inviter one comprobados. Este control no-owner usa orientación canónica one:two; no afirmar ambas orientaciones específicas de no-owner medidas.

No hubo exhaustion en ningún camino válido probado. No se amplió liberación/reuse para otro invitee.

## 5. Negativos y calidad del rechazo

35 controles clasificados explícitamente, todos permission-denied sin 1000 expressions ni Service call error. Tres mensajes sin evaluation error (incluyen mutate/delete X y slot5); 32 contienen evaluation error junto con denegación. Se separan de rechazos puramente booleanos: no atribuir a cada helper una causa exacta sólo por ese mensaje. Hay condiciones falsas explícitas que aseguran los invariantes (slotId, index update/delete prohibidos, matching UID/S), pero el compuesto también evalúa otras ramas.

Corpus: invalid/fifth slot; spoof uid/invitedBy; friendship pending/withdrawn; wrong/stale cycle; occurrence/Activity de otro UID/P; index mismatch/noIndex/noSlot; wrong pointer; mutar/borrar X; replay de Activity X; missing/wrong Activity; source ausente; actor/recipient/cycle/O incorrectos; frozen actor/recipient; instancia actor archived o catalog incorrecto; plan closed; JOIN stale X, binding inválido y JOIN después de withdrawal C2. Dos rechazos iniciales de JOIN del gate5 usan assertFails y se repiten clasificados en el corpus final.

Las cinco carreras anteriores son adicionales a los 35 controles: se comprueban códigos y ausencia de exhaustion y de estados parciales. No son prueba estadística ilimitada ni una matriz de todas las carreras (close/archive/withdrawal concurrentes quedan futuras).

## 6. Expressions y access calls

Después de gates válidos se midió padding de lecturas distintas existentes en la condición UPDATE del slot, sin quitar checks. Sólo actor owner, orientación inversa, estados mínimos respectivos:

| Operación | Último padding extra aceptado | Primero rechazado |
| --- | --- | --- |
| NEW | +7 | +8 |
| REINVITE | +6 | +7 |
| JOIN | +3 | +4 |

Los tres primeros rechazos muestran Service call error, sin 1000 expressions. La única diferencia de cada escalón es añadir get a un documento slotPadding/pN sembrado con ok=true. Se mide umbral del compuesto para esa inyección; no deducir número exacto de llamadas base, desglose 10/20, comportamiento universal de caché ni margen portable a no-owner, orientación distinta o integración productiva. NEW/REINVITE/JOIN sin padding pasaron nuevamente como control0.

Formas de lectura: slot consulta parent/contexto operativo actor, índice target, occurrence nueva y su ausencia previa; occurrence consulta slot before/after, authority recipient, ambas orientaciones friendship y aviso before/after; index consulta slot before/after; Activity consulta occurrence before/after. JOIN suma occurrence current, index, authority/instancia joiner y friendship. No lee cadena de occurrences X ni lista de certificados históricos. Más barato en expresiones no implica margen universal de access calls.

No-owner válido pasó sin padding; su margen NO medido. No se sumaron probes a Rules productivas.

## 7. Conteos exactos de última validación

- Suite gates: 1 test Node PASS, 0 FAIL; contiene 11 gates numerados y un gate corpus, 35 negativos clasificados, 4 carreras último cupo y 1 carrera duplicate UID, más aserciones de cada flujo. No reportar esos controles internos como tests Node independientes.
- Suite padding: 3 tests Node PASS, 0 FAIL. 9 intentos NEW (0..8), 8 REINVITE (0..7), 5 JOIN (0..4): 22 probes, 19 escrituras aceptadas/3 rechazos esperados. No son paths base fallidos.
- Total de ambas suites finales: 4 tests Node PASS/0 FAIL. No se suman ejecuciones incrementales anteriores. Logs ignorados .tools/slot-prototype-final.log y .tools/slot-padding.log.
- Sintaxis, git diff --check y whitespace de archivos nuevos revisados. No Node global/build/Emulator histórico consolidado: no se cambiaron código/product Rules y no se afirma cierre de Etapa6.

Runner principal node scripts/test-slot-prototype.cjs; padding node scripts/test-slot-padding.cjs. Ambos usan demo-correlativas-rules y loopback8088 vía runner aislado, sin credenciales productivas. Emulator cerrado al terminar.

## 8. Archivos y fronteras

Nuevos únicamente:

- tests/rules/fixtures/slot-prototype.cjs
- tests/rules/fixtures/slot-prototype.fragment.rules
- tests/rules/slot-prototype.test.cjs
- tests/rules/slot-padding.test.cjs
- scripts/test-slot-prototype.cjs
- scripts/test-slot-padding.cjs
- docs/slot-prototype-report.md

Todo el working tree previo preservado. SHA256 firestore.rules inalterado: 7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b. No servicios/UI/migración, producción, Console, publicación, deploy, commit, push o Etapa7.

## 9. Decisiones abiertas y dictamen

Liberar/reasignar un slot para otro UID permanece fuera del gate; requiere generación/historia/índice y política explícitas. Faltan navegación/listados, privacidad de historia tras retirada, eliminación/drain del plan, convivencia legacy, índices, subjects/subjectCheck y contrato productivo definitivo de occurrence/Activity. Se mantienen closed/deleting en parent; su mutación productiva no se implementa. No-owner sólo un sentido canónico probado; margen no-owner, casos de catálogo unavailable y matrices de carreras más amplias pendientes. ReadAt/historia de friendship Activity conserva Rules existentes pero no se reejecutó toda su suite en este gate.

C ha superado el caso que refutaba el modelo anterior y los gates mínimos de capacidad/unicidad sin recurrir a historia global. **GO PARA CONTINUAR PROTOTIPANDO C**, no GO de integración, no arquitectura definitiva. No declarar Etapa6 completa. Protected new-account bootstrap permanece RELEASE BLOCKER separado de v1.16. STOP para revisión antes de más trabajo.
