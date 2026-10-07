# Comparación aislada: invitation children, certificate y fases

Fecha: 2026-09-30. Base: 96de41a + working tree acumulado. No integración.

## Alcance y método

Se preservó la arquitectura distribuida anterior, sus FAIL y todos los archivos
productivos. No se movieron helpers para ahorrar evaluaciones. Cada variante parte
de las Rules completas actuales y carga las extensiones de invitation/JOIN y
friendship Activity. A cambia la representación por children; B introduce un
certificate de creación. Ambas mantienen el schema global de CREATE E, autoridad,
owner operativo, catálogo y bindings. No se usa una fixture mínima de permisos.

El primer paso es una puerta de viabilidad CREATE 1..4 × directa/inversa/mixta.
STOP automático ante el primer fallo contractual: se conserva la expectativa de
éxito y se comprueba ausencia de todas las escrituras del commit fallido. Conforme
al pedido, tras ese STOP no se ejecuta el resto de la matriz, negativos o carreras
de esa alternativa. B se evalúa sólo después del NO-GO de A.

Corrección de harness: el constructor heredado usaba un cycleId común para varias
amistades. En estas nuevas suites se asigna un ciclo diferente por relación y se
siembra su reserva, sin cambiar Rules ni expectativas. Los conteos de cierre son
los de la repetición con ciclos distintos; los primeros intentos no sustituyen esa
revalidación. Cada fixture tiene una sola orientación por pareja; direct/inverse
prueban lectura de orientaciones existentes, no autorización de nuevos duplicados.
El generador canónico de relaciones permanece cargado e intacto.

## A. Versioned invitation children

### Schema e identidad

Ruta: `jointPlans/{planId}/invitations/{occurrence}`. Campos exactos:
`inviteeUid`, `invitedBy`, `friendshipCycleId`, `occurrence`, `createdAt`.

El plan es implícito en la ruta. El ID debe ser `string(occurrence)` y occurrence
un entero positivo acotado. No se agrega status mutable ni binding duplicado: el
binding relevante vive en participants del parent y se verifica al crear el child.
Child update/delete están cerrados en la fixture. La política final de retención
requiere diseño de cleanup, no constituye autorización ni se implementa aquí.

CREATE usa serial=N y occurrences 1..N. Parent exige child nuevo en cada ruta exacta;
child exige UID en parent y coincidencia UID/inviter/cycle/occurrence. Esto vincula
cada slot del parent con un único documento. ID opaco requeriría un índice o reserva
adicional para demostrar unicidad: sin esa prueba no es equivalente ni se recomienda.
Otro ID derivado de UID+occurrence sería posible, pero necesita las mismas pruebas
de unicidad global y no fue prototipado.

### CREATE y Activity

Un commit: parent + N children + N avisos (9 escrituras al máximo contractual).
Parent conserva invariantes globales y exige children frescos. Cada child valida:
fuente creada en post-state, UID, inviter autenticado, cycle vigente accepted,
authority, binding pendiente exacto y aviso nuevo obligatorio.

Activity conserva schema estricto/readAt/timestamp, ID `jp_PLAN_OCCURRENCE`, y
comprueba child nuevo, destinatario/inviter/cycle/occurrence exactos. El enlace es:
parent → child → aviso → child; el child también depende de la transición del
parent. Ningún documento aislado debería bastar. Es un argumento del diseño,
NO una sustitución del corpus negativo que quedó sin ejecutar por STOP.

### INVITE, reinvite y JOIN

Diseño de continuación: incrementar serial una vez y crear child+aviso nuevos en
el mismo commit de modificación del parent. X permanece inmutable; Y usa otra
occurrence tras C2. No modificar cycle de X. El actor debe ser owner o miembro
operativo; su amistad con invitee es la relevante.

El prototipo incluye lookup de una sola occurrence para JOIN, obtenida del pointer
actual del parent. Exige UID/inviter/cycle/occurrence coincidentes y conserva las
comprobaciones actuales de amistad, plan abierto, authority, binding/catalog y
membership. No se escanean children. Ese JOIN no se ejecutó aún: CREATE detuvo A.
INVITE/reinvite todavía no se conectaron al nuevo child; las rutas heredadas no se
presentan como implementación terminada de A ni como evidencia validada.

### Resultado, budgets, negativos y concurrencia

1..3 × las tres orientaciones PASS. Primer camino fallido: 4 directa, con
`permission-denied`, máximo de 1000 expresiones y `Service call error`.
No hubo parent, children ni Activities parcialmente escritos tras el rechazo.
STOP A: 4 inversa/mixta, calibración numérica, negativos, replay y concurrencia de
esta variante NO EJECUTADOS. No se infiere que esas dos orientaciones fallan también.
No se atribuyen cifras por write/agregado/margen: no fueron calibradas.

**A = NO-GO para esta variante en composición completa.** No demuestra imposibilidad
matemática de toda representación con children; no se la microoptimizó tras el fallo.

