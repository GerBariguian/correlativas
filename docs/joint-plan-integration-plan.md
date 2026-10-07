# Etapa 6 — plan de integración real

Planning only. Base inspeccionada: working tree acumulado sobre 96de41a.
Entrada aceptada: `joint-plan-integrated-prototype-report.md` y sus 62 registros
de evidencia (1 test PASS, 35 negativos, sin agotamiento observado).
Este plan no autoriza implementación, migración real ni despliegue.

## 1. Inventario a intervenir

Paths existentes salvo los marcados **nuevo propuesto**. Una línea por archivo.

| Grupo | Archivo | Cambio previsto |
|---|---|---|
| Domain | `src/jointPlanLogic.js` | DTOs/discriminadores C, slots y occupancy actual; separar lectores legacy |
| Domain | `src/jointJoinLogic.js` | Sustituir transiciones experimentales v2 por JOIN/REINVITE/RELEASE C y revisión local |
| Domain | `src/planningLogic.js` | Compatibilidad por catalogId y snapshots por instancia, sin membership como acceso |
| Domain | `src/planningPresentation.js` | Estados estructurales/históricos y resultados parciales, operatividad ajena no verificada |
| Domain | `src/careerInstancePersistenceLogic.js` | Consolidar DTO de consentimiento por instancia ya iniciado, sin provenance en slots |
| Rules | `firestore.rules` | Familias exclusivas, ciclos, C, sharing por instancia, controles protegidos, tombstone |
| Services | `src/services/jointPlans.js` | Separar APIs legacy/C; discovery, invitaciones independientes, edges y delete bounded |
| Services | `src/services/jointJoin.js` | JOIN transaccional por O/cycle/binding; sin retry de permission-denied como escritura |
| Services | `src/services/friends.js` | Ciclos/reservas, withdrawal/re-friend, identidad canónica y conflicto de requests |
| Services | `src/services/planning.js` | Seleccionar fuente por authority; consentimiento/snapshot exacto por instancia |
| Services | `src/services/careerInstances.js` | Conservar archive→sharing OFF y restore OFF con schema integrado |
| Bridge | `src/userDataAuthorityLogic.js` | Retirar gates temporales solo para operaciones con autorización C definitiva |
| Bridge | `src/socialMaintenance.js` | Mantener bloqueo coordinado de clientes/rutas durante rollout, sin bypass legacy |
| Migration | `scripts/multicareer-migration.cjs` | Extender inventario/checkpoints existentes y coordinar migración por plan |
| Migration | `scripts/multicareer-joint-plan-migration.cjs` **nuevo propuesto** | Constructor/validador/publication por plan, separado del migrador por usuario |
| Migration | `scripts/multicareer-emulator.cjs` | Adaptador local protegido para ensayar persistencia/reanudación; no remoto |
| UI/state | `src/hooks/useJointPlans.js` | Refs privadas→GET autorizado; listeners de slots/edges y limpieza de estado stale |
| UI/state | `src/hooks/usePlanningParticipants.js` | Compatibilidad catalogId separada de sharing y selección |
| UI/state | `src/components/PlannerPage.jsx` | Contexto de instancia explícito y resultados parciales, sin tocar motor del planner |
| UI/state | `src/components/JointPlanPanel.jsx` | Crear plan separado de invitar; estados por destinatario y por participante |
| UI/state | `src/components/JointPlanHistory.jsx` | Historia legacy/C y referencias residuales sin fallback de autorización |
| UI/state | `src/components/DeleteJointPlan.jsx` | Acción de borrado lógico terminal, distinta de close/release |
| UI/state | `src/components/PlanningDialog.jsx` | Asignaciones independientes y retry solo de fallidas |
| UI/state | `src/components/PlanningComparison.jsx` | Consumir snapshots autorizados por instancia, nunca statusMap ajeno |
| UI/state | `src/components/ProgressSharingSettings.jsx` | Consentimiento explícito de la instancia propia |
| UI/state | `src/components/FriendsPage.jsx` | Contexto social/ciclo y compatibilidad, sin acceso académico implícito |
| UI/state | `src/App.jsx` | Pasar contexto/authority explícitos y resolver navegación Activity sin seleccionar para autorizar |
| Activity | `src/activityLogic.js` | Decodificación versionada legacy/C, identidad por cycle/O y readAt independiente |
| Activity | `src/activityPresentation.js` | Resolver destino actual/histórico/no disponible sin inferir permiso |
| Activity | `src/services/activity.js` | Conservar queries privadas/readAt/delete con DTOs versionados |
| Activity | `src/activitySession.js` | Evitar colisiones/cache entre versiones y occurrences |
| Activity | `src/components/ActivityItem.jsx` | Acción contextual stale/no disponible; sin rediseño visual |
| Tests/runner | `scripts/test-rules.cjs` | Registrar suites C reales sin transformaciones experimentales |
| Tests/runner | `package.json` | Registrar tests Node nuevos; sin dependencias |

