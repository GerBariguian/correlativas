# C — expansión aislada: RELEASE, REASSIGN y subjects

2026-10-01. Fuente previa: `docs/slot-prototype-report.md`.

**STOP: CANDIDATE C READY FOR INTEGRATION REVIEW: NO.**

La traducción mínima de subject + subjectCheck falla en un camino válido con cuatro participantes. No se redujo el máximo contractual, no se cambiaron expectativas, no se microoptimizó ni se abrió otra arquitectura. Esto refuta la preparación de ESTA composición, no demuestra imposibilidad matemática de toda alternativa C.

## 1. RELEASE

PROTOTIPADO: retirada voluntaria del propio UID pending/member, equivalente mínimo de abandonar/rechazar participación propia. Requiere instances/complete, schema30 y no deleting. No exige instancia activa para retirarse. Cancelación por owner/inviter o expulsión: DECISIÓN DE PRODUCTO REQUERIDA, no implementada.

Dos writes: slot empty, punteros/binding null, revision incrementada; índice operacional eliminado. Cada write verifica la otra mitad. El índice no es archivo histórico. Occurrences y Activity no se borran. Las dos omisiones parciales rechazan y dejan slots/index/occurrences intactos.

Withdrawal, archive y close NO disparan RELEASE. No confundir freshness con capacidad. La condición propuesta permite retirada voluntaria en closed, mientras no deleting, pero ese caso no fue probado: PENDIENTE.

## 2. REASSIGN

PROBADO: A/one se retira, B/two adquiere slot1 con NEW completo: slot + índice propio + occurrence nueva + Activity nueva. B ingresa pending/binding null, sin heredar ciclo/binding. Índice A ausente, índice B correcto, JOIN A/XA rechaza; JOIN B/XB pasa.

## 3. Reuse repetido

PROBADO: A → release → B → JOIN → release → C/three → JOIN. Revision final 5: NEW/RELEASE incrementan, JOIN conserva. No hay reinicio al liberar. INFERIDO por código: coste independiente de historia porque sólo consulta rutas actuales; la prueba usó tres occupants, no historia arbitrariamente larga ni calibración de padding.

No se añadió generación separada. Revision persistente y occurrence irreutilizable distinguen las épocas probadas; no se acredita todavía todo el contrato productivo.

## 4. Concurrencia

Cinco carreras probadas: release/JOIN, release/REINVITE, release/acquisition B, release duplicado, B/C sobre slot recién liberado. Estado capturado compartido, sin retry externo de permission-denied. Comprobados slots/índices coherentes. En la ejecución final ganó release en las primeras cuatro y B en la última: no representa ambos órdenes posibles.

JOIN seguido de release puede permitir ambos commits porque la retirada de member es legítima; ese test no impone un único éxito. REINVITE cambia revision e invalida un release capturado. Acquisition B capturada antes del release no puede reemplazar A pending. Duplicar release no vuelve a incrementar revision.

El log final incluye un ABORTED/Transaction lock timeout intermedio del SDK; los resultados rechazados finales fueron permission-denied. No se atribuye el transporte a budgets. Auditoría exhaustiva de Activity/occurrences del perdedor en estas nuevas carreras: PENDIENTE.

## 5. Occurrences/history

PROBADO: XA y Activity XA conservan valores tras A→B→C y siguen legibles por A. Plan e identidad propia están en la ruta; UID, inviter, cycle, revision y slotId en occurrence. SlotId histórico no demuestra ocupación vigente. Binding operativo procede del slot actual, no de XA.

Stale JOIN A y stale resurrection A después de B rechazan. Matriz completa cross-plan/cross-UID/puntero inexistente en composición expandida: PENDIENTE; no reutilizar resultados anteriores como revalidación.

## 6. Subjects

Se conserva el protocolo de dos writes, revisión/actor/timestamp cruzados, atribución inmutable y cardinalidad **2..5**. subjectCheck verifica authority; subject verifica binding de nuevos participantes. Cada no-owner se resuelve mediante índice → slot member actual → instancia activa del catálogo. Owner usa ownerInstanceId. No usa selección, historia, amistad ni sharing.