## B. Manifest/certificate por creación

### Schema, lifecycle y atomicidad

Ruta `jointPlans/{planId}/invitationManifests/create`. El ID fijo reserva la única
certificación de creación de ese plan. Campos exactos: `inviteeIds`, `invitedBy`,
`invitationCycles`, `invitationOccurrences`, `participants`, `invitationSerial`,
`createdAt`. Plan implícito en path; owner/catalog se validan en el parent, no se
copian sin necesidad. El actor crea el certificate junto con parent y avisos.

Un commit: parent + certificate + N avisos (6 escrituras al máximo). Parent mantiene
CREATE E global y requiere certificate fresco. Certificate exige parent inexistente
antes/existente después, owner autenticado, igualdad exacta de sus mapas/listas con
parent, occurrences por índice, inviter correcto y aviso fresco por cada UID.
Activity mantiene sus verificaciones completas contra parent. Por transitividad de
las Rules de la misma transacción, parent/manifest/avisos se exigen mutuamente.

Certificate sólo create, sin reads de cliente/update/delete. No se usa como
capability: JOIN conserva amistad/cycle actual, authority, binding, catálogo y plan
abierto. No sustituye esas consultas. No se implementó cleanup. Reutilizar el ID
histórico no debe servir para recrear el parent; las reservas/tombstones anteriores
siguen presentes. Un futuro certificate por INVITE requeriría generation/serial
nuevo y no puede reutilizar `create`; no se implementó tras el STOP.

### Resultado y límites de evidencia

1..3 × directa/inversa/mixta PASS. 4 directa falla con `permission-denied`, máximo
1000 expresiones y `Service call error`. Se comprobó rollback de las seis escrituras.
STOP B antes de 4 inversa/mixta y del corpus negativo/calibración/concurrencia.
No se midió margen ni un coste numérico por documento. La copia exacta de maps
es parte del diseño, no prueba empírica de negativos que no llegaron a ejecutarse.

**B = NO-GO para esta variante.** No se convirtió B silenciosamente en fases.

## Interpretación rigurosa de errores

Demostrado: los caminos indicados válidos fallan con ambas clases de diagnóstico;
los commits fallidos no dejan documentos parciales. La validación de bajo fan-out
no acredita el máximo contractual.

Inferido: repartir validaciones en nuevos documentos añade dependencias verificables
pero no garantiza reducir coste agregado de la composición. NO se determinó qué
límite ocurre primero ni se extrapolan los +0/+1 de la arquitectura anterior a A/B.
No hay contador exacto de expresiones ni una calibración interpretable nueva tras
STOP. No se retiró ninguna condición para transformar el resultado en PASS.

## C. Protocolo por fases — concepto, no implementación ni GO

A/B no cumplen; se analiza C, sin adoptar nombres/schema ni implementar fases.
La opción conservadora para discutir sería:

1. **Preparación privada e inerte.** Registrar intención y datos inmutables de
   generación, participantes, catálogo y occurrences; validar su estructura por
   operaciones acotadas. No conceder JOIN, no mostrar plan operativo, no emitir
   Activity de invitación activa. El owner puede ver progreso de preparación.
2. **Preparación completa, todavía inerte.** Demostrar conjunto exacto de los slots
   esperados y sus documentos. Prohibir mutaciones que sustituyan el contenido
   preparado; cambiar decisiones requiere generación nueva o cancelación explícita.
   La evidencia preparada prueba estructura/historia, nunca autorización actual.
3. **Activación observable atómica.** Cambiar a operativo y emitir los avisos
   correspondientes juntos, revalidando amistad/cycles y todos los estados actuales
   necesarios. Una retirada/archive/close/cambio de binding previo debe invalidar
   la activación. JOIN siempre revalida autorización actual después de activación.

Esta secuencia mantiene seguridad conceptual, pero **su activación NO tiene
presupuesto demostrado**. Puede reproducir el mismo límite: NO se vende C como
solución técnica resuelta. Se necesita un nuevo diseño y prueba antes de recomendarla.

Retries: IDs y generación fijos por intento lógico, relectura del estado tras error,
comparación exacta del contenido; no crear otra occurrence por retry de red.
Recovery: retomar sólo una preparación reconocida y vigente o cancelarla; si cambió
el cycle exigir nueva decisión explícita. Cancelación/preparación huérfana no autoriza
nada, aunque nunca se limpie. Cleanup no participa de autorización.

Concurrencia: la transición final debe tener precondiciones de estado/generación;
no basta un certificado creado antes de withdrawal. La serialización decide si
withdrawal ocurre antes o después de activación; después, JOIN debe rechazar el ciclo
invalidado sin expulsar miembros existentes. Estos puntos son requisitos, no tests.

### Decisión contractual requerida