Tests existentes a extender: `tests/jointPlans.test.cjs`, `tests/friends.test.cjs`,
`tests/planning.test.cjs`, `tests/planning-ui.test.cjs`, `tests/migration.test.cjs`,
`tests/career-persistence.test.cjs`, `tests/academic-bridge.test.cjs`,
`tests/academic-bridge-ui.test.cjs`, `tests/activity.test.cjs`,
`tests/activity-service.test.cjs`, `tests/activity-session.test.cjs`,
`tests/activity-ui.test.cjs`; y Rules `activity.test.cjs`, `activity-rollout.test.cjs`,
`academic-bridge.test.cjs`, `career-lifecycle.test.cjs`, `migration.test.cjs`,
`instance-sharing.test.cjs` bajo `tests/rules/`.
Nuevos propuestos: `tests/joint-plan-services.test.cjs`,
`tests/joint-plan-migration.test.cjs`, `tests/rules/joint-plan-c.test.cjs` y
`tests/rules/joint-plan-cutover.test.cjs`: servicios reales y Rules reales, sin mocks
que sustituyan la autorización. No cambiar catálogos, Proyectar carrera ni CSS.

## 2. Prototipo → producto

| Origen aprobado | Traslado |
|---|---|
| Slots/slot-expansion | Transiciones recíprocas slot↔index, NEW/O/Activity, JOIN y RELEASE; no generadores string-replace |
| Friendship-cycle/distributed-friend-activity | Reserva immutable, cycle actual, request/accept+Activity atómicos; no fixtures de amistad sembrada |
| Member-edge | Base común y CAS de cada relación, stale identity/revision, hasta cinco participantes; no subjectCheck global |
| Discovery-ref | Ref privada mínima y obligaciones CREATE/NEW; no permisos por ref |
| Integrated-plan | Staging/publication, freeze, parent terminal+tombstone; controles como contrato protegido real |
| Constructor/validator de test | Invariantes e idempotencia hacia migrador; no assertions de roster fijo ni withSecurityRulesDisabled como prueba |

No trasladar UIDs/IDs fijos, prefijo de colección `prototype*`, schema numbers
30/31 como decisión implícita de release, eval/new Function ni carga de Rules por
reemplazos. Fijar versiones/nombres finales en slice 1 con decoders estrictos.
La provenance vive en checkpoint; **importId no vuelve al slot**. Conservar token
de occupancy importada disjunto de invitation IDs y sin O/cycle ficticios.

## 3. Orden ejecutable: ocho slices

Archivos remiten a los grupos de §1; no son autorización para cambios fuera de ellos.

