# Slice 1 — diagnóstico focalizado de recursos

2026-10-02. Diagnóstico solamente; sin fix ni avance de Slice 1.

## Hallazgo y baseline

El control del segundo test de `tests/rules/joint-plan-c.test.cjs` **no es un
CREATE legacy válido**: llama a `helpers.baseline()` pero no siembra amistad.
`tests/rules/helpers.cjs:baseline` crea usuarios, progreso, perfiles e índices de
email; no crea friendships. Esto corrige la interpretación del checkpoint anterior,
sin alterar ese checkpoint ni las expectativas de la suite original.

El baseline histórico está en `tests/rules/activity.test.cjs`, test
`activity plan zero, one, over max, omitted fourth notice and nonfriend`:
ejecuta `friends()` antes de `allow(invitePlan(db(), ['juan'], 'one'))`.
`invitePlan` escribe padre + aviso schema 1 atómicamente. La amistad aceptada
es parte del contrato, no una condición nueva de C.

Se reconstruyó exclusivamente en `.tools/slice1-pre.rules` el texto anterior a
Slice 1: quitar el bloque C añadido y restaurar las dos discriminaciones anteriores
de `legacyPlan`/`visiblePlan`. SHA256:
`7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`,
idéntico al registrado antes de Slice 1. No se usó HEAD como sustituto de ese estado.

## Reproducción y controles

Mismo batch, actor `german`, planId `legacychildplan01`, en los cuatro controles:

- `jointPlans/legacychildplan01`: owner german, career test-career, inviteeIds
  `[juan]`, memberIds `[german]`, invitedBy `{juan:german}`, closed false,
  createdAt/updatedAt serverTimestamp; sin schemaVersion, sin hijos C.
- `users/juan/activityInbox/jp_legacychildplan01`: schemaVersion 1,
  JOINT_PLAN_INVITATION, actor german, target jointPlan/id, createdAt serverTimestamp,
  readAt null.

| Rules | Fixture | Resultado de la escritura |
|---|---|---|
| Pre-Slice 1, hash verificado | Exacto original, sin amistad | FAIL 1000 expressions |
| Compuestas actuales | Exacto original, sin amistad | FAIL 1000 expressions |
| Pre-Slice 1 | Igual + friendships/german:juan accepted | PASS |
| Compuestas actuales | Igual + friendships/german:juan accepted | PASS |

Dos ejecuciones concordantes. Última: **4/4 controles diagnósticos PASS**,
12576.3546 ms; no skips/cancelled. Esto significa dos escrituras aceptadas y dos
rechazadas por recursos, NO cuatro escrituras permitidas ni suite Slice 1 verde.
No padding, cambios de validaciones, supresión de atomicidad ni calibración de margen.
Proyecto demo-correlativas-rules; Emulator 127.0.0.1:8088; shutdown final.
Runner, resultados, cobertura y log reproducibles locales en
`.tools/slice1-diagnostic-runner.cjs`, `.tools/slice1-diagnostic.test.cjs`,
`.tools/slice1-diagnostic-results.json`, `.tools/slice1-coverage-*.json` y
`.tools/slice1-diagnostic.log` (ignorados; no forman parte del producto).

## Ramas, lecturas y clasificación

La condición académica-social ausente está en
`users/{uid}/activityInbox/{itemId}.planInvitation` → `acceptedPlanningFriend(uid)`
(`firestore.rules:359`, helper en 449). La cobertura muestra false sin amistad y
true con ella. El padre exige el aviso mediante `validInvitee` →
`invitationRequired` → `noticeRequired`; el aviso exige la transición del padre,
authority de ambos usuarios y amistad. No basta con fabricar el aviso correcto.

Las referencias legacy relevantes son el padre antes/después, aviso antes/después,
tombstone, `users/german`, `migrationUsers/german`, `migrationUsers/juan` y ambas
orientaciones `friendships/german:juan` / `friendships/juan:german`.
Son referencias del código/cobertura, NO un presupuesto facturado de access calls:
no se asume cuánto cachea Emulator ni se suman referencias como lecturas efectivas.

Sí hay evaluación incidental de C en las rutas compartidas: cobertura registra
el CREATE C (`firestore.rules:880`) hasta `keys().hasAll` false, y el allow de
Activity C (`991`) llama a `slotNotice` (`979`), cuyos `let` construyen una ruta
usando `planId`/`occurrence` ausentes en el aviso legacy, antes del chequeo de schema.
Aparecen valores undefined/false. No se observó ejecución de las validaciones de
binding/authority C, slots/index, cycle, publication o Discovery en estos controles.
No corresponde atribuirles un presupuesto consumido ni afirmar un getAfter C válido
a partir de una ruta indefinida.

El error exacto incluye `PERMISSION_DENIED` y
`Unable to evaluate the expression as the maximum of 1000 expressions to evaluate
has been reached`. Ya aparece en pre-Slice 1, en CREATE legacy L671 y ramas update;
la composición también menciona L880/L991. Mencionar esas líneas NO demuestra que
C originó el agotamiento. No hubo `Service/access` ceiling observado.

**No se demostró incremento que convierta un camino válido en inválido.** El cambio
decisivo es el fixture sin amistad, que entra en un camino de rechazo preexistente.
No se midió el delta exacto de expresiones de C ni se atribuye el límite a un helper
C: cobertura y mensajes de rechazo no son una contabilidad aislada del límite.
Tampoco se deduce un short-circuit universal por orden de matches. El agotamiento
del camino inválido preexistente queda distinguido de viabilidad del camino válido.

## Frontera y acción mínima propuesta (NO aplicada)

Existe discriminación local de familia por schema del padre y del aviso. Adelantar
el guard de Activity C antes de `slotNotice` es un candidato de separación, pero
estos controles NO prueban que sea necesario para recuperar un CREATE válido ni
validan ese cambio. No se implementó ni optimizó.

Primero corregir, previa aprobación, el setup del control válido original sembrando
la amistad aceptada como en el test histórico; conservar un negativo explícito sin
amistad. Luego repetir el ataque con hijo C y la suite focalizada real. Un recurso
en ese ataque no acreditaría aislamiento. No sustituir expectativas ni declarar
completo Slice 1: el ataque original todavía no llegó a ejecutarse.

El control C previo (CREATE + cuatro NEW + JOIN del cuarto invitado) conserva
exactamente fixture y Rules; no se reejecutó, como permite el alcance del diagnóstico.
Rules actuales mantienen SHA256
`5c919789910baa4ffab1e6dec09af1b76a0ade180617bfcfe15858ac452632a8`.
Syntax del harness PASS; ambas Rules compilaron en Emulator. Whitespace y
git diff --check PASS. Único archivo entregable nuevo: este documento; código,
Rules y tests existentes intactos. Bootstrap sigue release blocker separado.

SLICE 1 RESOURCE CAUSE IDENTIFIED — LOCAL FIX CANDIDATE
