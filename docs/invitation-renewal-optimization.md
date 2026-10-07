# Única optimización de evaluación de renewal — STOP / NO-GO

2026-09-30. Candidato aislado sobre invitationRecipient; ningún cambio productivo.

## Semántica y refactor

OLD: (P && R) || (!P && N), donde P es uid in before.inviteeIds, R exige array invitees idéntico, mismo inviter, cycle distinto y participants idéntico; N exige conservar invitees previos y agregar exactamente uid.

Candidato: P ? R : N. P se calcula desde resource.data, no desde un discriminador aportado por cliente. No se agregan campos/hints. Se conservan literalmente R y N, así como schema, dispatch invitationRecipient demostrado por diff, authority, instancia/catalog/binding, serial/occurrence y source↔Activity.

La equivalencia booleana para pre-state válido es directa: P=true aplica R; P=false aplica N. No se afirma equivalencia completa de comportamiento del evaluador frente a errores, ni equivalencia adversarial integral acreditada. La prueba semántica algebraica no elimina el gate empírico.

Causa conocida anterior: contribución acumulada de rama de renovación; no un operador único probado. Esta sustitución no reduce suficientemente el coste observado. No se realizó una segunda optimización.

## Resultado exacto

- Posiciones 1–4 de nueva cuarta invitación: 4/4 PASS.
- CREATE→NEW 1→2→3→4: PASS directa/inversa/mixta.
- JOIN sucesivos hasta cinco miembros sobre NEW: PASS en las tres orientaciones.
- NEW invitedBy distinto del owner: PASS directa/inversa, sin amistad owner-destinatario.
- Reinvite: CREATE, X/C1, withdrawal, request C2+certificado+fr_C2 y accept C2+fa_C2 pasan. La activación Y falla permission-denied / maximum of 1000 expressions. Los checks posteriores de historia/pointer, stale occurrence y JOIN Y no se alcanzan.
- El fallo se reproduce ya en el plan mínimo: no se prueba renewal de plan máximo ni renewal con invitador no-owner.

Error exacto relevante: `Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached.` Mensaje señala update L726/L777 y create L925 de Rules generadas, con evaluation error y false for get. Es el mismo camino contractual pendiente de reinvite, no un nuevo camino distinto. No atribuir exceso de access calls.

## Negativos y límites

Se reejecutó corpus heredado: 29 ataques × old/optimized = 58 rechazos. Todos incluyen exhaustion; no acreditan rechazo lógico individual. Incluye selector, inviter, friendship/cycle, occurrence/serial, duplicado, mutación doble, binding ajeno, catalog/instance/lifecycle, capacidad, Activity/source ausente o incorrecta, replay/cross-plan y alteración/eliminación de invitación anterior. No sustituye el nuevo corpus exhaustivo de branch confusion/renewal pedido: quedó pendiente por STOP.

El selector NEW/RENEWAL no existe como campo del cliente: se deriva del pre-state. La equivalencia lógica de este cambio está razonada arriba, pero falta evidencia empírica integral sin exhaustion. Source↔Activity no se modificó; los NEW válidos usan ambas mitades, omisiones rechazan con exhaustion.

No se ejecutó concurrencia, calibración NEW/RENEWAL, C3, renovación con plan cargado, renovación no-owner ni validación completa de pointer e historia después de Y. No afirmar que JOIN NEW demuestra JOIN Y. No se atribuye margen de expressions ni access calls. La composición completa sí está cargada (NEW/RENEWAL, Activity y friendship Activity, cycles, authority, instances, catalog/bindings, JOIN, capacity/lifecycle); su camino válido Y sigue fallando.

## Conteos y archivos

Última y única ejecución del nuevo runner: 63 tests, 62 PASS, 1 FAIL, 0 skipped. Incluye cinco tests superiores y 58 subtests negativos. Posiciones y orientaciones son controles internos, no tests Node adicionales. La suite ya programada completó regresiones; al revisar el fallo se declaró STOP, sin otra ronda.

Log ignorado: .tools/invitation-renewal.log. Reproducir: node scripts/test-invitation-renewal.cjs (demo-correlativas-rules / 127.0.0.1:8088). Emulator apagado por runner.

Nuevos: tests/rules/fixtures/invitation-renewal.cjs; tests/rules/invitation-renewal.test.cjs; scripts/test-invitation-renewal.cjs; docs/invitation-renewal-optimization.md. El test copia el gate anterior y sólo cambia la fixture cargada. Todo el working tree anterior conservado. firestore.rules conserva SHA256 7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b.

NO-GO para integración. El cambio booleano no resuelve el bloqueo. No continuar sin nueva revisión; no se propone arquitectura alternativa ni otra microoptimización. Protected new-account bootstrap sigue release blocker separado. Sin producción, Console, migración real, publicación, deploy, commit, push ni Etapa7.
