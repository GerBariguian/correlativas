# Disección de segunda invitación — diagnóstico aislado

## Mapa previo a variantes

Parent: socialUser → instancePlan → validInstancePlanShape (schema, capacidad <=4, unicidad, owner/member, claves de participants/invitedBy/cycles/occurrences) → inviteInstanceMember (selección por occurrence == serial) → invitationFor (openMember, authority, instancia activa/catalog/binding, diff permitido, un único occurrence cambiado, serial +1, nuevo invitee exacto o reinvite) → versionedNoticeRequired (source→Activity: ID exacto nuevo y existsAfter).

Activity: socialUser/activityCreationEnabled → validVersionedInvitation (schema y actor, timestamp/readAt, target/cycle/occurrence/ID, matching parent, authority actor/receptor, amistad actual/cycle, binding pendiente, transición serial/occurrence: Activity→source).

Ramas alternativas cargadas: cierre/retiro, JOIN, legacy, Activity legacy y friendship Activity. No son equivalentes a autorización de invitación.

Estrategia: separar primero parent/Activity por sustitución constante DIAGNOSTIC ONLY; después subdividir sólo donde el resultado lo justifique. Mantener baseline esperando éxito. Preparación siempre con Rules completas, CREATE y primera invitación reales antes de cargar la variante.

## Resultados y clasificación final

DIAGNÓSTICO A para esta transición/fixture directa: las familias lógicas satisfacen la transición; el compuesto excede el límite al evaluar el despacho por segunda posición. No se propone refactor ni arquitectura. No se demuestra un número exacto de expresiones ni que toda redundancia esté localizada.

| Variante DIAGNOSTIC ONLY | Sustitución/control | Escritura 1→2 |
| --- | --- | --- |
| baseline | Ninguna | FAIL 1000 |
| activity-true | validVersionedInvitation=true | FAIL 1000 |
| parent-true | shape y transición=true | PASS |
| shape-true | validInstancePlanShape=true | PASS |
| transition-true | inviteInstanceMember=true | PASS |
| dispatch-fixed | llamada invitationFor('two'), sin buscar posición | PASS |
| notice-true | versionedNoticeRequired=true | PASS |
| authority-true | proposalAuthority=true | PASS |
| binding-true | operationalBinding=true | PASS |
| shape-first-half | conserva schema/serial/cycles/occurrences/catalog/owner/invitees; omite segunda mitad | PASS |
| shape-second-half | conserva memberIds/participants/invitedBy/name/flags/timestamps; omite primera mitad | PASS |
| no-history | Rules completas; elimina sólo Activity 1 con harness | FAIL 1000 |
| dispatch-identity | selector original; invitationFor sustituido por uid=='two' | PASS |
| new-first | Rules completas; únicamente after.inviteeIds=['two','one'] en vez de ['one','two'] | PASS |

Las variantes de sustitución no autorizan ningún cambio de producto. new-first cambia un detalle del payload sólo como control de posición: no se incorpora al servicio. Todas las preparaciones ejecutan CREATE y primera invitación bajo Rules completas; se recarga después la variante sin borrar datos. Ningún FAIL lógico sin exhaustion fue observado.

## Lógica individual y localización

Con shape-true pasan la transición original, su selector, authority, instancia/catalog/binding, serial/occurrence y source→Activity, además de la Activity completa. Con transition-true pasa todo el schema real del parent y toda la Activity. Con dispatch-fixed pasan simultáneamente schema, invitationFor y Activity completos. dispatch-identity demuestra que el selector original produce exactamente two, no otro uid. Estas evidencias complementarias permiten descartar un requisito lógico incumplido en la invitación examinada; no son prueba universal de seguridad.

