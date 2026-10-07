# Joint Plan integrated prototype — corrección localizada y cierre

Fecha local: 2026-10-01. Prototipo aislado, no integración productiva.

## Causa y corrección

El NO-GO anterior era real: importId permanecía en el slot después de RELEASE,
porque la transición preserva sus keys. NEW/JOIN conservaban el campo y edgeSlot
lo priorizaba sobre la nueva occurrence; B ingresaba pero su Subject era rechazado.

Se elimina importId del slot y su rama especial de autorización. Provenance queda
en el checkpoint protegido existente prototypePlanControls/P.imports.one:
{occupancy, slot, binding}. No hay nueva colección ni consulta de provenance en
guards académicos. La lectura del control de publicación consulta solo su estado.

Los punteros existentes occurrence/joinedOccurrence contienen exclusivamente la
identidad CURRENT de la occupancy. Para importación usan import_[A-Za-z0-9]{16,40},
espacio disjunto de opaqueId alfanumérico de invitaciones. No se crea documento
invitationOccurrences ni cycle/Activity para fingir un JOIN histórico. En el slot
importado joinedOccurrence es el puntero materializado por el constructor protegido,
no un certificado de invitación. Su procedencia se conserva en el checkpoint.
Es una extensión semántica explícita del fixture, no un cambio a invitaciones C.

El guard normal conserva UID/slot/binding/identidad/revisión; solo admite también
la gramática importada. RELEASE limpia ambos punteros y deja keys equivalentes a
un slot vacío normal. No se modificaron los fixtures compartidos de slots/cycles,
Discovery o Member Edge. La corrección agrega cero lecturas a hot paths.

## Regresión y provenance

IMPORTED A → RELEASE → NEW B → JOIN B → SUBJECT B → MEMBER EDGE B: PASS.
Stale A JOIN/Subject/edge: rechazados. B tampoco puede asignar al target histórico A.
El edge histórico de A permanece almacenado; no autoriza la nueva occupancy.
Token importado usado como nueva invitación: rechazado por gramática disjunta.
Rerun después de reutilización conserva checkpoint/provenance y no sobrescribe B.

## Separación de capas

La construcción/publicación se valida en transacciones administrativas del fixture,
no mediante permisos de cliente. El constructor verifica fuente, binding, índice y
authority de owner/miembro antes de escribir. Publication valida padre, roster fijo,
cuatro slots, índice, refs, bindings, authority, frozen y ausencia de tombstone o
unresolved. Un índice inválido de owner bloquea construcción sin writes; la ausencia
real del binding de un joined y unresolved declarado bloquean publication.

El harness elevado no demuestra esas condiciones: las verifica el validador y sus
casos negativos. Rules demuestran por separado que el cliente no publica controles.
Idempotencia verifica source/generation/mapping; no depende de un campo stale del slot.
Esto prueba el fixture acotado, no un migrador general ni datos productivos.

## Gates finales

| Frontera | Evidencia |
|---|---|
| Legacy freeze | Mismo self-JOIN PASS antes del freeze y FAIL después/cutover/delete C |
| Parcial staged | Lectura, NEW directo, JOIN, Subject y edge rechazados |
| Owner/imported | Caso válido publicado; miembro importa sin amistad/cycle ficticios y crea Subject/edge |
| Unresolved | Binding real faltante o lista unresolved impiden publicación; staged permanece |
| Pending legacy | JOIN C directo rechazado; NEW genuino posterior PASS |
| Cutover | Control C active y legacy retired en transacción; old-client mutations rechazadas |
| Delete | Owner parent+tombstone PASS; non-owner y cada mitad aislada FAIL |
| Delete+child | Subject owner válido solo PASS; payload equivalente con delete FAIL sin estado parcial |
| Post-delete | NEW/REINVITE batches directos, JOIN/base/edge writes FAIL, sin depender de GET previo |
| Residuales | Slot/O/base/edge/ref/Activity permanecen; GET hijos/plan denegados; ref privada legible no autoriza |
| Resurrección | Padre retenido no se reescribe; con padre ausente y tombstone tampoco se recrea ni autoriza hijos |
| Legacy tras delete | Mismo self-JOIN sigue rechazado, no rollback de authority |
| Reutilización | A→release→B y stale A: PASS |

La superficie legacy del fixture reproduce un self-JOIN mínimo separado por familia
sin schemaVersion y control open/frozen/retired; no es toda la suite legacy productiva.
Se ensayó delete+child combinado; no se afirma una carrera concurrente adicional.

## Resultados exactos y recursos

Última ejecución: 1 test Node PASS; 0 FAIL/cancelled/skipped. Duración total
13190.0084 ms. JSON: 62 registros, 26 PASS, 35 negativos rechazados y una observación.
Negativos: 2 A, 33 D, 0 B, 0 C. No son 62 tests Node ni el total de RPCs.
D conserva mensajes de evaluación/otro del Emulator; no se presenta como rechazo
lógico A. Ningún agotamiento B/C se acepta como evidencia de seguridad.

La composición agrega lectura del control de publication, pero la corrección de
occupancy no agrega ninguna. Se ejecutaron NEW en slots 1–4 (no-owner en slot4),
REINVITE/JOIN, Subject/edge, RELEASE y delete válidos: PASS, sin Service/access
ceiling ni 1000 expressions. No se midió padding ni margen universal o conteo exacto
de access calls. Construcción/publication administrativas no consumen Rules budget;
no atribuirles presupuesto de cliente. Delete escribe solo padre+tombstone sin fanout.

La suite roja anterior queda superada por la regresión verde; no se cambia aquella
evidencia retrospectivamente ni se suman ejecuciones preliminares al total final.

## Reproducción, archivos y límites

Runner existente: node scripts/test-integrated-plan.cjs. Solo proyecto
 demo-correlativas-rules y Firestore Emulator 127.0.0.1:8088.
Se usó JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/Users/Bariguian/Downloads/GB/PROYECTOS/correlativas/.tools
solo en ese proceso para evitar el fallo local de sockets Java. Emulator se detuvo.
Sin configuración global ni credenciales reales. Syntax, whitespace y diff se
verifican al cierre; no suites históricas ni build fuera de alcance.

Modificados: tests/rules/fixtures/integrated-plan.cjs,
tests/rules/integrated-plan.test.cjs, este reporte y el JSON de evidencia.
Runner reutilizado. Sin cambios a firestore.rules, servicios o UI productivos.
SHA256 de firestore.rules:
7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b.
Working tree acumulado conservado. Sin producción, migración real, publish,
deploy, commit/push, Etapa 7 ni bootstrap.

GO solo para Integration Plan. Al integrar habrá que aplicar guards a todos los
grants reales y regresar coexistencia completa; este fixture administrativo no
prueba migración general. Bootstrap protegido sigue release blocker separado.
STOP para revisión.

JOINT PLAN INTEGRATED PROTOTYPE PASSED — READY FOR INTEGRATION PLAN
