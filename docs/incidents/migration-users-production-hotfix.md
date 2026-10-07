# Incidente de producción: lectura privada de migrationUsers

Publicación del hotfix: **7 de octubre de 2026**, confirmada por el responsable de producción.
Incidente resuelto en producción; rollout completo de v1.16 pendiente.

## Causa raíz y evidencia

Vercel desplegó automáticamente `fe44b29` desde `main`. El frontend incorporaba
el Bridge académico, que consulta `migrationUsers/{uid}` para determinar la
fuente autorizada de los datos. Las Rules publicadas no autorizaban ese path.
Un breakpoint en el callback `fail` de `academicBridge.subscribeContext` permitió
observar directamente `error.code = 'permission-denied'`, sin compartir el objeto
completo ni datos sensibles. El Bridge suspendía la edición y Reintentar repetía
la lectura rechazada.

El snapshot productivo coincide con `8a4abd4:firestore.rules`, normalizando sólo
saltos de línea y final del archivo. La fixture conserva los bytes originales:
`tests/rules/fixtures/firestore.production-before-v116.rules.txt`.

## Reparación elegida

Se publicó exclusivamente `firestore.migration-users-hotfix.rules`: snapshot
productivo más este bloque, sin otros cambios:

```js
match /migrationUsers/{uid} {
  allow get: if signedIn() && request.auth.uid == uid;
  allow list, create, update, delete: if false;
}
```

El GET propio permite confirmar también la ausencia del documento. Esa ausencia
confirmada por el servidor resuelve a legacy; no prueba que la cuenta sea nueva
ni autoriza bootstrap. No se publicaron las Rules completas de `fe44b29`.

## Acreditación de la reparación publicada

- Tests existentes del Bridge: **25/25 PASS**.
- Emulator del hotfix, ejecución manual confirmada: **10/10 PASS, 0 FAIL**, exit code **0**.
- Revalidación manual final con la fixture portable, confirmada por el responsable:
  **10/10 PASS, 0 FAIL, 0 skipped**, exit code **0**. T9 y T10 PASS;
  hash del hotfix `e763a589a97214ce8d2fa4a8800e9630f982a41c167631dddd623972b5bb8cfb`.
- T1–T8: GET propio existente/ausente permitido; GET ajeno/anónimo, LIST y
  CREATE/UPDATE/DELETE denegados.
- T9: el repositorio Bridge real, con perfil legacy y control ausente confirmado
  por el servidor, resuelve `authority=legacy` y recupera `academicWrite`,
  `select` y `legacySocial`.
- T10: el artefacto es exactamente el snapshot más el bloque autorizado, sin
  otras modificaciones; verifica también el hash del snapshot.

El responsable confirmó publicación exitosa y recuperación de una cuenta legacy
real, con carrera, materias y estados existentes correctos. No se creó un control
artificial para desbloquearla, no se migraron datos y no hubo rollback del frontend.
Esta evidencia manual/productiva se distingue de cualquier reejecución local posterior.

## Reproducción

Desde la raíz del repositorio:

```powershell
node --test tests/academic-bridge.test.cjs
node scripts/test-migration-users-hotfix.cjs
```

El runner usa `firebase.migration-users-hotfix-test.json`, el proyecto demo
`demo-correlativas-rules` y Firestore Emulator en `127.0.0.1:8088`; no publica
Rules ni usa datos productivos. T10 resuelve la fixture desde `__dirname`, sin
depender de Downloads ni de una ruta absoluta de otra máquina.

El entorno del agente presentó fallos ambientales de arranque Java/Netty
(`Unable to establish loopback connection`, `UnixDomainSockets.connect: Invalid argument`).
Un fallo de arranque no acredita ni invalida los tests: requiere ejecutar el mismo
runner manualmente, sin alterar expectativas ni Rules para sortearlo.

## Estado productivo provisional y límites

- Frontend: **fe44b29**.
- Rules: **snapshot productivo anterior + GET privado de migrationUsers**.
- `firestore.rules` del repositorio conserva el contrato completo de Etapa 6;
  no es el artefacto publicado por este hotfix y no debe reemplazarse por éste.

La reparación restaura el acceso legacy, no la compatibilidad completa de fe44b29.
Cycles, reservas, Activity versionada nueva, instancias, sharing multicarrera y
Joint Plans C pueden seguir rechazados por falta de sus permisos. En particular,
las nuevas solicitudes de amistad del frontend usan cycles. No declarar esas
funcionalidades habilitadas por este hotfix ni iniciar migraciones bajo estas Rules.

El bootstrap protegido continúa como **blocker del release general v1.16**.
No impide este hotfix: leer la ausencia del control para continuar como legacy
no certifica origen nuevo ni crea autoridad instances.

## Rollback y rollout pendiente

El snapshot anterior es la referencia de recuperación. Republicarlo retiraría
el GET y volvería a bloquear el Bridge de fe44b29; no constituye por sí solo un
rollback funcional seguro. Cualquier rollback requiere autorización y una pareja
frontend/Rules compatible con los datos vigentes, sin borrar ni fabricar controles.

El rollout completo de v1.16 sigue pendiente: requiere una decisión separada,
resolver el bootstrap protegido y coordinar Rules, frontend y cualquier migración
aprobada. El cierre acreditado de Etapa 6 no equivale a ese rollout productivo.

**Vercel está conectado a main: push a main implica deploy automático.** Un commit
documental o de tests tampoco autoriza su push. No ejecutar publicación, migración
ni despliegue como parte del registro documental de este incidente.

## Identidad de los artefactos (SHA256)

| Artefacto | SHA256 |
|---|---|
| Snapshot original y fixture | `e38c13412a9ac97bc3e4ff247685a34a47279ea4df480eb99105f41f14a9f48b` |
| `firestore.migration-users-hotfix.rules` | `e763a589a97214ce8d2fa4a8800e9630f982a41c167631dddd623972b5bb8cfb` |
| `firestore.rules` completo de fe44b29 | `6b7443adac685641390d4040304b55af72d0212555b57f0b9c0bd20f522a0be7` |

Los hashes corresponden a bytes exactos, incluidos los saltos de línea. No
normalizar los artefactos publicados ni la fixture al preparar este cierre.
