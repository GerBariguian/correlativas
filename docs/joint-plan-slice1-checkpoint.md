# Etapa 6 — Slice 1: STOP por grant cruzado legacy/C

## R08 — UPDATE legacy → C — 2026-10-02

Inspección exclusiva de UPDATE del parent: la rama legacy requiere `validPlan()`
con keys.hasOnly que excluye schemaVersion/origin/ownerInstanceId/catalogId;
sus transiciones además restringen affectedKeys. Las ramas v2 exigen schema 2
del recurso anterior. La rama C mantiene `allow update, delete, list: if false`.
No falta un permiso restrictivo que habilite el flip; no se agregó guard ni se
modificaron Rules. Un deny explícito no reemplaza la revisión de grants solapados.

Controles en Rules reales, parent legacy válido preestablecido por el harness,
actor owner german con authority legacy; ninguna escritura de hijos ni Activity:

- T1: rename legacy contractual con updatedAt serverTimestamp: PASS.
- T2: UPDATE agrega schemaVersion 3: DENY con 1000 expressions; no acredita
  el rechazo lógico requerido.
- T3: UPDATE transforma la forma completa en parent C native canónico, eliminando
  campos legacy y agregando schema/ownerInstanceId/catalogId/origin: DENY con
  1000 expressions; tampoco acredita rechazo lógico independiente de recursos.
- T4: no ejecutado: Slice 1 actual no habilita ningún UPDATE contractual del
  parent C. No se inventó una operación ni se abrió un permiso para hacer pasar T4.

Tres tests ejecutados: **1 PASS / 2 FAIL** contra las expectativas estrictas.
No schema flip aceptado observado. No investigación de budgets, microoptimización
ni cambios en R05/R06/R07. R08 no depende de probar children, pero sus requisitos
de cierre siguen incumplidos y T4 necesita una operación contractual habilitada.

Evidencia ignorada local: `.tools/r08.test.cjs`, `.tools/r08-runner.cjs`,
`.tools/r08-results.json`, `.tools/r08.log`. Emulator local demo detenido.
Único entregable modificado: este checkpoint. Sin cambios productivos,
producción, publish/deploy, commit/push ni cleanup/reset/revert.

**R08 BLOCKED**

## R05-FIX — dos variantes agotadas — 2026-10-02

Se probaron exclusivamente T1 CREATE C contractual (padre + cuatro slots + ref),
T2 batch legacy válido + Activity + slot C, y T3 mismo legacy sin hijo, para dos
variantes diagnósticas. Amistad aceptada presente en T2/T3.

1. Inline: sustituir `cPlan(parent())` por
   `parent().get('schemaVersion', 0) == 3`. Evita una llamada al helper, no reads.
2. Parent local: `initialCParent()` obtiene `let p = parent()` y comprueba
   `p.get('schemaVersion', 0) == 3`, owner y createdAt juntos. Evita repetir las
   llamadas a parent/getAfter para esos campos; no se afirma ahorro de access
   calls efectivos porque puede haber caching. No añade paths/reads nuevos.

Ambas conservan el discriminador, socialUser, slot fijo, blank, padre inexistente
previo, owner y timestamp. La segunda reordena conjunciones sin cambiar sus
condiciones de autorización. resource/request.resource del slot describen al hijo,
no pueden reemplazar la lectura del padre. No se tocaron Activity ni friendship.

| Variante | T1 | T2 | T3 |
|---|---|---|---|
| 1 inline | PASS | DENY + 1000 expressions | PASS |
| 2 parent local | PASS | DENY + 1000 expressions | PASS |

Resultado final: **6 tests, 4 PASS / 2 FAIL**; expectativas de logical DENY en T2
conservadas. No valid path agotó recursos; las dos variantes fracasan en acreditar
el rechazo requerido. Un primer intento no llegó a controles por import relativo
incorrecto del harness; se corrigió únicamente ese import antes de la ejecución.

Evidencia local: `.tools/r05-fix-v1.rules`, `.tools/r05-fix-v2.rules`,
`.tools/r05-fix.test.cjs`, `.tools/r05-fix-results.json`, `.tools/r05-fix.log`.
Rules productivas intactas (hash 13e158ba7274ae63342adc46d3b87ec245019e1569f033bb21415e48dda3a59c).
No se adoptó variante ni se continuó optimizando. Emulator local detenido;
sin otros nodos, slices, producción, publish/deploy ni commit/push.

