# Etapa 6 — diseño y prototipo aislado del guardado de propuestas

Base `96de41a`. Este documento NO autoriza integración, publicación o migración.
El [checkpoint anterior](multicareer-sharing-jointplans-checkpoint.md) y sus ocho
pruebas 10 PASS / 11 FAIL se conservan como evidencia histórica del bloqueo.

## 1. Causa y alcance demostrado

Una escritura de subject que verifica directamente cinco personas consulta
el plan, cinco controles y cinco instancias: once recursos distintos. La prueba
original reproduce la denegación y el control de diez recursos permitido.
Eliminar expresiones repetidas no elimina esas once fuentes independientes.

Esta fase demuestra exclusivamente un protocolo alternativo de **create/update
de un subject**, con cinco personas, fuentes actuales y bindings preestablecidos.
No implementa create/invite/join multicarrera, sharing, snapshots, UI o migración.
No presenta las fixtures administrativas como prueba de creación segura de planes
o de bootstrap. Tampoco certifica anticipadamente el presupuesto de esas otras APIs.

## 2. Alternativas comparadas

| Familia | Representación y transición | Evaluación |
|---|---|---|
| A. Certificado compacto del estado operativo | Un documento por persona/binding con authority, lifecycle y catálogo certificados | Descartada como autorización persistente autónoma: freeze, archive o cambios del plan pueden volverlo obsoleto. Verificar las fuentes al usarlo recupera el presupuesto original. |
| B. Cada participante certifica al entrar | Binding histórico escrito por su propietario al join | Necesaria para identidad, insuficiente para operatividad actual. Un join válido no demuestra que siga activo después de archive/freeze. Exigir renovar antes de cada propuesta cambia el flujo y tampoco elimina la carrera entre renovación y uso. |
| C. Vista operativa materializada y sincronizada | Copia actualizada atómicamente con todas las fuentes | Sin lectura de fuentes necesita invalidación exhaustiva. Authority es user-scoped y puede afectar N instancias/planes; Rules no enumera ese fan-out. Introduce coordinación de migrador/lifecycle o backend fuera del alcance. Un epoch que obliga a leer fuentes vuelve a consumir accesos. |
| D. Preparación persistida y commit posterior | pendingProposal más certificaciones, luego subject | Preparación puede ser inocua, pero el commit debe revalidar las cinco fuentes actuales. Confiar en preparación introduce stale/replay; revalidar vuelve a once. Añade basura, recuperación y fases sin solucionar por sí sola el límite. |
| E. Dos escrituras vinculadas en un único commit | Subject + comprobante de operación en path determinista | Recomendada para el guardado: cada Rule comprueba una parte y exige la transición de la otra escritura. No persiste una autorización reutilizable ni hay fase intermedia aceptada. |

No se eligió dividir el guardado en commits separados. No se necesita backend,
Cloud Functions, billing, servicio de certificación ni cambios de bootstrap.
Las familias A–D podrían reformularse con otra infraestructura, pero no están
demostradas como alternativas viables bajo los contratos actuales. Por eso no
se presentan números ficticios de presupuesto para ellas.

## 3. Schema conceptual elegido

El subject conserva exactamente su sobre actual:

```text
jointPlans/{planId}/subjects/{code}
  code
  proposedParticipantIds
  addedByUid
  createdAt
  updatedAt
```

Documento auxiliar propuesto (solo existe en el prototipo):

```text
jointPlans/{planId}/subjectChecks/{code}
  revision: integer positivo, <= MAX_SAFE_INTEGER
  actorUid: uid del escritor de esta operación
  updatedAt: request.time
```

Identidad implícita por planId/code; no duplica statusMap, instancia, catálogo,
consentimiento o booleano operativo. Es un comprobante con contador de transición,
no un certificado vigente. Sus campos son propuestos por el cliente pero Rules
no confía en ellos como evidencia de authority, lifecycle, ownership o binding.

Fuentes de verdad: plan para roles/cierre/bindings, migrationUsers para authority,
careerInstances en el path del UID para catálogo/schema/lifecycle. Subject es la
decisión colaborativa; el check solo obliga a ejecutar las dos evaluaciones juntas.

## 4. Protocolo exacto

