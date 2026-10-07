# C — Viabilidad de activación final de Joint Plan

2026-09-30. Prototipo aislado sobre 96de41a y working tree acumulado.
**NO-GO para continuar C bajo este diseño: activation válida con cuatro invitados
falla. STOP aplicado sin microoptimización, recovery, UI, legacy ni integración.**

## 1–3. Preparation, generation y lifecycle

Preparación técnica privada: `jointPlanPreparations/{G}` con campos exactos
`ownerId`, `state`, `plan`. `G` es un identificador opaco de 16–64 caracteres
permitidos; también identifica el plan operativo `jointPlans/{G}`. El payload plan
incluye `generationId=G` y `activationState='activated'` como intención, además del
schema completo de plan v2, bindings, ciclos, occurrences y serial.

Tener ese literal dentro del payload privado NO concede estado operativo. El plan
operativo sólo existe tras la activación autorizada en la colección jointPlans.

Se prueban dos escrituras de preparación autenticadas, no seed administrativo:
crear `draft` con payload parcial y sellar como `prepared` con schema global
completo. El sellado comprueba claves, owner, catálogo, límites/unicidad, member
inicial, bindings estructurales, occurrences 1..N, serial=N, invitadores y ciclos.
No certifica amistad ni lifecycle futuros. No se construye edición incremental de
cada campo: esas partes del protocolo completo quedan fuera del gate autorizado.

`prepared` es inmutable, salvo cancelación. `draft/prepared → cancelled` es terminal;
no hay delete/reapertura. La cancelación requiere ausencia de parent en post-state.
La activación no necesita escribir el documento técnico: su estado efectivo pasa
a activado por existencia del parent con `activationState='activated'`. El registro
privado conserva su estado de preparación, ya no cancelable mientras existe parent.
El tombstone existente impide reutilizar un plan eliminado. No se diseña cleanup.

La identidad no depende de confiar en aleatoriedad aportada por el cliente: Rules
exigen coincidencia de G/path/payload, owner autenticado y transiciones permitidas;
la unicidad física del documento y la prohibición de delete/reapertura impiden
reemplazar la misma preparación. Elegir otro G es otro documento, no prueba de
pertenecer al mismo intento lógico. El protocolo de sustitución G1→G2 de una misma
operación y su concurrencia NO se implementan ni se declaran resueltos tras STOP.

## 4. Por qué la preparación no autoriza

Está fuera de jointPlans y activityInbox; sólo owner puede get, list/delete están
cerrados. No existe parent operativo, por lo que ni JOIN, membership ni subjects
pueden usarla como fuente. El modelo nuevo incluye activationState en el schema y
los entry points de plan operativo; los permisos nunca consultan preparaciones
como sustituto de un parent para conceder acceso académico.

Los tests de draft parcial y prepared completo rechazan: intento de JOIN/membership,
Activity operativa, creación de subject, lectura del plan por invitado, lectura de
preparación por invitado, listado de preparaciones, escritura de sharing de otro
usuario y lectura académica cross-user. El harness confirma cero parents y cero
avisos. No se afirma que esto sea un corpus exhaustivo de todos los endpoints:
es la prueba focalizada de que esta preparación no agrega autorización.

## 5–7. Activation y revalidación actual

Commit mínimo prototipado: crear parent operativo + N avisos (cinco writes para
cuatro invitados). No se precrea Activity visible ni se agregan avisos por etapas.

El permiso de activation comprueba preparación en post-state `prepared`, owner
correcto, generación, activationState, igualdad exacta del payload sellado salvo
createdAt/updatedAt de servidor, authority actual del owner, binding/instance activa
actual y catálogo, ausencia de tombstone, y existencia fresca de todos los avisos.
Capacidad/estructura inmutable se validaron al sellar y la igualdad impide cambiarlas.

Cada Activity mantiene schema completo, destinatario, actor, target, occurrence,
cycle y binding pendiente; consulta authority actual y amistad accepted actual en
orientación directa/inversa con matching cycle. Parent→avisos y avisos→transición
de parent permanecen atómicos. Se cargan también JOIN y friendship Activity, sin
omitir helpers de la composición anterior. Prepared evidence NO sustituye current
friendship/authority/instance. Bindings pendientes no se convierten en resueltos.

## 8–10. Matriz final y límites

| Invitados | Directa | Inversa | Mixta |
| --- | --- | --- | --- |
| 1 | PASS | PASS | PASS |
| 2 | PASS | PASS | PASS |
| 3 | PASS | PASS | PASS |
| 4 | FAIL | No ejecutado: STOP | No ejecutado: STOP |

La preparación de cuatro invitados sí pudo sellarse mediante cliente autenticado.
Falla el commit de ACTIVATION posterior. Error `permission-denied` con máximo
1000 expressions y `Service call error` en `getAfter(friendships/owner:two)` en
esta ejecución. Se detuvo la variante en ese primer fallo válido.