| Familia | Estado lógico en invitation 2 |
| --- | --- |
| Selección del nuevo uid | PASS: dispatch-identity |
| Serial 1→2, occurrence two=2, único occurrence cambiado | PASS: shape-true/dispatch-fixed |
| Invitees pre/post y nuevo destinatario exacto | PASS: invitationFor completo |
| Capacidad, unicidad, schema, claves/miembros/owner | PASS: transition-true/dispatch-fixed |
| Open/member/invitedBy | PASS: invitationFor completo |
| Authority, instancia activa, catalog, binding del actor | PASS: invitationFor completo |
| Friendship vigente y cycle correspondiente | PASS: Activity completa |
| Binding pendiente del destinatario | PASS: Activity completa |
| Aviso obligatorio exacto/nuevo | PASS: source→Activity completo con dispatch-fixed |
| Activity exacta y matching con transición | PASS: Activity completa con parent-true y demás controles |

0→1 toma ids[0]. 1→2 con ['one','two'] evalúa primero occurrences[one]==2 (false), luego occurrences[two]==2 (true), y llama una sola vez invitationFor(two). Son una búsqueda indexada y comparación/ramificación adicionales. No hay un segundo llamado invitationFor ni un recorrido de todos los bindings para este INVITE.

El crecimiento de parent (listas y mapas de 1 a 2 invitees) es real, pero NO demuestra por sí solo coste creciente suficiente para fallar: new-first mantiene exactamente ese tamaño y pasa con Rules completas. El control aísla posición, manteniendo serial=2, los mismos bindings/occurrences/cycles y Activity histórica. Borrar la Activity histórica no ayuda. No se midió fórmula de coste por cantidad de claves ni se intentaron 3/4 invitaciones.

Source→Activity aporta coste: sustituir sólo versionedNoticeRequired permite pasar. No implica que su lógica sea falsa; dispatch-fixed pasa con ese helper íntegro. Activity→source satisface sus condiciones en controles con parent reducido, y quitarla entera NO rescata el parent completo. No se atribuyen cifras de expresiones a ninguna dirección. El límite queda acotado observacionalmente: despacho de segunda posición FAIL 1000 / primera posición PASS, mismo tamaño y resto de condiciones completas.

Los mensajes de baseline pueden enumerar ramas alternativas tras el agotamiento; no prueban que dichas ramas sean la causa inicial. La comparación de controles demuestra validez lógica de la transición, pero no provee una traza exacta del orden interno del evaluador ni su conteo. No se calibraron access calls, caché o márgenes; estos resultados no acreditan fan-out 4 ni integración.

## Pruebas, reproducibilidad y límites

Tres ejecuciones focalizadas: 5 tests (4 PASS harness/1 FAIL baseline), 7 (7 PASS harness), 2 (2 PASS harness). Total 14, 13 PASS harness y 1 FAIL baseline. En términos de escrituras: 11 variantes aceptadas, 3 rechazadas por 1000 (baseline, activity-true, no-history). Un PASS de harness que observa exhaustion NO es una escritura aceptada. El baseline conserva expectativa de éxito y queda rojo.

Runner: node scripts/test-second-dissection.cjs. Variable de proceso DISSECTION_CASES selecciona casos separados por coma; por defecto ejecuta los primeros cinco. Refinamiento: dispatch-fixed,notice-true,authority-true,binding-true,shape-first-half,shape-second-half,no-history. Último control: dispatch-identity,new-first. Logs ignorados: .tools/second-dissection.log, .tools/second-dissection-refined.log, .tools/second-dissection-position.log.

No se realizaron más controles de estados artificiales B/C/D: el control de posición con estado real y mismo tamaño ya discrimina el factor, evitando variantes innecesarias. No se repitieron inversa/mixta; la conclusión presente se acota a directa. Los seis rechazos previos de ambas APIs/orientaciones siguen como antecedente, no se suman a estos 14.

Archivos nuevos: docs/second-invitation-dissection.md, tests/rules/fixtures/second-dissection.cjs, tests/rules/second-dissection.test.cjs, scripts/test-second-dissection.cjs. Ningún archivo previo modificado en esta fase. firestore.rules conserva SHA256 7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b.

Siguiente decisión: revisar si se autoriza investigar una optimización semánticamente equivalente del despacho/evaluación del parent, con validación completa posterior. No se implementó ni diseñó una solución. STOP. Protected new-account bootstrap sigue como release blocker separado. Sin producción, migración, publicación, deploy, commit, push ni Etapa 7.