1. Abrir una transacción para un único subject y su check del mismo plan/code.
2. Leer ambos documentos. La lectura se autoriza por membership existente.
3. Si la misma decisión ya está persistida, devolver `unchanged` sin escritura.
   Es una confirmación de historia legible, no una nueva autorización académica.
4. Conservar addedByUid/createdAt anteriores; preparar el subject con updatedAt
   servidor. Preparar check con revision anterior + 1, o 1 si no existe,
   actorUid autenticado y updatedAt servidor.
5. Escribir **ambos en el mismo commit**. No se modifica el plan para certificarlo.
6. Rules de subject valida autenticación social, actor miembro, plan abierto,
   binding/instancia actual del actor y de cada NUEVA asignación. Comprueba forma,
   atribución, límites y que el check antes/después avanzó exactamente una revisión
   para el mismo actor/request.time.
7. Rules de check valida el mismo plan abierto/actor y authority instances/complete
   con el decoder real para actor y nuevas asignaciones. Exige subject antes/después
   distinto y actualizado a request.time. No autoriza crear check sin cambiar subject.
8. Si cualquier condición falla, no se escribe ninguno. El cliente conserva la
   decisión local y reporta error; relee/reintenta sin fingir guardado exitoso.

Las instancias y controles se leen con getAfter, también para impedir el bypass
archive + propuesta en un mismo batch. El plan también se evalúa después del commit.
La unión del actor y nuevos destinatarios tiene como máximo cinco personas del plan.
El actor no se evalúa dos veces si también es destinatario.

## 5. Historia y lifecycle

Nuevas asignaciones = lista posterior menos lista anterior. Es importante no
volver a exigir operatividad a destinatarios históricos retenidos: eso bloquearía
al resto cuando alguien archive. Para crear subject, todos son nuevas asignaciones.
El actor siempre debe ser operativo, aunque no figure como destinatario.

- Archivar no modifica ni borra subject/check/binding, ni cierra el plan.
- Retener una asignación histórica archivada está permitido al editar otros destinos.
- Quitarla y volver a agregarla es una nueva asignación y requiere operatividad.
- Dueño archivado no bloquea a los otros miembros operativos.
- Restore permite una operación nueva si las fuentes actuales son válidas; un plan
  cerrado sigue cerrado. El check no modifica ni interpreta sharing.
- Membership o binding modificados se consultan nuevamente; ninguna prueba se
  basa en un booleano histórico almacenado en check.
- Los estados unresolved/catalog-unavailable no habilitan nuevas asignaciones.

El prototipo contiene una transición mínima de lifecycle y cierre solo para
ensayar carreras y getAfter. NO reemplaza Rules de Etapa 5: no modela selección,
consentimiento, fechas de archivo ni un flujo completo de restore. La futura
integración debe conservar esas validaciones adicionales.

## 6. Atomicidad, replay y recuperación

No se pierde ninguna invariante atómica y no existe preparación persistida.
Subject solo: denegado. Check solo: denegado. Otro plan/code: denegado. Un check
no certifica dos subjects. El contador anterior debe cambiar en la misma operación;
la presencia de un check viejo y su timestamp no son suficientes.

La validación del check exige un cambio real del subject (incluida su fecha de
edición), no solo coincidencia de timestamp. Esta dependencia mutua se verifica
contra estados antes/después; no depende del orden de las escrituras cliente.

Cerrar antes de enviar no persiste nada. Si se pierde la respuesta al commit,
releer permite distinguir decisión ya guardada de pendiente; el cliente prototipo
no vuelve a escribir la misma lista. Reenvío con revisión anterior se rechaza.
Una nueva edición legítima usa revisión siguiente y revalida todas sus fuentes.
No hay incremento arbitrario, borrado/reset cliente del contador ni estado a reparar.

## 7. Concurrencia

Dos ediciones del mismo subject usan CAS por lectura transaccional de subject/check.
Pueden serializarse o una puede recibir permission-denied/aborted antes del retry
del SDK; se exige error explícito y coherencia, no que ambas siempre tengan éxito.
El test verifica contador acorde a commits aceptados y relectura/reintento posterior.