**R05 RESOURCE BLOCKER CONFIRMED — R05 BLOCKED**

## R05 — contraste atómico focalizado — 2026-10-02

Dos controles con el mismo batch: CREATE padre legacy válido de german con juan
invitado, Activity schema 1 y slot1 C vacío; amistad aceptada sembrada previamente.
WITH GUARD usa las Rules productivas intactas. WITHOUT GUARD carga únicamente en
Emulator una copia que retira `cPlan(parent())` del allow CREATE del slot; no cambia
ninguna otra condición, guard de otro recurso ni fixture.

- WITH GUARD: **resource DENY**, PERMISSION_DENIED con maximum of 1000 expressions.
- WITHOUT GUARD: **ACCEPT**, sin resource exhaustion observado.
- Dos tests: **1 PASS / 1 FAIL**; falla la expectativa de rechazo lógico sin
  agotamiento WITH GUARD. No se cambió esa expectativa para obtener verde.

El contraste demuestra que retirar sólo ese guard cambia la aceptación de este
batch. NO demuestra que su rechazo con guard se produzca sin depender del límite
de expresiones: no se cumple el criterio de cierre de R05.
El ataque atómico es necesario: el CREATE del slot exige padre inexistente antes
del commit y createdAt igual a request.time; usar padre preexistente introduce
otras causas de rechazo y no reproduce esta superficie.

Evidencia ignorada local: `.tools/r05-atomic.test.cjs`,
`.tools/r05-atomic-runner.cjs`, `.tools/r05-atomic-results.json`,
`.tools/r05-atomic.log`. Emulator demo local detenido al finalizar. Hash de
firestore.rules comprobado idéntico antes/después; guard productivo conservado.
No microoptimización, padding ni otros nodos/gates. R06/R07/R08 y Slice 2 no
intervenidos. Se detiene por resultado B para revisión.

**R05 BLOCKED — SLICE 1 ISOLATION ATOMIC ATTACK UNPROVEN**

## Corrección local autorizada — guard aplicado, validación pendiente

2026-10-02. Se aplicó el discriminador existente `schemaVersion == 3` mediante
`cPlan(p)`, con acceso seguro `p.get('schemaVersion', 0)`. No se agregó una nueva
generation ni se cambió el contrato. `cPublished` y adquisición de refs reutilizan
ese mismo discriminador. CREATE de slots, inviteeIndex e invitationOccurrences
ahora exige `cPlan(parent())`, usando el padre posterior del commit.

Auditoría limitada a los recursos introducidos en Slice 1:

- slots: guard explícito nuevo; defecto demostrado anteriormente.
- inviteeIndex y invitationOccurrences: faltaba guard explícito de familia;
  se agregó el mismo, sin atribuirles un exploit no reproducido.
- jointPlanRefs: ya exigía schema 3; ahora usa el helper común.
- Activity C: exige occurrence nueva del mismo commit; su creación queda
  vinculada a la occurrence cuyo CREATE ahora exige padre C. No se alteró esa
  atomicidad ni se agregó otro mecanismo de autorización.
- jointPlanControls: continúa cerrado a escrituras cliente.
- Subjects/member edges: no intervenidos.

La ejecución focalizada posterior al cambio dio **3 tests, 2 PASS, 1 FAIL**,
11742.5346 ms, cero skipped/cancelled:

- CREATE C + cuatro NEW + JOIN del cuarto invitado: PASS, sin agotamiento observado.
- CREATE legacy válido sin hijo: PASS.
- Legacy + hijo C: **DENY**, pero la respuesta agregada incluye `1000 expressions`.
  La aserción que prohíbe usar ese error como evidencia suficiente FALLA.
- Legacy sin amistad: DENY histórico; su test pasa como negativo.

La corrección dejó de aceptar el ataque en esta ejecución, pero **no se declara
demostrado el aislamiento por rechazo lógico independiente del agotamiento**.
El error menciona ramas del padre/Activity y evaluación del slot; no se atribuye
el límite al guard sin diagnóstico adicional. No hay evidencia de agotamiento
en un camino válido ni de Service/access ceiling. Este resultado NO reabre el
falso positivo del fixture sin amistad, ya resuelto.

