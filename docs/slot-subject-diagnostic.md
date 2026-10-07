# Diagnóstico aislado C: subject + subjectCheck, transición 3 → 4

2026-10-01. No adopta ni descarta definitivamente C o subjectCheck. No contiene una solución implementada. Continúa el STOP de `slot-expansion-report.md`, sin ampliar su alcance.

## 1. Baseline preservado

Antes de crear variantes se ejecutó el fixture `expanded()` existente sin modificarlo: **2 PASS, 3 PASS, 4 DENIED**. La denegación de cuatro reproduce `Service call error` y `maximum of 1000 expressions`. Ambos documentos ausentes tras rechazo. El negativo de uno NO se ejecutó ni se utilizó. Nunca se intentaron cinco participantes.

El error literal completo de cada intento está en `docs/slot-subject-diagnostic-evidence.json` (label baseline-4 para reproducción final). Baseline-4 señala expressions en `subjectChecks` (L687 del compuesto) y getAfter `users/three/careerInstances/i_three` en `subjects` (L709). Los números cambian al sustituir funciones en variantes; no son líneas de Rules productivas.

## 2. Cardinalidad real

Actor siempre `owner`. Baseline4 = `[owner, one, two, three]`: owner + **tres** invitados ya miembros. El plan tiene cuatro slots ocupados y cuatro JOINs válidos, pero `four` no está propuesto en ese subject. El contrato conserva 2..5 propuestos, owner + hasta cuatro invitados como máximo del plan. No requiere que actor esté en la lista de propuestos.

Control adicional sin owner en la lista: `[one,two]` pasa; `[one,two,three]` y `[one,two,three,four]` fallan con ambos mensajes. Por tanto, no es exclusivamente una discontinuidad por longitud 4: el número de no-owner que requieren prueba compuesta es determinante en esta muestra.

## 3. Inventario factual antes de escribir

Proyecto exclusivamente Emulator `demo-correlativas-rules`, database `(default)`, loopback8088. Plan `jointPlans/plan000000000001` creado mediante cliente owner:

- schemaVersion30; ownerId owner; ownerInstanceId i_owner; catalogId catalog; closed/deleting false; createdAt timestamp.
- slots slot1..4: UIDs one/two/three/four, status member, revision1, binding i_UID; occurrence y joinedOccurrence `subjectocc000001`..`subjectocc000004`; invitedBy owner, cycle `cycle_unique_0001`..4.
- inviteeIndex/UID: `{slotId: slotN}` coherente con ese UID.
- migrationUsers/owner, one, two, three, four: schema1, generation multicareer-v1, origin legacy, authority instances, phase complete, manifestId UID, updatedAt timestamp.
- users/UID/careerInstances/i_UID: schema1, catalogId catalog, lifecycle active, createdAt/updatedAt timestamp, archivedAt null.
- friendships/UID:owner aceptadas y certificados usedFriendshipCycles, occurrences y Activity existen por preparación. **Ninguna de esas familias se consulta al autorizar el subject/check**.
- users/UID y catalogMemberships también están sembrados por la fixture heredada, pero no autorizan este batch. activeCareerInstanceId no interviene.

Cada variante vuelve a preparar estado limpio, crea slots/invitaciones y ejecuta los cuatro JOINs. Las comprobaciones verifican authority e instancias activas; no hay mutación compartida de metadata en este diagnóstico. Inventario sintético de ejecución en `.tools/slot-subject-inventory.json`, ignorado.

## 4. Write exacto

Un `writeBatch`, dos SET sobre documentos **inexistentes**, tratados como CREATE; no transaction ni otros writes:

```js
jointPlans/P/subjects/DIAGn = {
  code: 'DIAGn', proposedParticipantIds: ['owner','one','two','three'],
  addedByUid: 'owner', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
}
jointPlans/P/subjectChecks/DIAGn = {
  revision: 1, actorUid: 'owner', updatedAt: serverTimestamp()
}
```

