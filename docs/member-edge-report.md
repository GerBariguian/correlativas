# B — Subject member edge por UID y ocupación

Prototipo aislado, cierre 2026-10-01. No autoriza integración. Continúa el diseño de
`joint-subjects-structural-decision.md`; no sustituye ni reejecuta B+C descartado.

## Alcance y evidencia previa

Se preservaron fixture, fragment, runner y gates previos. Se extendió la suite
existente con lifecycle, identidades obsoletas, privacidad, concurrencia y padding.
Base vacía y estados 0, 1, 2, 3, 4 y 5 relaciones pasan. Cada relación es una
escritura independiente: éxito parcial es un resultado permitido, no corrupción.
No se exige atomicidad global de cinco participantes.

La primera extensión encontró un error de harness: `actorRef: undefined` rechazado
por el SDK como `invalid-argument`. Se envió una referencia estructuralmente válida
pero ajena para comprobar el rechazo de Rules. No se cambiaron expectativas ni Rules.
También se reforzó A1→A2 usando un edge inexistente: un rechazo de un duplicado
existente no bastaba para aislar la comprobación de ocupación.

## Identidad y fuentes de verdad

| Dato | Fuente del prototipo |
|---|---|
| Identidad de materia | `jointPlans/{planId}/subjects/{code}`, base inmutable schema 31 |
| Catálogo/owner/cierre | parent schema 30; ownerInstanceId fijo |
| Membresía y ocupación actual | slot del plan: uid, status, occurrence, joinedOccurrence, revision, binding |
| Instancia/lifecycle/catálogo | `users/{uid}/careerInstances/{instanceId}` actual |
| Authority | `migrationUsers/{uid}` válido, instances/complete |
| Relación | `subjects/{code}/memberEdges/{uid}:{occurrence}` |
| Estado/revisión de relación | state assigned/unassigned y revision del propio edge |

La invitación NEW crea atómicamente slot, índice del UID, occurrence inmutable y
Activity según C. El invitador propone un identificador opaco; las Rules ligan
identidad, revisión, destinatario y slot, impiden reuso y exigen JOIN antes de
operar. El cliente no certifica su propia operatividad. La referencia del edge
contiene slotId, instanceId, occurrence y slotRevision, todos cotejados con las
fuentes actuales. El índice es un lookup, no otra autoridad independiente.

Release vacía el slot e incrementa revisión y elimina índice atómicamente. B1 y
A2 requieren nuevas occurrences. A1 sigue persistido pero no coincide con el slot
actual. Un retorno del mismo UID no basta para revivirlo. El owner utiliza la
referencia fija `owner/ownerInstanceId/owner/0`; no ocupa uno de los cuatro slots.
No se prototipa transferencia de owner ni recreación del parent.

## Lifecycle, referencias y mutaciones

- Archive real de instancia con consentimiento previo ON: revoca sharing, conserva
  slot y edge; nueva asignación al archivado falla y otro miembro puede operar.
- Restore de la misma instancia pasa y conserva sharing OFF exactamente. No fanout.
- Frozen del control, administrado sólo por el harness, bloquea actor y target.
  Reponer control legítimo permite operar sin reescribir edges.
- A1→B1→A2: asignaciones nuevas con A1 fallan sobre base vacía; B1 y A2 pasan.
  Se conserva A1; incluso reactivar su edge desasignado falla.
- Rechazos: slot incorrecto/inexistente/de otro UID/de otro plan, occurrence vieja
  o de otro plan, binding/instancia/catalog incorrectos, UID/actor manipulados.
- Unassign modifica sólo un edge con revisión siguiente e identidad inmutable.
  Requiere actor actualmente operativo y plan abierto; no exige que el target
  histórico siga activo. Quitar A1 después de A2 pasa y no toca A2. Replay,
  revisión vieja, actor ajeno y manipulación de referencia fallan.
- Cerrar parent pasa sin modificar edges; assignment y unassign posteriores fallan.
  No se implementa reopen ni cleanup global.
- ID canónico impide duplicados alternativos; revisión local y transición de estado
  impiden replay. Cliente sin el contrato de revisión falla. Base no es autorización:
  actor ajeno no puede crearla ni fabricar relaciones.

## Concurrencia

Cinco carreras registradas, dos intentos por carrera: duplicate de edge, reactivar
contra unassign obsoleto, crear base, release contra assignment y archive contra
assignment. Las primeras tres tienen un único ganador. Release/archive deben
completar; assignment puede ganar antes de la invalidación y quedar histórico.
Se comprueba rechazo posterior a la invalidación y nueva ocupación válida después
de release. No se interpreta una escritura anterior como acceso posterior válido.

Además, dos assignments a targets distintos del mismo subject pasan ambos, sin
revisión global. Son muestras concretas de concurrencia, no una prueba exhaustiva
de todos los interleavings. Frozen se probó secuencialmente; la carrera significativa
de invalidación usa archive por cliente y release por cliente.

## Privacidad y read model

Owner y miembros joined con authority instances válida pueden listar bases/edges
de un plan no deleting. Pending, released, outsider y anónimo no obtienen ese acceso.
El lector joined archivado no pierde la lectura histórica por lifecycle; la operación
académica sí exige instancia activa. Frozen no satisface edgeReader.