| Slice | Objetivo/archivos e invariantes | Tests específicos y PASS | STOP |
|---|---|---|---|
| 1. Domain + Rules | Domain, firestore.rules y tests C nuevos. Discriminadores exclusivos, schemas, slots/index/O/edges/cycles/refs y controles protegidos; publicar no equivale a crear campos desde cliente. Incorporar patrones completos de atomicidad aunque servicios aún no conecten. | Node DTO/transiciones; Rules por operación: formas inválidas, spoof, stale, hasta 4 invitados y 5 participantes; sin reads académicos ajenos. PASS con legacy/bridge conservados fuera de gates acordados. | Grants cruzados, exposición, camino válido B/C |
| 2. Servicios + Activity escritura | jointPlans/jointJoin/friends y activityLogic/services; APIs por transición. CREATE parent+4 slots+ref; cada NEW slot/index/O/aviso/ref atómico. Ciclos con Activity desde aquí, no diferidos a UI. | Servicios reales contra Emulator; request opuesto, NEW posiciones 1–4, inviter no-owner, ambas orientaciones, omissions/replay, JOIN/release. PASS sin writes parciales dentro de una transición. | Ciclo stale válido o recurso agotado |
| 3. Edges + sharing | Servicios/domain planning, careerInstances y jointPlans. Base+relaciones independientes; consentimiento por instancia, compatible≠shared; archive solo afecta operatividad individual. | Node parcial 0..5; Rules assign/unassign, A→release→B, archive/restore, no transitividad, snapshot stale/consent OFF; servicios con un fallo entre éxitos. PASS sin modificar statusMap ajeno. | Sharing implícito, stale occupancy o leak |
| 4. Migración protegida | Scripts migration/adaptador y Rules cutover. Inventory→freeze→reread→construct nuevo P→validate→publication. Cada binding probado; unresolved bloquea; pending no se importa actionable. | Persistencia/reanudación real Emulator, invalid owner, joined unresolved, rerun antes/después/reuse, old-client allow-before/deny-after, publicación parcial y concurrencia freeze. PASS una sola authority y mapping. | Dual authority, fabricación de binding/cycle, no idempotencia |
| 5. Delete terminal | jointPlans y Rules. Owner-only parent terminal+tombstone atómico, sin drain C ni fanout. | Mitades FAIL, owner PASS, non-owner FAIL; delete+child válido combinado/carrera; residuales y parent ausente; legacy no revive. PASS bounded y terminal. | Resurrección o write operativo posterior |
| 6. UI funcional/bridge | Hooks, App y componentes de §1. Conectar solo servicios validados; liberar gates académicos temporales por operación, contexto nunca autorización. | UI/state: invitaciones y asignaciones parciales, retry de fallidas, refs residuales, cambio sesión/instancia, released/inactive, unavailable/tombstone. PASS sin pérdida silenciosa ni progreso stale. | Fallback permisivo o éxito parcial oculto |
| 7. Activity compatibilidad | Presentation/session/Item y rutas de navegación. Decoder nuevo ya soportado desde slice 2; resolver historia, C1/C2 y O sin autoridad derivada. | Node/session/UI y Rules readAt/delete, aviso viejo, cycle retirado, occurrence histórica, plan deleted. PASS contadores/readAt independientes y navegación revalida acceso. | Aviso abre acceso o colisión de identidades |
| 8. Regresión y cierre | Runners/tests y documentación operativa del cambio. Matriz completa old/new × authority/schema/estado, auditoría no-dual-write/privacidad. | Node completo, Rules consolidado real, build, diff/whitespace/status. PASS sin omisiones; releer cambios después de última ejecución. | Cualquiera de §8 o validación incompleta |

No desplegar slices intermedios. Activación funcional solo después de sus dependencias;
Activity atómica no puede posponerse al slice de presentación. Sharing académico es
parte de Etapa 6 y se consolida sin rediseñar los contratos aceptados.

## 4. Rules y compatibilidad

Preservar familias legacy mientras authority=legacy donde el bridge lo permite;
frozen/instances no heredan permisos por activeCareerId. C exige identidad explícita,
control válido y source of truth privado de cada instancia. activeCareerInstanceId
solo navegación. No grants genéricos compartidos que vuelvan a abrir legacy.

Slice 1 instala estructura/gates fail-closed; slice 4 conecta **freeze/retired por
plan** que bloquea definitivamente las rutas legacy del plan cutover, incluso para
un invitado que conserve authority legacy. El gate por usuario de Etapa 4 sigue.
Antes de habilitar withdrawal/re-friend no puede sobrevivir JOIN legacy sin cycles:
coordinar suspensión de esas mutaciones según la transición aprobada.

C nuevo nativo necesita CREATE autorizado sin importador; C migrado necesita staging
protegido. Slice 1 debe distinguir ambos constructores sin permitir que un cliente
simule publication administrativa. Es una cobertura de integración requerida: el
fixture integrado ensayó destino migrado, no todo CREATE nativo compuesto.
Medir con Rules reales; no inferir budgets del admin harness o del padding anterior.

## 5. APIs: cambios mínimos