Todos los timestamps del batch resuelven a request.time. Código nuevo por intento. Harness comprueba tras **cada** intento: ambos existen si pasa, ninguno si falla. No escribe Activity, amistad, parent, índice, slot, instancia ni control durante este batch.

## 5–6. Mapa de validación y crecimiento por participante

| Documento | CONSTANT COST para owner | PER-PARTICIPANT COST |
| --- | --- | --- |
| subject | parent/openPlan; membresía actor owner; instancia owner; check get antes + getAfter; revision/actor/time; schema/code/atribución/timestamps; lista única 2..5 | Para cada agregado no-actor: índice getAfter → slot getAfter → instancia getAfter; UID/status member/lifecycle/catalog |
| subjectCheck | parent/openPlan; membresía actor owner; authority actor; subject get antes + getAfter; revisión propia/actor/time/schema; detectar cambio real | authority por agregado distinto del actor; esquema completo validAuthority + instances/complete |

`added` se deriva de proposedParticipantIds menos los previos; en CREATE equivale a toda la lista. subjectBindingAt/subjectAuthorityAt tienen cinco posiciones acotadas con guard size y skip del actor. No hay búsqueda de todos los slots ni roster global. El actor no-owner costaría índice+slot para demostrar membresía; **no se midió** ese actor aquí.

Lecturas factuales: subject consulta parent, owner instance, check before/after y tres documentos por invitado. Check consulta parent, subject before/after y authority del actor/de cada invitado. `resource`/`request.resource` no son llamadas get. No hay exists en estas dos funciones; existen en preparación NEW/JOIN, fuera del batch estudiado.

## 7. Controles finales

Todas son **ablaciones inseguras sólo para diagnóstico**, no permisos equivalentes. Literales de UID/slot/instancia describen esta fixture fija; no son hints confiados al cliente. Se conserva el mismo batch y estado positivo. PASS significa escritura aceptada bajo esa variante, no garantía preservada.

| Variante (cuatro baseline UIDs) | Escritura | 1000 expressions | Service call error |
| --- | --- | --- | --- |
| Completa | DENY | sí | sí |
| check reducido a true | DENY | no | sí |
| subject reducido a true | PASS | no | no |
| authority reducida a true | DENY | no | sí |
| authority: conservar lectura, omitir schema complejo | DENY | no | sí |
| prueba binding no-owner completa omitida | PASS | no | no |
| índice omitido, slot e instancia conservados | PASS | no | no |
| slot omitido, índice e instancia conservados | PASS | no | no |
| instancia omitida, índice y slot conservados | PASS | no | no |
| schema del subject omitido | DENY | sí | sí |
| atribución/transition del subject omitida | DENY | sí | sí |
| subject→check sustituida por literal válido | DENY | sí | no |
| check→subject sustituida por literal válido | DENY | sí | sí |
| parent sustituido por literal válido | DENY | sí | no |
| iteración binding sustituida por tres llamadas explícitas | DENY | sí | sí |
| iteración authority sustituida por tres llamadas explícitas | DENY | no | sí |

Variantes parent y subject→check incluyen también **Null value error**. No se presentan como controles limpios de presupuesto ni se interpreta ausencia de Service call como ausencia de problema de accesos. Los errores exactos preservados permiten distinguirlos.

## 8. Subject frente a check

CONTROL A subject completo/check reducido: sigue fallando, ahora Service call sin 1000. CONTROL B subject reducido/check completo: pasa. CONTROL C ambos completos: ambos síntomas. CONTROL D cada dirección reducida por separado: no basta; ver errores adicionales en tabla.

Esto demuestra que el check completo **puede** validar cuatro en esta fixture cuando se elimina el coste del subject. No demuestra que 1000 sea un límite independiente del check aislado. El síntoma de expresiones pertenece a la evaluación compuesta; reducir authority/schema o su iteración lo elimina, pero no arregla el fallo del subject.

## 9–10. Slots, índice, autoridad, instancia/binding