Membership/edges no otorgan acceso a progreso privado (`academic/progress`), statusMap
legacy, metadata de otra instancia ni snapshot sin consentimiento. Se prueban esas
lecturas cross-user. Sharing no participa de la autorización de assignment.
Los edges revelan identificadores de relación/instancia y atribución a lectores del
plan, no contenido de progreso; no equivalen a compartir el historial académico.

Read model conceptual, sin UI: listar subjects del plan; listar memberEdges de un
subject; obtener relación puntual por ID canónico; separar `state` persistido de
operatividad actual cotejando slots/lifecycle/authority por canales autorizados.
No asumir que `assigned` histórico es current. No habilitar lectura privada para
resolverlo: una API/proyección pública mínima de operatividad es revisión futura.
Queries filtradas por uid/state podrían requerir índices según su combinación y
orden. No se crearon índices ni se acreditó su existencia remota.

## Hot path, subjectCheck y presupuesto

Auditoría del fragment y helpers transitivos: assignment consulta parent, base,
authority e instancia del actor; slot del actor si no es owner; y authority, slot
e instancia del target cuando es otra persona. Actor==target reutiliza la referencia
validada. No consulta otros edges, Activity, amistad, occurrences históricas, índice
de UID ni un roster creciente. La lectura de edges sí usa índice+slot para el lector.

Para owner→miembro son siete rutas externas distintas; non-owner→otro miembro,
ocho. Es conteo estático de rutas, no una traza garantizada del contador interno.
Los accesos a resource/request son locales. Assignment #5 no lee #1–#4.

No hay subjectCheck global ni companion. Sus garantías se distribuyen así:
identidad estricta de base/edge; atribución autenticada y request.time; revisión CAS
local; sources actuales para cada actor/target; unicidad por ID; transición legal
en la misma escritura. Se abandona intencionalmente la atomicidad global del roster
según la decisión de producto; no se afirma preservarla con otro nombre.

Padding acotado realizado sólo después de todos los gates válidos, agregando gets
de documentos sintéticos diferentes en edgeWrite, con misma pareja actor/target:

| Camino | Último adicional PASS | Primero rechazado |
|---|---:|---:|
| Assignment #1 owner→four | 3 | 4 |
| Assignment #5 owner→four | 3 | 4 |
| Non-owner one→four (#5) | 2 | 3 |

14 probes: 11 permitidos y 3 rechazados. Los tres rechazos muestran literalmente
`Service call error. Function: [getAfter]` sobre la instancia de four. Mensajes
completos, sin truncar, en `member-edge-evidence.json`. No exhaustion de expressions.
No extrapolar a margen universal, caching, batches ni futuras condiciones agregadas.

Los caminos válidos de restore, B1, A2, owner y non-owner pasan sin `Service call
error` ni `maximum of 1000 expressions`. No se mide un número exacto de expressions.
Los negativos con `evaluation error` se clasifican D-evaluation, aunque su contexto
incluya una condición falsa; no se los presenta como rechazo lógico limpio ni como
budget. La evidencia JSON distingue A, B, C y D. Ningún negativo funcional agotó
access calls o expressions; sólo el padding deliberado alcanzó access ceiling.

## Schema, límites y revisión posterior

Parent 30 y base/edge 31 son marcadores experimentales. Base no permite update/delete;
el edge conserva identidad y sólo cambia estado/revisión/atribución de actualización.
Legacy y migración NO implementados; no hay coexistencia productiva acreditada.
No desplegar este fixture como Rules completas. Historia significa edge de ocupación
anterior conservado; no un ledger de cada transición del mismo edge.

Pendientes para expanded review: coexistencia/migración legacy, lectura operativa
sin exposición privada, cleanup protegido, integración del protocolo completo y
matrices ampliadas/concurrencia repetida. No hay GO de integración ni de release.
Protected new-account bootstrap sigue como release blocker separado e intacto.

## Validación y archivos

Comando: `node scripts/test-member-edge.cjs`, demo project local con runner aislado.
Una prueba Node orquesta gates ordenados (no confundir gates internos con tests Node).
Última ejecución: **1/1 test PASS**, 0 fallos/cancelados/skipped, 18.450 s aproximadamente.
86 registros: **24 gates PASS**, **43 negativos rechazados**, **5 carreras** de dos
intentos, **14 probes de padding**. Un gate contiene dos assignments independientes:
son 92 intentos focalizados contabilizados, excluyendo lecturas/assertions y escrituras
de setup. Negativos: **6 A**, **37 D-evaluation**, **0 B**, **0 C**. Padding:
11 PASS y 3 rechazos B esperados. Mensajes literales y resultados de carreras en el JSON.
No se ejecutó suite productiva ni build innecesarios para este fixture aislado.

Archivos del prototipo: `tests/rules/fixtures/member-edge.cjs`,
`tests/rules/fixtures/member-edge.fragment.rules`, `tests/rules/member-edge.test.cjs`,
`scripts/test-member-edge.cjs`, este informe y `docs/member-edge-evidence.json`.
En esta continuación sólo se editó la suite y se crearon los dos documentos;
fixture, fragment y runner anteriores se conservaron. Logs/generado permanecen
ignorados bajo `.tools/`. Sintaxis y whitespace comprobados por separado.

Rules productivas conservan SHA256
`7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.
El diff productivo acumulado preexistente no fue descartado ni integrado por esta fase.
Sin producción, Console, deploy, publicación, migración real, git add/commit/push,
UI, servicios productivos, Etapa 7 ni bootstrap.

SUBJECT MEMBER EDGE PROTOTYPE PASSED — READY FOR EXPANDED REVIEW