Archive, cierre, pérdida de membership, cambio de catálogo/binding o freeze después
de preparar el cliente se reevalúan al commit. Los tests fuerzan interleavings con
esas transiciones antes de escribir. Las modificaciones administrativas se usan
solo como inyección controlada de cambios de fuente; nunca como flujo cliente.

Si save se confirma antes de archive, queda una asignación histórica válida; si
archive precede al save, no se acepta una asignación nueva. Restore anterior al
commit permite reevaluar correctamente. Restore no reabre un plan cerrado.

## 8. Presupuesto exacto del prototipo

N = personas distintas que necesitan comprobación actual: actor + destinatarios
nuevos distintos del actor, máximo 5. La tabla cuenta invocaciones get/getAfter
del código en el camino permitido, **sin descontar caching**; no es facturación.

| Escritura/operación | Lecturas de Rules | Máximo |
|---|---|---:|
| Subject | planAfter + checkBefore + checkAfter + N instanciasAfter | 3 + N = 8 |
| Check | planAfter + subjectBefore + subjectAfter + N controlesAfter | 3 + N = 8 |
| Commit completo de un subject | suma de las dos filas | 6 + 2N = 16 |
| Actor + 1 nueva persona | 5 por escritura | 10 total |
| Actor + 4 / cuatro destinos y actor quinto | 8 por escritura | 16 total |
| Solo actor actual al editar historia sin nuevas asignaciones | 4 por escritura | 8 total |
| Reintento no-op | ninguna escritura | 0 comprobaciones de escritura |
| Lectura cliente de subject o check | get(plan) para membership | 1 por lectura |

Las lecturas SDK son requests aparte; no se confunden con lecturas de Rules del
commit ni con unidades facturadas. En el máximo hay 15 combinaciones distintas
path/estado, porque planAfter se consulta en ambas reglas. La cota 16 no necesita
ese ahorro. Ninguna escritura supera 10, y el commit no supera 20.

Actor solo con una única asignación se **rechaza**: se preserva el mínimo vigente
de dos destinatarios. No se cambió ese requisito para hacer pasar un test.
No se promete agrupar N subjects en un batch ilimitado; el protocolo cliente
propuesto es una decisión por transacción. Una futura API de guardado masivo
necesitaría su propio presupuesto y contrato.

No se extrapola 16 a create/invite/join, Activity o eliminación del plan. Esas
operaciones tienen documentos e invariantes distintos y requieren sus pruebas
multicarrera propias antes de cerrar Etapa 6.

## 9. Privacidad, amistad y Activity

La operación actual de guardar subject exige rol en el plan, no una nueva amistad
con cada destinatario. No se introduce ese requisito ni se elimina la amistad
necesaria para crear/invitar. Los dos tests con friendships directa/inversa son
fixtures de contexto, **no evidencia de autorización de una invitación nueva**.
También se prueba save por membership sin documento de friendship.

Create/invite y sus avisos atómicos permanecen intactos; la regresión histórica
verifica sus orientaciones/máximos. El prototipo no publica Activity ni usa avisos
como permisos. Su check no concede acceso a progreso privado, snapshot, lista de
carreras, selección ni instancias ajenas. Tampoco crea instancias o controles.
El prototipo mantiene esos paths default-deny, no implementa sharing transitivo.

No se publica el check: get únicamente para miembro del plan, list denegado.
Su actorUid ya es identidad colaborativa del plan; no contiene datos académicos
privados. No se concede acceso académico por friendship, binding o compatibilidad.

## 10. Migración, legacy, cleanup y complejidad

- Una propuesta histórica puede empezar sin check; la primera edición válida
  debe crear check=1 atómicamente. No se necesita inventar certificados al migrar.
- No se toca el migrador ni se resuelven bindings administrativamente en producto.
- Legacy sigue su repositorio/Rules, instances su protocolo futuro. Check solo
  pertenecería a schema de plan nuevo; nunca se escribirían ambas ramas.
- Complejidad cliente: una lectura y una escritura adicionales, contador CAS,
  manejo explícito de contención y respuesta perdida. No requiere leer instancias
  privadas de otros usuarios; esas lecturas pertenecen exclusivamente a Rules.