Cada invitado añade prueba actual índice→slot→instancia. Omitir sólo una de esas familias permite cuatro con check completo. Omitir authority no lo permite, aunque elimina el síntoma de expresiones. Por tanto no basta reducir la validación de authority para cumplir el contrato.

El coste adicional específico de C es resolver participante/binding desde documentos de índice y slot; el modelo anterior llevaba esos datos en parent. El protocolo heredado añade las lecturas bidireccionales y checks de revisión; no se demuestra que sea innecesario ni que deba conservarse igual. No se midió un protocolo alternativo seguro sin check.

## 11. Posición

Además del orden baseline, se ejecutaron `[three,owner,one,two]`, `[owner,three,one,two]`, `[owner,one,three,two]`, `[one,two,three,owner]`. Todos DENY con ambos síntomas. Cubre extra en primera, intermedias y última, y owner al final. Cambia la ruta del acceso que aparece en algunos mensajes, no PASS/FAIL. No es prueba de todas las permutaciones ni de actor no-owner.

## 12–14. Expressions, service-call y calibración acotada

No se infiere un techo únicamente del texto Service call. Tras la disección se añadieron lecturas distintas a documentos existentes `{ok:true}` en **la condición subject**, sin quitar ninguna comprobación adicional respecto de cada control base:

| Control base (check reducido en ambos) | +0 | +1 | +2 |
| --- | --- | --- | --- |
| Subject completo, owner + dos invitados | PASS | PASS | DENY/service, sin expressions |
| Subject sin índice, owner + tres invitados | PASS | PASS | DENY/service, sin expressions |

Son seis probes, cuatro aceptados y dos rechazados. Al primer rechazo se detiene padding. Los documentos p0/p1 existen con ok=true; sólo varía una lectura extra. Evidencia concordante con presión de access calls por escritura, no una condición académica falsa. El subject completo con cuatro ya falla cuando check es trivial.

Inventario de rutas distintas para owner+dos: parent + check + owner instance + dos*(index+slot+instance) = nueve; con owner+tres: doce. Este inventario y +1/+2 son consistentes con techo por escritura. **No equiparar automáticamente rutas con llamadas facturadas por Rules**, no asumir cómo cachea get/getAfter del check, no afirmar presupuesto agregado exacto ni margen universal. No se hicieron más campañas.

1000 aparece en la regla del check en el compuesto completo, pero no con subject trivial. No se aisló el contador interno por nodo ni si el orden de evaluación/rechazo produce reevaluaciones. Es un síntoma de composición demostrado, no prueba de que reducir expresiones por sí solo solucione el contrato. La variante authority-schema reducida conserva sus lecturas y deja Service call sin expressions, otra separación observable.

## 15–17. Historia, complejidad y duplicación

No se lee occurrence histórica, occupant anterior, Activity ni cycle histórico. Sólo current operational state, authority y pareja subject/check.

Código: crecimiento **lineal en participantes agregados** para lecturas/proofs, con cinco posiciones máximas. Cinco guards son constantes respecto del máximo; el trabajo activo crece con no-actor incluidos. No se identifica un bucle anidado O(n²) ni exploración de historia. Coste interno de list/set/diff y contador de expressions no se deduce como fórmula exacta.

Duplicaciones: parent/openPlan y pertenencia del actor se verifican en ambas mitades; correspondencia actor/time/revisión y cambio se prueban bidireccionalmente. Binding/instancia se comprueba en subject; authority en check: son garantías diferentes, no redundancia que pueda borrarse. En owner el shortcut evita prueba índice/slot del actor; en no-owner habría repetición cuya medición queda fuera.

## 18–19. Causa más estrecha e incertidumbres

**Demostrado:** el tercer invitado que necesita índice+slot+instancia hace fallar la escritura subject aun reduciendo check a true. El padding controlado corrobora presión por lecturas. En composición completa se suma el síntoma expressions; schema/iteration de authority influye en él. No depende del lugar del cuarto UID en las permutaciones probadas ni de historia.