No se relajó la expectativa del ataque, no se hizo padding ni microoptimización.
El gate obligatorio sigue rojo y bloquea certificar la corrección y completar
Slice 1. Schema flip, negativos representativos de otros hijos y gates restantes
no se declaran validados. Se detiene para revisión de este resultado antes de
continuar; no se propone otra arquitectura.

Evidencia: `.tools/slice1-guard.log`. Rules reales compiladas por Emulator local
demo-correlativas-rules (127.0.0.1:8088), shutdown completado. Syntax de domain,
runner y test PASS; whitespace y git diff --check PASS. Estado dirty preservado.
Esta intervención modifica únicamente firestore.rules y este checkpoint; conserva
el test estricto y la documentación histórica. Sin servicios/UI, producción,
publish/deploy, commit/push, bootstrap ni slices posteriores.

**SLICE 1 BLOCKED**

## Reanudación tras diagnóstico aprobado — 2026-10-02

El STOP anterior por recursos fue un **falso positivo del control válido**:
faltaba la amistad aceptada german/juan. Ver
`docs/joint-plan-slice1-resource-diagnostic.md`, conservado sin cambios.
La sección histórica inferior no describe el blocker actual.

Se corrigió exclusivamente el setup de `tests/rules/joint-plan-c.test.cjs`:
amistad accepted explícita antes del control y antes del ataque, más un test
negativo independiente sin amistad. No se cambiaron expectativas ni Rules.

Resultado actual con `node scripts/test-rules.cjs --joint-c-only`:
**3 tests: 2 PASS, 1 FAIL**, cero skipped/cancelled, 11684.6752 ms.

- CREATE C nativo (seis writes), NEW posiciones 1–4, JOIN del cuarto invitado
  y rechazo de lectura privada ajena: PASS.
- CREATE legacy + amistad + un invitado + Activity atómica: PASS.
- Mismo batch válido más `jointPlans/legacychildplan01/slots/slot1` vacío:
  **ACEPTADO**, falla la aserción `Legacy CREATE must not authorize a C child`.
- CREATE sin amistad: DENY con 1000 expressions, comportamiento histórico
  conocido de un fixture inválido, no nuevo blocker de recursos.

**Blocker real: grant cruzado de creación.** El allow create C de slots
(`firestore.rules:937`) comprueba socialUser, slot fijo, blank, inexistencia del
padre previo, owner y createdAt del padre posterior; no comprueba su familia C.
El padre es autorizado por su rama legacy y el hijo por esta rama C dentro del
mismo batch. `match /jointPlans/{planId}` no impone por sí mismo discriminación
de schema a sus subcolecciones. No hubo error de recursos en este ataque: commit
resolvió exitosamente y `accepted` fue true.

Alcance demostrado: persistencia de un hijo C bajo un padre legacy. No se afirma
haber demostrado authority operativa, schema flip, acceso académico o resurrección:
esos efectos no fueron ensayados. El gate aprobado exige rechazar este batch y no
se cumple. Se ejecuta STOP por aislamiento de familias, sin cambiar arquitectura
ni aplicar una corrección silenciosa.

Evidencia local: `.tools/slice1-resume.log`. Emulator demo-correlativas-rules,
127.0.0.1:8088, shutdown completado. Rules productivas sin cambios en esta
reanudación. Syntax del test/runner/domain, whitespace de los archivos de Slice 1
y git diff --check PASS; git status --short inspeccionado, dirty previo preservado.
No se ejecutaron suites adicionales tras el blocker. Los restantes gates DTO,
cycles/stale/occupancy/schema, coexistencia exhaustiva y regresiones directamente
afectadas continúan pendientes; no se acredita Slice 1 completo.

Archivos de esta reanudación: test C y este checkpoint. Archivos productivos
parciales de Slice 1 conservados: firestore.rules, src/jointPlanLogic.js y
src/jointJoinLogic.js; runner scripts/test-rules.cjs conservado. No se modificaron
servicios, UI, migration ni el diagnóstico aprobado. Slices 2–8 no avanzados;
bootstrap protegido sigue release blocker separado. Sin producción, publicación,
deploy, commit, push, revert, reset ni cleanup.

**SLICE 1 BLOCKED**