Se conserva la comprobación de participantes agregados del protocolo anterior. La semántica de referencias preexistentes tras release/archive NO quedó cerrada. Este fragmento mínimo no implementa servicio productivo, lectura, delete/drain.

| Cardinalidad | Observación |
| --- | --- |
| 1 | Rechaza con 1000 expressions en check: no prueba rechazo lógico puro |
| 2, owner + one | PASS |
| 3, owner + one + two | PASS |
| 4, owner + one + two + three | Camino válido FAIL: Service call error y 1000 expressions |
| 5 | No ejecutado por STOP; máximo contractual no cambia |

Los cuatro invitados fueron creados y unidos mediante writes autorizados antes de la prueba. No se sembraron slots/bindings para saltar permisos. Tras fallo de 4 se verificó con harness admin del Emulator que no existen subject NI subjectCheck: batch sin estado parcial.

## 7. Archive

PENDIENTE matriz archive/restore/otros miembros. El helper conserva lifecycle active para nuevas asignaciones; archive no ejecuta release. No se afirma validación de restore sin sharing ni suspensión global del plan.

## 8. Sharing

No se añadieron permisos de snapshots/statusMap/sharing ni lecturas académicas cross-user. PENDIENTES controles de aislamiento y no transitividad bajo composición expandida. Membership no se propone como consentimiento.

## 9. Authority

Se reutiliza instances/complete sin selección, también en RELEASE. Positivos nuevos usan ese control real de fixture. Matriz legacy/frozen/spoof expandida: PENDIENTE, no presumida por conservar helpers. Historia no fabrica trayectorias.

## 10. Legacy

PROPUESTA, no implementación: planes existentes mantienen interpretación legacy, planes C nuevos discriminados explícitamente, sin conversión desde cliente. El fixture reemplaza el bloque de planes sólo en memoria y NO acredita coexistencia productiva. No migración ni decisión implícita sobre datos históricos.

## 11. Schema/generation

Schema30 exclusivamente experimental; parent updates denegados, sin conversión legacy→C. La matriz schema confusion queda pendiente. Revision local persiste al liberar; occurrence histórica no se reutiliza. Ningún schema productivo adoptado.

## 12. Navigation

El fixture sólo prueba gets puntuales. Cuatro IDs de slot fijos permiten lecturas acotadas del roster sin recorrer historia, pero no resuelven discovery de planes por usuario. Listados, invitaciones pendientes, índices necesarios y navegación tras retirada: PENDIENTES.

Activity puede aportar una ruta histórica para intentar resolver un plan, nunca autorización. El índice con sólo slotId y UID en document ID no demuestra aquí una collection-group query autorizable por usuario. No se inventó un índice de discovery ni se afirmó viabilidad integral de navegación.

## 13. Privacy

Permisos experimentales previos conservados: índice propio/owner; occurrence invitee/inviter; Activity privada; slot owner/UID propio/actor operativo. Al borrar índice A deja de satisfacer la lectura del parent basada en existencia (INFERIDO, sin test específico); sí se comprobó lectura de historia XA.

No se acredita equivalencia completa con privacidad legacy ni listados seguros.

## 14. Close/delete

Close debería cambiar sólo parent; openPlan ya condiciona NEW/REINVITE/JOIN/subjects. La transición no fue implementada/probada por STOP. Historia debe conservarse.

Delete/drain NO implementado. Occurrences inmutables exigen decisión de retención/purga protegida. Borrar sólo parent dejaría subcolecciones; no se asume que el drain/tombstone actual cubra estos subdocumentos. Sin Cloud Functions ni borrados reales.

## 15. Activity

NEW/reassignment mantienen occurrence + Activity. Release no crea tipo nuevo ni elimina historia. XA preservada. ReadAt, navegación historical/stale y regresión completa de amistad Activity: PENDIENTES. REINVITE en carrera no sustituye su matriz positiva completa.

## 16. NEW/REINVITE/JOIN regression

NEW/JOIN reales pasan con cuatro slots en preparación y en A→B→C, con subjects cargados. No equivale a repetir directa/inversa/mixta, no-owner, capacidad y duplicate UID. Suites originales intactas, no reejecutadas después del STOP. No presentar evidencia congelada como validación de composición final.

