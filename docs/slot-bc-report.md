# Etapa 6 — prototipo aislado B+C: STOP en primer gate

2026-10-01. Referencias: `joint-operational-participant-decision.md`, diagnóstico 3→4 y prototipo C previos. **PROTOTYPE B+C NO-GO**. No adopción ni integración. No demuestra imposibilidad de toda variante B+C; este candidato no supera el gate contractual y no se optimizó.

## 1–6. Representación, fuentes, reparto, localización, owner y cardinalidad

Se reutiliza `expanded()` del prototipo C y se reemplaza únicamente su fragmento subjects/checks en memoria. NEW/REINVITE/JOIN, slots, índice, release, occurrences y friendship cycles permanecen como estaban. Product Rules y servicios intactos.

Subject mantiene code, proposedParticipantIds, addedByUid, createdAt, updatedAt. Check añade a revision/actorUid/updatedAt un `proof` con keys fijas owner/slot1/slot2/slot3/slot4. Cada referencia presente contiene uid, instanceId, revision y occurrence; ausencia se representa null. Owner lleva revision/occurrence null y binding contrastado con parent, sin índice ni slot artificiales.

| Dato | Fuente authoritative | Papel del check |
| --- | --- | --- |
| owner/catalog/closed/deleting | Parent | Debe respetarlos; no los reemplaza |
| occupant/member/binding/revision/current occurrence | Slot actual | Transporta referencias que se contrastan |
| historia de invitación | Occurrence inmutable | No la consulta para propuesta |
| lifecycle/catalog | careerInstance actual | No copia operational=true |
| authority | migrationUsers actual | Verificación distribuida, nunca copia confiada |
| contenido/atribución de propuesta | Subject | Debe corresponder a la mutación actual |
| revisión técnica/proof de operación | Check | No autoriza futuras mutaciones por mera existencia |

**Subject** demuestra forma, atribución, lista 2..5 única, parent abierto, incremento de check antes/después y actor/time; consulta las instancias de todas las referencias, y authority de owner/slot1 presentes.

**Check** demuestra revisión propia, actor/time, cambio real de subject antes/después, forma estricta del proof y conjunto exacto UID = propuestos UNION actor; contrasta owner con parent y los cuatro slots presentes con UID/member/binding/revision/occurrence/joinedOccurrence actuales; consulta authority de slot2/3/4 presentes.

Localización bounded por keys físicas fijas, no búsqueda de UID ni slot arbitrario aceptado sin prueba. Duplicados se excluyen mediante conjunto/tamaño. Los helpers de subjects NO llaman a inviteeIndex. El índice sigue en la preparación/lifecycle C, sin relajación. El reparto usa posiciones fijas, no el orden arbitrario de propuestos.

Plan: owner + cuatro invitados joined = cinco miembros. Subject: mínimo contractual dos, máximo cinco. Un participante no sería camino válido. El primer intento incluyó exactamente `[owner, one, two, three, four]` y actor owner; no se hizo una matriz de cardinalidades inferior para esquivar el máximo.

## 7–9. Gate máximo, owner y non-owner

Preparación aceptada por Emulator: CREATE parent + cuatro slots vacíos, cuatro NEW completos y cuatro JOIN de clientes correspondientes. Fixtures iniciales authority instances/complete, instancias active, mismo catálogo. Slots revision1, occurrence/joinedOccurrence actuales. No se sembraron miembros artificialmente saltando JOIN.

Gate1 y Gate2 se representan mediante el mismo primer intento válido: owner escribe en un batch los documentos nuevos `jointPlans/plan000000000001/subjects/MAX` y `subjectChecks/MAX`, con cinco participantes y proof actual completo.

**FAIL: permission-denied, maximum of 1000 expressions.** El compuesto informa exhaustion en checkedBC (L707) y evaluation error en subjectBC (L730). Error literal completo y proof en `docs/slot-bc-evidence.json`. No se aisló contador por helper ni se atribuye una causa interna más estrecha.

**Non-owner: NO EJECUTADO por STOP.** No se reemplazó un non-owner fallido por owner: owner era el primer gate y ya falló.

## 10–18. Estado de los gates posteriores

| Requisito | Resultado de esta fase |
| --- | --- |
| Atomicidad subject/check | El batch máximo rechazado no dejó ninguna mitad; omisiones/mismatch todavía NO probados |
| Archive | NO EJECUTADO |
| Restore/sharing OFF | NO EJECUTADO |
| Release/reassign A→B | NO EJECUTADO bajo B+C; evidencia previa C no se reutiliza como resultado nuevo |
| Stale mapping | NO EJECUTADO |
| Frozen authority | NO EJECUTADO |
| Close | NO EJECUTADO |
| Cardinalidades 1→5 | Sólo se intentó máximo5; mínimo permitido sigue 2 |
| Permutaciones | NO EJECUTADAS |