## Historia: STOP inicial por recursos (supersedido por el diagnóstico)

Fecha: 2026-10-02. Implementación local parcial, NO lista para integración/release.

## Blocker reproducido

Con firestore.rules real, CREATE legacy válido de `german`, un invitado `juan`,
careerId `test-career`, memberIds `[german]` y Activity schema 1 en el mismo commit:
**permission-denied con maximum of 1000 expressions**. Dos escrituras, sin hijos C.
Caso en `tests/rules/joint-plan-c.test.cjs`, segundo test, control válido previo al
ataque. El test falla antes de intentar adjuntar el slot adversarial.

Reglas reportadas por Emulator: create L660/L671/L880; Activity L316/L991 y ramas
update evaluadas. Se observó agotamiento de expresiones, no Service/access ceiling.
La causa detallada de distribución de expresiones entre ramas no está diagnosticada;
no se atribuye un número de reads ni se propone optimización. Clasificación: C,
blocker de viabilidad en un camino legacy que debe preservarse.

El intento anterior de ataque con hijo también se rechazó por agotamiento. Eso NO
demuestra aislamiento de familias: por eso se agregó control sin hijo y se rechaza
explícitamente agotamiento como resultado válido del negativo. Expectativas no relajadas.

## Estado parcial

- `src/jointPlanLogic.js`: discriminador schemaVersion 3, origin native/migrated,
  DTO de padre/slot y constructor nativo puro. Slot sin provenance/importId.
- `src/jointJoinLogic.js`: builders C puros JOIN/RELEASE; RELEASE limpia identidad.
  APIs anteriores conservadas; no servicios conectados.
- `firestore.rules`: rama estructural C estática adaptada de slots/Discovery,
  cuatro slots, índice/O/Activity/ref recíprocos, publication protegida para migrated,
  native CREATE sin migrador. Subjects/edges C cerrados para Slice 3; updates/deletes
  del padre C cerrados. Aislamiento inicial respecto de grants previos, aún no auditado
  completamente. No constructor ni cutover administrativo habilitado a clientes.
- `scripts/test-rules.cjs`: opción focalizada `--joint-c-only`.
- `tests/rules/joint-plan-c.test.cjs`: Rules reales sin transformación, requests
  construidos con helpers previos; test válido C y control/ataque de coexistencia.

No cambios de servicios, UI, índices, migration ni dependencias. No se completaron
cycles productivos, corpus negativo/domain, aislamiento exhaustivo ni regresiones
bridge/Activity/lifecycle: **pendientes por STOP**, no omitidos de la definición de PASS.
Los DTOs y Rules parciales no deben considerarse contrato final validado.

## Validación exacta

Comando: `node scripts/test-rules.cjs --joint-c-only`, proyecto
`demo-correlativas-rules`, Firestore 127.0.0.1:8088. Solo por proceso:
`JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/Users/Bariguian/Downloads/GB/PROYECTOS/correlativas/.tools`.

Última suite: **2 tests, 1 PASS, 1 FAIL**, 0 skipped/cancelled; total 9927.7071 ms.
Caso C PASS: CREATE nativo de seis escrituras, NEW posiciones 1–4, JOIN del cuarto
invitado y lectura privada ajena denegada. El nombre “member five” refiere a la
capacidad del roster, no a cinco JOIN completados: los otros tres siguen pendientes.
Ningún PASS previo del prototipo reemplaza esta validación real fallida.

Emulator terminó con shutdown; log local `.tools/slice1-rules.log`.
Syntax de archivos JS/CJS modificados, whitespace y git diff --check se revisan al
cierre. No suites históricas completas ni build fuera del alcance del STOP.

## Preservación y próximo paso

Working tree experimental previo conservado; sin revert/reset/cleanup. La ayuda
de edición `.tools/materialize-c-slice1.cjs` es local/ignorada y no se usa en runtime,
tests reales ni deployment; no volver a ejecutarla sobre las Rules ya materializadas.
No se modificaron pruebas históricas para hacerlas verdes.

Se requiere revisión del blocker antes de continuar; no microoptimización ni nueva
arquitectura aplicada. Slice 2 y posteriores no iniciados. Bootstrap protegido sigue
release blocker independiente. Sin producción, Console, publish, deploy, commit/push.

SLICE 1 BLOCKED