Hoy toda creación se exige en un solo commit. C persiste preparación antes de éxito:
cambia atomicidad de almacenamiento, operaciones del cliente, recovery/cancelación
y UX de preparación. Incluso manteniendo una activación observable final atómica,
ese cambio necesita aprobación explícita antes de integración.

Emitir avisos antes de activar, mostrar planes incompletos como operativos, o activar
invitaciones individualmente para eludir el fan-out NO se adopta: contradice las
restricciones actuales. Si la activación final tampoco cabe, hay que volver a una
decisión contractual; no eliminar current authorization ni introducir backend/billing.

## Comparación A/B/C

| Aspecto | A: children | B: certificate | C: fases conceptuales |
| --- | --- | --- | --- |
| Seguridad | Prueba por occurrence + estado actual | Evidencia histórica exacta, nunca authority | Preparación inerte + revalidación al activar |
| Expressions | Falla CREATE 4 directa | Falla CREATE 4 directa | No probado |
| Access calls | Service call error; sin cifras aisladas | Service call error; sin cifras aisladas | No probado; activación podría repetir límite |
| Atomicidad | Un commit | Un commit | Preparación múltiple + activación propuesta atómica |
| Rules | Enlaces parent/child/aviso | Igualdad parent/manifest + avisos | Máquina de estados y generaciones |
| Cliente | Batch de 9 writes máximo | Batch de 6 writes máximo | Orquestación y reanudación nuevas |
| Storage | Un child histórico por occurrence | Un certificate histórico por creación | Preparaciones/generaciones adicionales |
| Concurrencia | Pendiente por STOP | Pendiente por STOP | Precondiciones y serialización por demostrar |
| Recovery | Relectura del commit; no retry con nueva occurrence | Igual, certificate no concede derechos | Retomar/cancelar generación explícita |
| Legacy | Sin migración ni integración probadas | Sin migración ni integración probadas | Bridge/UX/rollout nuevos por definir |
| Activity | Child exacto + occurrence | Parent/manifest/avisos atómicos | Sólo después de activación observable |
| JOIN | Lookup de un child + estado actual | Estado actual; certificate no sustituye permisos | Sólo activo + estado actual |
| Reinvite | Nuevo child/occurrence; pendiente | Nuevo certificate por transición; pendiente | Nueva generación si cycle cambió |
| Mantenibilidad | Más rutas/enlaces que proteger | Más equivalencias exactas que proteger | Mayor complejidad de estados |
| Margen futuro | No demostrado | No demostrado | No demostrado |

## Recomendación, riesgos y alcance legacy

No integrar A ni B; no elegir por cantidad de líneas/documentos. Llevar C a decisión
de producto/contrato como alternativa por investigar, no como solución ya viable.
No se modifican friendship global/canonical/no-reuse, ni sharing/membership, ni
selection como contexto. Activity e historia nunca equivalen a acceso académico.
No se fabrican instancias. Existing members no se expulsan por retirada: los cambios
prototipados se limitan a emisión/entrada, no a remoción de miembros.

El historial legacy sin cycle/occurrence demostrables permanece sin conversión
implícita. No hay migración real, convivencia validada ni navegación histórica nueva.
El protected new-account bootstrap sigue como RELEASE BLOCKER independiente.

## Evidencia y archivos

Repetición final con ciclos únicos: A = 11 entradas, 9 PASS / 2 FAIL; B = 11 entradas,
9 PASS / 2 FAIL. Total 22 entradas, 18 PASS / 4 FAIL. Cada suite cuenta el caso
`4 direct` fallido y su contenedor; son 20 casos hoja: 18 PASS / 2 FAIL.
Las dos orientaciones restantes de cuatro invitados en cada suite no se ejecutaron
por STOP, no son PASS ni FAIL observados. Ambos runners terminaron con exit code 1
y clean shutdown. Los intentos anteriores con cycles compartidos no son la evidencia
final. Los FAIL válidos permanecen FAIL; no se cambian expectativas.

Sintaxis y whitespace de archivos nuevos se verifican al cierre, además de
`git diff --check` y estado Git. No se ejecuta Node/build global como evidencia de
una integración que no existe. SHA256 de Rules productivas conservado:
`7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.

Nuevos: fixture `tests/rules/fixtures/invitation-architecture-alternatives.cjs`,
suites `tests/rules/invitation-architecture-alternatives.test.cjs` y
`tests/rules/invitation-manifest-architecture.test.cjs`, runners
`scripts/test-invitation-architecture-alternatives.cjs` y
`scripts/test-invitation-manifest-architecture.cjs`, y este documento.
Los runners están aislados al proyecto demo y loopback. Se preservan las copias
anteriores y el working tree. Sin producción, publicación, commit, push o Etapa 7.

**Arquitectura: NO-GO para integrar A/B; C no probado y sujeto a decisión.**
Siguiente paso: revisión de esta evidencia y decisión explícita sobre preparación
persistente antes de diseñar/probar la activación de C. STOP para revisión.