Demostrado: la frontera final de esta representación no pasa el máximo contractual;
no se redujo ningún requisito para obtener verde. No probado: qué límite fue el
primero, cuántas expressions/lecturas efectivas consume cada permiso ni margen
agregado. No se extrapolan los números medidos de variantes anteriores.

Lecturas/revalidaciones presentes: preparación sellada, authority e instancia del
owner, tombstone, avisos por destinatario y, por aviso, parent, authority y relación
actual/cycle, además de las ramas completas de Activity. Esta composición concreta
falla con cinco escrituras finales. No se atribuye causalidad exclusiva a una
comprobación ni se demuestra imposibilidad de cualquier arquitectura imaginable.

## 11–13. Withdrawal, archive, cancel

Ocho casos negativos antes del gate: C1 withdrawn, accepted C2 diferente del preparado,
owner archived, owner frozen, catálogo de instancia cambiado, preparación cancelada,
generation del payload distinta y draft sin sellar. Todos rechazan activation y
conservan cero parent/cero avisos. Cancelada tampoco puede volver a prepared.

Las mutaciones de amistad/lifecycle/authority de esos tests usan el harness admin
LOCAL para aislar el permiso de activation; no son tests de servicios de withdrawal
ni de migración. Cancelación y preparación sí se realizan como cliente autenticado.

Restore no es una autorización: si restablece la instancia pero cambió cycle,
authority, catálogo o cancelación, siguen fallando sus respectivas condiciones.
Este gate no introduce invalidación permanente por el mero hecho histórico de un
archive; si absolutamente todas las condiciones vuelven a ser válidas podría
admitirse esa preparación. No se ejecutó una matriz de restore tras el STOP.

## 14–16. Concurrencia, fallo parcial y recovery

Concurrencia NO ejecutada porque activation de cuatro falló primero: dos tabs,
activation/cancel, withdrawal, archive y reemplazo de generación quedan pendientes.
No se presenta un máximo de una activation concurrente como garantía empírica ya
probada. Las Rules de creación/identidad no sustituyen esos tests pendientes.

Sí se comprobó el resultado del commit fallido: cero plan operativo, cero avisos
para los cuatro destinatarios y preparación todavía `prepared`. Esa evidencia es
rollback atómico, no recovery implementado. No se diseña retry, navegación histórica
ni convivencia legacy: el pedido los condicionó al PASS del gate.

## 17–18. Riesgos, garantías y decisiones disponibles

Se preservan cuatro invitados, current authorization, amistad inviter↔invitee,
cycles distintos por relación, occurrences vinculadas a G, no-sharing por membership,
Activity no autoriza y ausencia de estado operativo parcial. No hubo escrituras
productivas. Preparaciones residuales no requieren cleanup para permanecer inertes.
No se afirma que las partes no probadas del protocolo C estén completas.

El siguiente paso requiere decisión del equipo, no otra variante automática:

- Revisar atomicidad visible de invitaciones: implica abandonar la frontera común
  de todos los destinatarios; no está autorizado ni implementado.
- Revisar máximo contractual: cambia producto; no se reduce en el prototipo.
- Revisar representación/modelo de Activity: necesita demostrar nuevamente visibilidad,
  privacidad y enlace a fuente; no se eligió una nueva representación aquí.
- Evaluar backend privilegiado: altera arquitectura, operación, confianza y costes;
  no se habilitó, instaló ni propuso como decisión tomada.
- Otra decisión contractual explícita que permita un nuevo presupuesto viable.

No se elige ninguna ni se diseña C2/C3. Bootstrap protegido sigue siendo RELEASE
BLOCKER independiente. No avanzar a Etapa 7 ni integrar C.

## 19–21. Evidencia, archivos y dictamen

Runner `node scripts/test-joint-activation-feasibility.cjs`, proyecto demo fijo y
Emulator loopback. Final: **23 entradas Node: 21 PASS / 2 FAIL**. Son 20 casos hoja
(19 PASS / 1 FAIL) y tres contenedores (dos PASS / uno FAIL). El único caso hoja
fallido es activation 4 directa; el otro FAIL es su contenedor. Las dos orientaciones
restantes no se ejecutaron. Exit code 1 y clean shutdown del Emulator.

Archivos nuevos de esta fase: fixture `tests/rules/fixtures/joint-activation-feasibility.cjs`,
suite `tests/rules/joint-activation-feasibility.test.cjs`, runner
`scripts/test-joint-activation-feasibility.cjs`, y este informe. Se actualiza el índice
`docs/friendship-cycle-design.md`. No se modifican prototipos A/B anteriores.

SHA256 de firestore.rules conservado:
`7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.

**NO-GO para continuar desarrollando arquitectura C bajo esta propuesta.**
STOP para revisión del contrato; tampoco hay GO para integrar ni para release.