| API actual | Destino |
|---|---|
| createJointPlan | Separar CREATE C de cada invitación; devolver ID y resultados por destinatario, no fingir batch global |
| inviteJointParticipant | NEW/REINVITE explícito por slot/O/cycle; emisor actual válido; no invitaciones por arrays C |
| updatePlanMembership / joinJointPlan | JOIN C por O/binding; RELEASE por occupancy/revision; legacy aislado por authority/familia |
| saveJointSubject / removeJointSubject | Legacy conserva semántica propia; C base común + assign/unassign por miembro, sin borrar la base para retirar uno |
| subscribeJointPlans / subscribeJointSubjects | C refs privadas→GET autorizado y bases/edges; legacy query solo en rama permitida, sin mezclar para rescatar acceso denegado |
| deleteJointPlan | C terminal+tombstone; no ejecutar drain legacy contra C |
| close/rename | Preservar funciones existentes con contrato/validación C, sin tocar occupancy ni reopen |

Conservar temporalmente wrappers legacy necesarios para bridge; no dual-write ni
retry contra legacy ante permission-denied C. Cada resultado parcial conserva ID
y revisión para reintentar solo operaciones pendientes; no repetir éxitos.

## 6. Migración y puntos de recuperación

Reusar inventory/hashes/checkpoints del migrador actual; unidad por plan independiente
del control por usuario. Reserva sourceP→targetP estable; autoridad del owner no
certifica binding ajeno. Clasificación histórica aceptada, catálogos exactos y
provenance protegida; jamás resolver trajectory desde plan o snapshot aislado.

Antes de publication: fallo conserva freeze y destino staged no operativo; reanudar
por checkpoint, no rehacer IDs/cycles. Después: recovery hacia adelante o suspensión,
nunca reabrir legacy. Delete C no altera cutover. Rollback de web solo a build compatible
o mantenimiento; no revertir Rules permisivas ni manifest/tombstone. No implementar
bootstrap ni migración productiva en estos slices.

## 7. Estrategia de pruebas y working tree

Por slice: Node focalizado + Rules de sus transiciones usando servicios reales.
Al tocar helpers/grants compartidos, sumar bridge/lifecycle/Activity/sharing afectados.
Suite completa al cerrar slice 8 y antes si una regresión transversal lo justifica;
no rerun de todos los prototipos ante cada edición.

Conservar como corpus de regresión: integrated-plan (incluida occupancy importada),
discovery-ref, member-edge, slots/cycles y sus negativos/concurrencia. Portar casos
a suites reales; un PASS con Rules reescritas en memoria no acredita firestore.rules.

Clasificar dirty diff sin limpiarlo ahora:

- Producto: cambios actuales de src/Rules solo tras reconciliarlos con C; especialmente
  descartar como destino funcional subjectCheck/global arrays v2 ya superados, sin
  revertir indiscriminadamente el diff ni perder cambios de sharing vigentes.
- Regresión: tests portados con aserciones y servicios reales, registrados en runners.
- Evidencia: fixtures, runners diagnósticos, reportes/JSON de prototipos; fuera de
  imports de app y deploy. Históricos de padding/alternativas pueden retirarse de
  ejecución rutinaria al cierre, solo después de demostrar cobertura equivalente;
  conservar evidencia y pedir revisión del listado antes de cualquier eliminación.

No dependencia nueva ni limpieza automática. `firestore.indexes.json` no se cambia
por suposición: las queries de refs son privadas por colección; si una consulta final
requiere índice, registrar la necesidad concreta para revisión, sin publicación.

## 8. STOP y cierre

STOP únicamente ante: camino válido agotando Rules resources; dual authority;
exposición académica privada; stale cycle/occupancy que revive; migración no idempotente;
tombstone/reserva que permite resurrección. No microoptimizar ni rediseñar silenciosamente.
Errores rutinarios de implementación se corrigen y repiten suites afectadas; cosmética
no detiene ni amplía este alcance.

Al terminar implementación: reporte de archivos, APIs/schema definitivos, conteos
exactos finales, budgets observados (sin márgenes universales), auditorías de privacidad,
no-dual-write, source switching y recovery. GO de Etapa 6 no es GO de release:
**protected new-account bootstrap sigue RELEASE BLOCKER de v1.16** por separado.

No contradicción material encontrada que impida preparar implementación. Las brechas
entre fixture y producto están asignadas a slices/tests, no declaradas ya probadas.
Este turno solo crea este documento; sin Emulator, suites, código productivo ni deploy.
STOP para revisión y autorización de implementación.

JOINT PLAN INTEGRATION PLAN READY — IMPLEMENTATION CAN START
