# Diagnóstico acotado de reinvite — STOP

Fecha: 2026-09-30. DIAGNÓSTICO A acotado a la familia de renovación del parent en el compuesto actual; no a un conteo exacto ni a un único operador. No optimización ni integración.

## Baseline y estado

Se carga el candidato optimized sin modificaciones durante preparación: friendship C1 accepted preparada por harness, CREATE, X/Activity X reales, withdrawal autenticado, request C2 + certificado + fr_C2 atómicos, accept C2 + fa_C2 atómicos. Y mantiene expectativa de éxito y falla 1000. La reproducción usa batch del mismo payload; el antecedente congelado usó runTransaction.

N (primera invitación): parent sin slot del destinatario, serial0, occurrence ausente, binding ausente; friendship vigente C1. R: parent conserva one pendiente/unresolved, invitedBy owner, cycle C1 y occurrence1; serial1; friendship one:owner es accepted C2. Y conserva slot/binding e inviter, cambia puntero corriente de cycle C1→C2, occurrence1→2, serial1→2, con nueva Activity jp_p_2. invitationRecipient=one, mismo actor, authority instances, instancia activa y catalog. No se recorre una lista de occurrences históricas: el mapa guarda el puntero vigente por UID.

Inventario real R: una sola relationship one:owner ahora C2 accepted (no dos relationship docs ni status withdrawal persistente); usedFriendshipCycles C1 y C2; fr_C2 en owner y fa_C2 en one; parent con puntero X; jp_p_1 ligada a C1. La fixture NO contiene fr_C1/fa_C1: C1 inicial está sembrado como accepted. No se atribuyen resultados a esos avisos inexistentes. Los demás usuarios/controles/instancias son iguales entre variantes. El certificado C2 fue creado por el protocolo real, con participants/relationshipId correctos; no se añade un lookup de certificado a activation.

X histórica significa Activity X inmutable ligada a C1; el puntero corriente del parent sí debe avanzar a Y. No se interpreta el requisito de inmutabilidad como prohibición de actualizar ese puntero.

## Grafo y estrategia

Parent → shape → invitationFor(recipient) → actor/open/binding/authority → diffs/serial/occurrence → bifurcación nuevo vs renovación → source exige Activity nueva exacta.

Renovación: uid ya invitado; inviteeIds iguales; before.invitedBy[uid]==actor; cycle before!=after; participants iguales. Activity Y valida current friendship/cycle, authority, binding pendiente, payload y transición parent. No hay consultas a Activity X ni listado de registros de cycles durante activation.

Primero se separaron schema/transición/Activity/dispatch. Al localizar parent se aisló la bifurcación renovación y su comparación de bindings. Controles de estado distinguen documentos históricos de slot previo. Todas las reducciones están etiquetadas DIAGNOSTIC ONLY, sin alterar candidato.

## Variantes y resultados de escritura

| Variante | Resultado |
| --- | --- |
| Baseline completo | FAIL 1000 |
| shape-true: sólo schema parent sustituido | PASS |
| transition-true: sólo inviteInstanceMember sustituido | PASS |
| activity-true: sólo validVersionedInvitation sustituido | FAIL 1000 |
| dispatch-fixed: invitationFor('one') | FAIL 1000 |
| binding-equality-true: sólo igualdad participants sustituida | FAIL 1000 |
| renewal-branch-true: bifurcación nuevo/renovación sustituida | PASS |
| no-history: elimina jp_p_1, certificado C1, fr_C2 y fa_C2 después del lifecycle | FAIL 1000 |
| no-prior-slot: conserva lifecycle, historia y serial1; quita slot previo/maps del invitado | PASS |

no-prior-slot es un estado artificial administrado: mantiene certificado C1/C2, relationship C2, Activities y serial1, y vuelve la transición una invitación nueva occurrence2. No se presenta como estado alcanzable por producto ni solución. no-history agrupa documentos para aislar esa familia; no demuestra el coste individual de cada documento, pero prueba que eliminarlos juntos no rescata el caso. C2/certificado se conserva.

