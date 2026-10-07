# Etapa 6 — validación consolidada

Estado: ETAPA 6 CLOSED — MULTICAREER SHARING + JOINT PLANS C ACCREDITED.
Fecha: 2026-10-07. No cambios de producto/Rules en Slice 8.
Rules SHA256: `6b7443adac685641390d4040304b55af72d0212555b57f0b9c0bd20f522a0be7`.

## Matriz final

PASS previo significa acreditación de los slices aceptados, no una ejecución nueva de Emulator.

| Área | Estado | Contratos y evidencia reutilizada |
|---|---|---|
| A. Cuenta/contexto | PASS Node | Instancia explícita, selección no autoriza, aislamiento uid/contexto: academic-bridge, career-instances, lifecycle-ui, joint-c-product/workspace. No acceso transitivo; privacidad final respaldada por suites Rules existentes. |
| B. Sharing | PASS funcional previo / DEFERRED | Amistad aceptada, instancia owner activa, consentimiento por instancia, reader activo del mismo catálogo, snapshot actual; archive OFF y restore sin activar. instance-sharing/instance-planning-service y Node instance-planning/sharing-ui. No autoridad nueva sharedCareerId ni progreso privado ajeno. Carrera concurrente conocida diferida. |
| C. Joint C | PASS consolidado / deuda causal diferida | CREATE, slots, index, occurrence inmutable, cycles, NEW/REINVITE/JOIN/RELEASE, no revival, no ciclos/bindings fabricados: friendship-cycles-product, legacy-friendship-upgrade, joint-c-chain, joint-c-invite-service. Refs/membership no son autorización, amistad ni sharing. |
| D. Subjects | PASS funcional previo / DEFERRED | Bases y edges UID+occupancy, éxito parcial, archivo sin fanout, UNASSIGN histórico y REASSIGN misma ocupación: joint-c-member-edge, joint-c-edge-transition; Node domain/services/product. A1/B1/A2 distintos; sin lecturas privadas ajenas. Negativos S3-C diferidos. |
| E. Migración | PASS previo / DEFERRED | Freeze, construct resumible/idempotente, validación y publication protegida; sin doble autoridad. Pending no se importa como invitación; bindings no fabricados; unknown/unresolved/corrupt/overcapacity bloquean; nombre preservado. Manual 11/11 informado por usuario; suite joint-plan-migration-product incluida en consolidado. |
| F. Terminalidad | PASS previo / DEFERRED | RENAME owner-only, cierre irreversible, delete lógico+tombstone, residuos sin autoridad, sin cleanup físico. Manual 14/14 informado por usuario; joint-c-terminal incluida en consolidado. |
| G. Activity | PASS Node / Rules previas | Legacy seguro, amistad v2/invitación v3, target por ciclo/occurrence exactos, unavailable, readAt independiente y aislamiento de sesión. activity suites y friendship-cycles-product. |

## R06 / R07

Suite incluida en la ejecución manual consolidada acreditada por el usuario: 221 PASS / 0 FAIL. No se infiere de ese conteo una prueba causal aislada ni la clasificación individual de cada negativo.
`tests/rules/joint-c-final-boundary.test.cjs` usa Rules reales y cubre:

- control positivo NEW nativo mediante servicio real, con index y occurrence;
- padres legacy y v2 estructurales, sin freeze, con authority legacy del actor;
- CREATE aislado de index/occurrence y adquisición atómica NEW de cinco documentos;
- rechazo sin index/occurrence ni slot parcialmente activado;
- residuos administrativos no habilitan GET de index/occurrence bajo padre legacy/v2.

Es frontera funcional; no atribuye causalidad aislada al discriminador ni margen de presupuesto.
ALLOW inesperado falla; negativo permission-denied con agotamiento se etiqueta deuda.
Fallo del control válido registra validPathFailure y bloquea.

## Validación actual

- Node consolidado: **615 PASS / 0 FAIL / 0 skipped**.
- Incluye amistad/cycles/upgrade, Activity, todos los módulos importados por jointPlans,
  instance planning, migración, terminalidad, UI/bridge y lifecycle/contexto.
- Dos expectativas históricas de academic-bridge-ui se actualizaron al Slice 6:
  historia ahora pertenece a JointCWorkspace; texto histórico no promete suspensión
  de todos los planes. Se conserva prueba de ausencia de controles mutantes legacy.
- Build PASS, advertencia no bloqueante de bundle >500 kB.
- Intento inicial local: 0 tests por timeout del hub 127.0.0.1:4400. Ejecución final manual confirmada por el usuario: **221 PASS / 0 FAIL**, exit code **0**, `validPathFailure: null`. Esta acreditación reemplaza el estado pendiente; no se presenta como ejecución del agente.
- No repetir diagnóstico ambiental. No modificar Rules para este cierre.

## Única ejecución manual

Desde la raíz del repositorio, PowerShell:

```powershell
node scripts/test-etapa6-final.cjs
```

Runner limitado a demo-correlativas-rules, loopback 8088, Rules productivas locales;
elimina configuración/credenciales reales del proceso y registra SHA256.
Reutiliza 10 suites existentes más frontera R06/R07, secuenciales.
Incluye S3-E/S4/S5 para obtener resultado consolidado del mismo hash.

Las aserciones originales no se relajan. El runner omite explícitamente sólo estos
tests cuya deuda ya fue aceptada; aparecerán como skipped, nunca como PASS lógico:

- S3-C: base invalid schemaVersion/code/createdByUid/createdAt/creatorRef/extra,
  base wrong schema/path, combined base edge creation denied,
  immutable base/edge mutations denied.
- S3-F: concurrent enable-disable y concurrent refresh-disable.

Otros negativos conservan el criterio de su suite. Un fallo restante debe leerse
por clasificación; no convertir automáticamente fallos nuevos en deuda aceptada.
Todo camino válido debe pasar sin agotamiento para cerrar Etapa 6.

## Registro de deuda

**Blockers funcionales nuevos:** ninguno informado en la acreditación final del usuario: Node 615/615, Emulator manual 221/221 y build/static PASS.

**Deferred resource debt:** R05/R08; RC-1 JOIN legacy/v2; negativos S3-C;
concurrencia S3-F; negativos inválidos S4/S5. R06/R07: frontera incluida en el consolidado aprobado; detalle causal individual no aportado en la confirmación final.
No se optimiza, borra ni declara resuelta esta deuda.

**Fuera de Etapa 6:** bootstrap protegido (sigue RELEASE BLOCKER general de v1.16),
cleanup físico recursivo, requisitos agregados/PPS, responsive/mobile, monetización,
Activity full page/push. No impiden cierre de Etapa 6 según alcance autorizado.

## Archivos de cierre

- tests/academic-bridge-ui.test.cjs
- tests/rules/joint-c-final-boundary.test.cjs
- scripts/test-etapa6-final.cjs
- docs/etapa6-final-closure.md

Cierre documental sin producto nuevo. Commit único de Etapa 6 autorizado por el usuario; sin producción, publicación, push ni limpieza del working tree.