- Complejidad Rules: dos predicados complementarios, acotados a cinco personas;
  debe auditarse que ninguna otra allow permita escribir una mitad por separado.
- Cleanup pendiente de integración: no habilitar eliminación libre de checks.
  Al retirar un plan cerrado/deleting, habrá que drenar también esta subcolección
  bajo autorización de cleanup y conservar el tombstone. No modifica el principio
  de eliminación del plan; requiere tests nuevos del flujo completo. El prototipo
  deniega delete de check y no afirma que ese cleanup ya esté implementado.
- Un check por código evita crecimiento por edición. Contador agotado falla
  cerrado; no se reinicia ni hace wrap. Datos extra/malformados se rechazan.

## 11. Revisión y dictamen

Recomendación técnica: **GO para integrar este protocolo acotado de guardado de
subjects en Etapa 6, únicamente después de aprobación del diseño**. No es GO de
Etapa 6 completa, Etapa 7, rollout ni release. Create/invite/join, sharing,
migración de planes y cleanup siguen necesitando implementación y pruebas propias.

No cambia las garantías congeladas ni campos del subject/plan. Sí propone un
path auxiliar y una segunda escritura por edición: son cambios técnicos nuevos
cuya integración aún NO está autorizada. Si al combinarlo con las Rules completas
aparece otro límite o contrato incompatible, corresponde STOP nuevamente.

Protected new-account bootstrap sigue **BLOCKED / RELEASE BLOCKER**. No se propone
resolverlo ni deducir origen de ausencias. No hubo acceso productivo, migración,
Console, publicación de Rules, deploy, commit, push ni cambios en servicios/UI.

## 12. Evidencia final y archivos

| Ejecución final | Resultado |
|---|---|
| Prototipo aislado | 63/63 PASS |
| Baseline original 10/11, sin modificaciones | 8/8 PASS |
| Runner focalizado completo | 71/71 PASS |
| Node completo | 693/693 PASS |
| Emulator consolidado histórico | 335/335 PASS, 16 suites |
| Build normal | PASS, 2753 módulos; warning previo de bundle >500 kB |

Cero fallos, cancelaciones u omisiones en las ejecuciones finales. Los 71 casos
focalizados no forman parte de los 335 históricos. Emulator usa exclusivamente
demo-correlativas-rules y 127.0.0.1:8088, con cierre limpio en cada ejecución.
Rules productivas conservan hash
`d25c2ca2bdc71bb448afd5d39c65dc1cbdff9ffd04dffbf1584c25075cf8f4fc`.

Ataques cubiertos: authority frozen/invalid/blocked/legacy, anónimo/autenticación
no social, instancia ajena/archivada/schema incompatible/catálogo incorrecto,
binding unresolved/catalog-unavailable, spoof de binding/membership/actor,
plan cerrado/deleting, campos extra, timestamp falso, contador falso/replay/reset,
subject/check aislados o de otro code/plan, dos subjects con un solo check,
fabricación de control/instancia, lectura privada ajena y sexto participante.
Casos permitidos máximos, otros miembros con dueño archivado, historia preservada,
restore, selección irrelevante, atribución y recuperación también están probados.

La corrida inicial detectó dos referencias del harness creadas con otro cliente
Firestore y una expectativa excesiva de éxito simultáneo bajo contención. Se
corrigieron los tests y se comprobó error explícito, ausencia de estados parciales
y reintento. No se relajaron las Rules del prototipo para aceptar el caso contendido.

Archivos de esta fase:

- `tests/rules/fixtures/joint-subject-atomic-prototype.cjs`: generador de Rules
  aisladas, reutiliza el validador real de authority.
- `tests/rules/joint-subject-atomic-prototype.test.cjs`: cliente prototipo y tests.
- `scripts/test-rules.cjs`: opción diagnóstica `--social-prototype-only`; no cambia
  el comando consolidado ni los guardas demo/loopback.
- Este análisis y actualización del checkpoint anterior.

El test baseline `tests/rules/multicareer-social-budget.test.cjs` se conserva.
Comando reproducible: `node scripts/test-rules.cjs --social-prototype-only`.
No hay dependencias nuevas. Diff/whitespace revisados; cambios sin staging.