No se implementaron transiciones adicionales de close/lifecycle para continuar después del STOP. Ninguno de esos pendientes se considera aprobado por inspección estática.

## 19. Reads del camino subject/check

Inventario conceptual directamente del fragmento, no trace exhaustivo del evaluador:

- Subject: parent; get(check) y getAfter(check); getAfter careerInstance por referencia presente; getAfter migrationUsers para owner/slot1 presentes.
- Check: parent; get(subject) y getAfter(subject); getAfter de slot1..4 presentes; getAfter migrationUsers para slot2..4 presentes.
- resource/request.resource de la mitad propia aportan estado previo/posterior.

No hay lectura de inviteeIndex, Activity, occurrences históricas, occupants anteriores ni ciclos de amistad en estos helpers. Sí existen lecturas de índice/amistad/occurrence durante NEW/JOIN de preparación, que NO son parte del batch MAX. No se creó certificado operacional duplicado.

## 20–21. Expressions y access calls

Owner máximo: expressions **sí**, Service call error **no observado**. No ofrece contador exacto ni prueba de margen de accesos. Ningún padding: el usuario lo autorizó sólo después de gates positivos aprobados. No se extrapolan los márgenes anteriores ni se asume caching. Restore/non-owner/reassignment no tienen mediciones en este candidato.

No se ha probado si un límite de accesos aparecería después de resolver expressions; no se intentó resolverlo. No presentar este resultado como descarte de la hipótesis general ni como simple problema corregible sin evidencia.

## 22–24. Negativos, concurrencia y lifetime

No se ejecutó corpus negativo ni carreras posteriores. El máximo es un **camino válido que falla**, categoría C/expression exhaustion; no prueba una garantía lógica A. B/access no observado. Hubo previamente un problema D del constructor de fixture: `String.replace` interpretó `$'` dentro de regex Rules e insertó texto adicional, causando error de compilación. Se corrigió únicamente el ensamblador usando callback de reemplazo literal. No cambió la lógica del fragmento ni una expectativa para obtener verde. El resultado final corresponde a Rules compiladas y preparación válida.

Lifetime diseñado en el fragmento: check persistente/revision-bound, evidencia de última mutación; comparación antes/después obliga a incrementar revisión y la otra mitad debe cambiar. No se añaden permisos para borrarlo o resetearlo. Replay, recreate y omisiones no fueron probados tras STOP; no afirmar validación del lifetime completo.

## 25. Archivos de esta fase

Sólo nuevos:

- `tests/rules/fixtures/slot-bc.cjs`
- `tests/rules/fixtures/slot-bc.fragment.rules`
- `tests/rules/slot-bc.test.cjs`
- `scripts/test-slot-bc.cjs`
- `docs/slot-bc-evidence.json`
- `docs/slot-bc-report.md`

Baselines, docs anteriores y todo el working tree acumulado preservados. Sin servicios/UI/migración ni Rules productivas modificados. Hash esperado/conservado de firestore.rules: `7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.

## 26. Ejecución

Runner `node scripts/test-slot-bc.cjs`, proyecto demo-correlativas-rules, loopback8088, configuración aislada existente. Java portátil y ajuste local de socket del harness habitual; sin credenciales ni producción.

- Intento inicial: compilación fallida por ensamblador, antes del gate; no resultado arquitectónico.
- Última ejecución válida del harness: **1 test Node, 0 PASS, 1 FAIL**. Preparación completada; gate owner máximo rechazado. Se conserva expectativa PASS y se relanza el error, no se convirtió en assertFails.
- Verificación administrativa exclusivamente Emulator confirmó `subjectsExists=false` y `subjectChecksExists=false`.
- Logs ignorados `.tools/slot-bc.log`, `.tools/slot-bc-final.log`; Rules compuestas `.tools/slot-bc.rules` y evidencia persistida en docs.
- Emulator cerrado al finalizar. Sin suites globales/build por STOP y alcance aislado.

## 27–28. Blocker y conclusión

El primer gate contractual alcanza 1000 expressions. El usuario requiere STOP inmediato: no se construyó el resto, no se microoptimizó ni se diseñó otra arquitectura. Las garantías posteriores siguen pendientes.

Protected new-account bootstrap continúa como RELEASE BLOCKER separado. Sin producción, Firebase Console, publicación, integración, migración real, deploy, commit, push ni Etapa7. STOP para revisión.

**PROTOTYPE B+C NO-GO**