## Validez lógica Y

PASS lógico para plan open/capacity/schema, owner/member/invitedBy, UID/selector y única changed key, serial+1, occurrence nueva distinta de X, autoridad, instancia activa, catalog y binding: con shape-true pasa toda la transición; con transition-true pasa schema; los payloads son iguales.

PASS lógico para amistad accepted/current C2, C1 distinto C2, Activity Y exacta, source→Activity y Activity→source: las variantes que pasan mantienen esos helpers completos. No se sustituyó ninguna condición de Activity en las escrituras aceptadas. Certificado C2 válido: preparado mediante request real autorizado (no constituye una lectura adicional realizada por activation).

Activity X se compara antes/después en cada variante y queda idéntica, o ausente antes/después únicamente en no-history. En cada rechazo el parent queda idéntico y jp_p_2 no existe. En cada aceptación diagnóstica serial2 y jp_p_2/C2 se comprueban. No se demostró otra vez toda la inmutabilidad adversarial de X; no se repitió el corpus negativo ni JOIN.

No hubo FAIL lógico aislado. Las familias completas pasan por separado sobre el mismo payload. El agotamiento no se atribuye a datos inválidos.

## Interpretación

A: Y es válida en los controles complementarios; se localiza coste en la evaluación de la rama de renovación del parent dentro del compuesto acumulado. No se demuestra que esa rama por sí sola consuma 1000 ni se identifica una única expresión redundante. Quitar schema también permite pasar: existe contribución acumulada.

No es el dispatch posicional: fijarlo falla. No es suficiente quitar igualdad de participants. No es el historial documental X/C1/fr/fa: retirarlo falla. Current C2, su certificado, serial1→2 y Activities históricas pueden coexistir con una nueva activation aceptada en no-prior-slot. La presencia del slot previo conduce a la rama de renovación; se diferencia de una segunda invitación normal que agrega un UID (ya validada en el antecedente 0→4). No se repitió ese antecedente ni se sumó a los conteos.

Friendship Activity C2 fue autorizada y no necesita ser eliminada para obtener PASS diagnóstico; quitar validación de Activity Y no rescata parent. Source→Activity permanece en todas las variantes aceptadas. No hay cifras de contribución, conteo de expressions ni access-call budget. No se reconstruyó parent idéntico sin lifecycle: no hacía falta para esta clasificación acotada.

## Tests y archivos

Dos ejecuciones: 5 tests (4 PASS harness/1 FAIL baseline) y 4 (4 PASS harness). Total 9 tests, 8 PASS harness/1 FAIL baseline. Escrituras: 4 PASS, 5 FAIL 1000. Un PASS de harness que registra exhaustion no es éxito de producto. Expectativa de baseline no invertida.

Reproducir: node scripts/test-reinvite-diagnostic.cjs (cinco variantes iniciales). REINVITE_CASES=binding-equality-true,renewal-branch-true,no-history,no-prior-slot selecciona el refinamiento. Logs locales ignorados .tools/reinvite-diagnostic.log y .tools/reinvite-refined.log. Sólo demo-correlativas-rules y loopback8088.

Nuevos: tests/rules/fixtures/reinvite-diagnostic.cjs, tests/rules/reinvite-diagnostic.test.cjs, scripts/test-reinvite-diagnostic.cjs, docs/reinvite-diagnostic.md. Todos los archivos previos conservados; candidato y product Rules sin modificación. SHA256 firestore.rules: 7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b.

Siguiente decisión recomendada: revisar si se autoriza una optimización semánticamente equivalente de la evaluación de renovación; este diagnóstico no propone ni implementa una. NO-GO de integración sigue vigente. Sin concurrencia, access calibration, producción, Console, publicación, migración real, deploy, commit, push ni Etapa7. Protected new-account bootstrap permanece release blocker separado. STOP para revisión.