## 17. Expressions

OBSERVADO: negativo de 1 participante alcanza 1000; válido de 4 también informa 1000 en check. Válidos 2/3 pasan. No se midió número exacto ni se aisló si el mensaje del check es causa primaria o consecuencia de la denegación del subject. No atribuir causalidad única al error mixto.

## 18. Access calls

OBSERVADO: cardinalidad 4 falla con Service call error en getAfter users/three/careerInstances/i_three. Sin padding nuevo ni margen no-owner medido. No extrapolar márgenes del fixture anterior.

INFERENCIA ESTRUCTURAL: subject necesita parent, check, instancia owner y tres rutas por cada no-owner (índice, slot, instancia). Tres no-owner implican al menos 12 rutas distintas en esa rama, antes de discutir get/getAfter del check; consistente con presión sobre límite por escritura. No es medición independiente de caché ni presupuesto exacto del batch. No se redistribuyeron comprobaciones ni se agregó certificado para esquivar STOP.

## 19. Clasificación

- Release parcial slot/index, stale JOIN y stale restore: permission-denied sin B/C, pero con evaluation error. Condiciones falsas identificables en código; mensaje no acredita rechazo booleano puro A. Calidad diagnóstica D/evaluation pendiente.
- Cardinalidad 1: C, no A.
- Cardinalidad válida 4: evidencia B/service-call y C/expressions, causalidad no aislada; no es un negativo de seguridad.
- Carreras: rechazos finales sin B/C. ABORTED intermedio separado como D/transporte.

No se alteraron expectativas para conseguir verde.

## 20. Suites/resultados

- Antes de subjects: **1 test Node PASS/0 FAIL**, cinco carreras y cuatro negativos internos. Sólo evidencia intermedia.
- Última composición: **2 tests Node, 0 PASS/2 FAIL**. Primero falla rechazo sin exhaustion de cardinalidad1; segundo falla camino válido de cardinalidad4. Gates internos release/reuse/carreras y subjects2/3 pasaron, pero no cuentan como tests Node verdes.
- Reproducción: `node scripts/test-slot-expansion.cjs`. Runner aislado demo-correlativas-rules, loopback8088; sin producción. Emulator cerrado al finalizar.
- Windows aquí usa `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Users\Bariguian\Downloads\GB\PROYECTOS\correlativas\.tools\java-tcp-only-no-socket-directory` para evitar socket Unix; no crear ese directorio.
- Evidencia ignorada: `.tools/slot-expansion.log`, `.tools/slot-expansion-subjects.log`, `.tools/slot-expansion-final.log`; Rules compuestas `.tools/slot-expansion.rules`.
- Suites globales/históricas, build y padding posteriores NO ejecutados por STOP; no se afirma cierre de Etapa6.

## 21. Decisiones pendientes

Cancelación por owner/inviter, retirada bajo estados especiales, retención histórica, referencias de subjects tras retirada, discovery, coexistencia legacy y cleanup. No convertidas en comportamiento implícito.

## 22. Blockers

Camino válido de cuatro de los cinco participantes requeridos falla: candidato actual NO listo. Requiere revisión antes de optimizaciones. Protected new-account bootstrap continúa como RELEASE BLOCKER separado de v1.16.

## 23. Archivos

Nuevos: `tests/rules/fixtures/slot-expansion.cjs`, `tests/rules/fixtures/slot-subjects.fragment.rules`, `tests/rules/slot-expansion.test.cjs`, `scripts/test-slot-expansion.cjs`, `docs/slot-expansion-report.md`.

Actualizado para enlazar este resultado: `docs/slot-prototype-report.md`. Evidencia anterior intacta. Todos los cambios previos del working tree preservados.

SHA256 firestore.rules antes/después: `7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`. Ningún cambio de esta fase en Rules productivas, servicios, UI o migración.

## 24. Dictamen

**CANDIDATE C READY FOR INTEGRATION REVIEW: NO.** STOP para revisión. No producción, publicación, deploy, commit, push ni Etapa7.