No afirmar que C esté descartada, que subjectCheck sea definitivamente correcto, que el check aislado exceda 1000 ni que los dos límites sean causas independientes. No se midieron caché, contador exacto, margen agregado, actor no-owner, updates con participantes previos ni cinco participantes. Estas incertidumbres no impiden reconocer que una mera reducción de expresiones no elimina el fallo demostrado del subject.

## 20. Direcciones conceptuales, ninguna implementada

| Dirección | Coste que atacaría | Garantía que debe conservar | Riesgo |
| --- | --- | --- | --- |
| A Optimización local equivalente | Expressions/reevaluación | Toda prueba y atomicidad | No elimina las rutas distintas necesarias; podría dejar techo de accesos |
| B Redistribuir proof entre subject/check | Presupuesto por write y duplicación | Ambas mitades obligatorias, revisión/actor/time, autoridad/binding actuales | Trasladar el límite o perder correspondencia |
| C Prueba current-state local de participante | Cadena índice→slot→instancia | Freshness ante release/archive/authority/cambio de catálogo | Certificado stale, nueva superficie de invalidación |
| D Protocolo multietapa | Coste por commit | Ningún estado parcial autoriza propuestas | Cambia atomicidad/contrato; no autorizado |
| E Cambio estructural de subjects | Organización de pruebas/referencias | Hasta cinco, atribución, privacidad y coherencia | Migración/descubrimiento/concurrencia nuevos |
| F Incompatibilidad C/contrato | Reconocer inviabilidad si se demuestra | No reducir seguridad ni cardinalidad | Conclusión prematura con la evidencia actual |

Son categorías solicitadas para decisión, no apertura de otra arquitectura ni recomendación de implementación.

## 21–22. Archivos y tests

Nuevos de este diagnóstico:

- `tests/rules/fixtures/slot-subject-diagnostic.cjs`
- `tests/rules/slot-subject-diagnostic.test.cjs`
- `scripts/test-slot-subject-diagnostic.cjs`
- `docs/slot-subject-diagnostic.md`
- `docs/slot-subject-diagnostic-evidence.json`

Fixture baseline C, fragmento subjects y tests previos NO modificados. Ningún archivo productivo modificado por esta sesión. SHA256 firestore.rules conservado: `7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.

Última ejecución: `node scripts/test-slot-subject-diagnostic.cjs` → **19 tests de diagnóstico PASS, 0 FAIL**, 31 intentos registrados. Es éxito de la ejecución/registro, **NO** significa que 31 caminos funcionales pasen ni que cuatro esté corregido. Baseline assertions exigieron 2/3 PASS y 4 DENIED; variantes registran resultados sin fabricar expectativas de seguridad. Cada batch rechazado comprobó ausencia de ambas mitades.

Los 31 intentos: baseline3 + cardinalidad sin owner3 + padding6 + familias15 + permutaciones4; **12 escrituras aceptadas y 19 denegadas**. Baseline inicial independiente 1 test PASS; disección intermedia 17 PASS; no se suman a los 19 finales. Logs ignorados `.tools/slot-subject-baseline.log`, `.tools/slot-subject-dissection.log`, `.tools/slot-subject-diagnostic-final.log`.

Sintaxis de los tres archivos CJS, whitespace de los cinco archivos nuevos y `git diff --check`: PASS. Git sólo avisa normalización LF/CRLF en archivos preexistentes. `git status --short` reconfirmado: cambios acumulados preservados, más estos cinco archivos nuevos; working tree no limpio, sin stage/commit.

Sin suite global/build, por ser diagnóstico aislado. Sin producción, Console, integración, migración, publicación, deploy, commit, push ni Etapa7. Protected new-account bootstrap continúa como release blocker separado.

**DIAGNOSIS SUFFICIENT — READY FOR ARCHITECTURAL DECISION**

STOP para revisión; no autoriza implementación ni integración.
