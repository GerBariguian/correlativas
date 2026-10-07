# Joint Plans C — retención y borrado

Decisión de diseño para revisión, 2026-10-01. Sin implementación ni ejecución.

## 1. Decisión v1.16

**B: borrado lógico permanente con tombstone; limpieza física diferida.** No se
identificó un blocker conceptual que obligue a implementar borrado recursivo ahora.
La aceptación exige los gates del prototipo integrado descritos abajo; no afirma
que las Rules actuales ya implementen este contrato.

Fuentes: `joint-plan-c-expanded-review.md`, `joint-plan-discovery-prototype-report.md`,
`joint-plan-legacy-cycle-transition-decision.md`,
`joint-plan-historical-membership-evidence-decision.md`; contratos C de
`tests/rules/fixtures/member-edge.cjs` y tombstones existentes en `firestore.rules`.
El delete legacy con drain no se reutiliza automáticamente para C.

## 2. Lifecycle mínimo

| Estado/acción | Significado |
|---|---|
| ACTIVE | Plan publicado abierto; operaciones sujetas a autorización C habitual |
| CLOSED | Historia conservada; sin nuevas operaciones académicas/invitaciones; no es borrado físico ni tiene reapertura |
| DELETED/TOMBSTONED | Terminal: ninguna operación de plan o acceso a sus hijos por cliente; no resurrección |
| RELEASE | Salida de un participante según contrato vigente; no borra el plan ni a otros miembros |

DELETE se permite desde ACTIVE o CLOSED mediante la transición protegida siguiente.
No requiere cerrar previamente con una operación académica ni recorrer participantes.
Un plan futuro usa otro planId. Release no sustituye delete; después de delete no
se exige ni permite drenar slots mediante release del cliente.

## 3. Representación y transición atómica

Conservar el padre C, identidad y discriminador inmutables. Reutilizar su campo
`deleting` como estado terminal **para C**, no como trabajo temporal de cleanup:
`closed=true, deleting=true`. La semántica legacy de ese campo no se cambia.
Crear simultáneamente `jointPlanTombstones/{P}` con el payload mínimo existente:
`{deletedAt: request.time}`. Sin owner, roster ni motivos adicionales en tombstone.

Dos escrituras atómicas: UPDATE del padre y CREATE del tombstone. Las Rules deben
exigir reciprocidad: padre C no eliminado antes, owner autenticado autorizado,
único diff closed/deleting, tombstone ausente antes y válido después; CREATE del
tombstone exige ese mismo cambio del padre en el commit. Cada mitad sola rechaza.
Después, padre y tombstone no admiten update/delete cliente. Un retry no reescribe
el tombstone ni reinicia un protocolo; el error de red no se interpreta como éxito.

Todo CREATE de plan, en cualquier familia, rechaza un P reservado por tombstone.
Padre retenido evita perder el discriminador y conserva la evidencia terminal.
Ausencia accidental del padre debe denegar hijos, nunca habilitar un fallback.
Si existe una inconsistencia padre activo+tombstone, se bloquea y se trata como
estado inválido; no se “repara” borrando la reserva. La transición legítima no puede
producir esa combinación. Un administrador elude Rules: no afirmar protección
contra una escritura administrativa arbitraria fuera del protocolo.

## 4. Quién puede borrar y coste acotado

Solo el owner registrado, con socialUser y control válido instances/complete,
sobre un C publicado. No exigir instancia académica activa: borrar es una acción
de lifecycle, no una asignación académica. Archivo de instancia no impide borrar;
authority frozen sí bloquea la acción. Miembros usan RELEASE y no borran el plan.
Esto es una nueva autorización específica de delete, no modificación de close.

Documentos mínimos: padre, tombstone, control de authority del owner y gate protegido
de publicación correspondiente al diseño de transición. Solo padre+tombstone se
escriben. Sin consulta/listado de subjects, edges, occurrences, slots, refs o inboxes.
No fanout ni dependencia del volumen histórico. El coste exacto se medirá integrado.

## 5. Hijos residuales y refutación intentada

Pueden permanecer slots, inviteeIndex, occurrences, bases y member edges. Ninguno
debe autorizar operaciones por mera existencia: todos los grants del plan y sus
hijos deben comprobar padre C publicado y no eliminado. NEW, REINVITE, JOIN,
creación de base y mutaciones de edges, incluidos unassign y release, quedan cerrados.
Las lecturas de hijos también se cierran; una regla histórica de lectura de O por
destinatario no puede saltear este gate.

El padre terminal puede permitir únicamente GET al owner para reconocer su propio
borrado; no acceso por index residual. No nuevo listado público ni lectura del
tombstone. Otros participantes pueden obtener acceso no disponible, sin revelar
razones privadas. Esto no diseña la UI.

Riesgo concreto a probar: un batch malicioso que combine delete con una escritura
de hijo autorizada por el padre **anterior**. Los guards de mutación deben comprobar
también estado posterior donde sea necesario; ambas operaciones no pueden aceptarse
juntas. Una operación concurrente que gana antes de delete queda residual e inerte;
si delete gana primero, la operación debe rechazar.

Conservar el padre permite usar su estado en guards que ya lo consultan, sin imponer
automáticamente una consulta separada al tombstone en cada hot path. No se atribuye
ahorro ni margen probado: after-checks y grants históricos pueden añadir coste.
Si el prototipo integrado rechaza un camino válido por presupuesto/expresiones,
STOP; no eliminar guards para obtener verde. Hoy no se observó ese fallo porque
esta sesión no ejecuta ni modifica el prototipo.

## 6. Discovery, Activity y legacy

Refs privadas residuales siguen siendo discovery only; su limpieza no es requisito
de seguridad. Activity residual puede permanecer y admitir sus operaciones propias
de readAt/borrado bajo el contrato existente: no son mutaciones del plan ni reactivan
acceso. No fanout de eliminación de avisos; navegación puede resolver no disponible.

Eliminar C no modifica el mapping/cutover ni devuelve autoridad al origen legacy.
Origen frozen/retired continúa no operativo. Cliente antiguo no recibe una rama
legacy por encontrar C eliminado o ausente. No se borran controles para recuperar
disponibilidad ni se hace rollback a Rules permisivas.

## 7. Ataques mínimos

| Ataque | Barrera requerida |
|---|---|
| A: non-owner delete | Owner exacto + authority + transición recíproca |
| B: cliente viejo escribe tras tombstone | Familia exclusiva, padre terminal y CREATE reservado |
| C: stale JOIN | Padre actual/posterior no eliminado, no basta slot/O |
| D: stale base/edge write | Mismo gate también para unassign y commit combinado |
| E: recrear mismo P | Padre/tombstone inmutables; todos los CREATE comprueban reserva |
| F: ref residual recupera acceso | Ref no autoriza; index residual tampoco saltea terminal |
| G: origen legacy revive | Cutover irreversible independiente del destino |

Son conceptualmente bloqueables sin recorrido ni borrado de hijos. No se interpreta
esto como evidencia experimental de las Rules integradas.

## 8. Qué se difiere

Physical recursive delete **no es necesario en v1.16** para este contrato. Se difiere
su implementación version-aware a una etapa futura autorizada. No se decide herramienta,
backend, plazos de retención ni account deletion. Los datos residuales permanecen
almacenados y pueden generar costes: “borrar” aquí no promete erradicación física.
El tombstone/reserva no debe desaparecer por una limpieza futura que permita reusar P.

## 9. Gates del próximo prototipo integrado — no ejecutar ahora

- Owner delete desde abierto/cerrado PASS; owner archivado PASS con authority válida;
  non-owner/frozen FAIL. Dos mitades aisladas FAIL, sin estado parcial.
- NEW/REINVITE/JOIN y base/edge mutations después de delete FAIL; incluir unassign,
  release, lectura de occurrences/hijos e intentos de actualizar/eliminar tombstone.
- Old/stale client FAIL; delete+child write en un batch FAIL; carrera con JOIN/edge
  sin operación autorizada después del corte. Padre ausente con hijos/tombstone FAIL.
- Recreación mismo P y schema flip FAIL; ref/Activity residual no concede acceso;
  sus operaciones privadas independientes no restauran el plan.
- Legacy source no revive, staging no puede publicar un destino eliminado, rerun
  de migración no lo recrea. Sin rollback que quite reserva ni resurrección parcial.
- Medir transición bounded y regresiones de hot paths con los gates compuestos;
  no trasladar márgenes de padding de otros prototipos.

La decisión mínima queda lista para revisión y posterior prototipo integrado.
No autoriza integración hoy. Bootstrap protegido continúa release blocker separado.
Solo este documento; sin Rules, servicios, UI, Emulator, producción ni migración.
STOP para revisión.

JOINT PLAN RETENTION/DELETION DECISION READY
