# Notas finales privadas

Implementación local sobre `a245f20`, rama `codex/feature-final-grades`.
No se publicaron Rules ni se modificaron datos productivos.

## Contrato

- Legacy: `users/{uid}/careers/{careerId}/finalGrades/{subjectCode}`.
- Instances: `users/{uid}/careerInstances/{instanceId}/finalGrades/{subjectCode}`.
- Documento exacto: `{ schemaVersion: 1, grade, revision, updatedAt }`.
- `grade`: entero 1–10 o `null`. Borrar una nota conserva el documento y
  avanza su revisión; DELETE físico está denegado.
- Cada guardado compara la revisión original dentro de una transacción,
  verifica autoridad y progreso vigente y escribe solamente la nota.
  Instances también verifica lifecycle, catálogo y membership.
- El promedio incluye únicamente materias del catálogo actual aprobadas y con
  nota. Reset y cambios de estado conservan las notas, pero las excluyen cuando
  corresponda. No se copian entre carreras ni a snapshots sociales.
- Materias permite edición explícita; Dashboard muestra promedio y cobertura.
  Lecturas fallidas no se interpretan como ausencia de notas. Los conflictos
  requieren actualizar antes de volver a editar.

## Rules separadas

`scripts/prepare-final-grades.cjs` genera `rules/final-grades/hotfix-strict.rules`
y `rules/final-grades/full-strict.rules` desde sus respectivas bases de
`rules/legacy-write-revision/`. Las bases permanecen intactas. Una prueba verifica
que, quitando el bloque agregado, el contenido coincide con la base (normalizando
solamente finales de línea).

El artefacto hotfix agrega exclusivamente notas legacy. El artefacto completo
agrega también notas instances y requiere el rollout multicarrera independiente.
No publicar las Rules completas para habilitar solamente notas legacy.
No se requieren documentos iniciales ni migración para empezar a cargar notas.

## Validación automatizada

- `node --test tests/final-grades.test.cjs tests/final-grades-ui.test.cjs`:
  18/18 PASS.
- `npm test`: 1126/1126 PASS.
- `node scripts/test-final-grades.cjs`: 27/27 PASS (incluye tres grupos),
  0 FAIL, 0 skipped, exit code 0. Legacy contra ambos artefactos e instances
  contra el completo, servicios reales y datos ficticios.
- `npm run build`: PASS. Advertencia existente de chunks mayores a 500 kB.
- `git diff --check`: PASS.

El runner acepta solamente Firestore local `127.0.0.1:8088` y el proyecto demo.
Cada grupo carga explícitamente su artefacto. Cubre CAS concurrente, privacidad,
revisiones, esquema, rangos, DELETE, autoridad, reset, onboarding, snapshots y
códigos repetidos entre carreras/instancias. No utiliza datos productivos.
Configurar Java 21 mediante `JAVA_HOME`; en este worktree puede reutilizarse el
cache local del repositorio padre mediante `FIREBASE_EMULATORS_PATH`.

## Revisión visual local aprobada

El usuario confirmó la aprobación visual y funcional del editor en tarjetas,
del detalle y del promedio. Guardar cierra el editor; cancelar no escribe;
un fallo conserva el editor abierto. La reapertura espera la revisión confirmada.

Desde este worktree, con Java 21, iniciar exclusivamente emuladores:

```powershell
npx.cmd --no-install firebase-tools emulators:start --project demo-correlativas-manual --config firebase.final-grades-emulators.json --only auth,firestore
```

En otra terminal ejecutar `npm run dev:emulator`, abrir
`http://127.0.0.1:5174` y verificar el indicador de Emulator. Usar una identidad
ficticia, nunca credenciales reales. La configuración separada carga las nuevas
Rules hotfix sin cambiar ninguna configuración existente.

1. Configurar una carrera y aprobar dos materias mediante el flujo existente.
2. En Materias guardar notas 6 y 9; Dashboard debe mostrar 7,50 y 2 de 2.
3. Quitar una nota; verificar promedio y cobertura, sin cambiar estados.
4. Cambiar un estado y ejecutar reset: las notas permanecen fuera del promedio.
5. Abrir dos pestañas, editar la misma nota y comprobar conflicto sin overwrite.
6. Revisar diseño desktop/mobile y navegación con teclado.

Antes de un futuro despliegue
se debe coordinar el artefacto de Rules compatible con el frontend: las Rules
actuales sin este agregado deniegan acceso a notas. Esto no habilita multicarrera
ni modifica writeRevision. No se ejecutó ninguna publicación.

## Procedimiento de despliegue propuesto, no ejecutado

1. Confirmar que Vercel omita Preview para esta rama antes del push/PR: Preview
   puede compartir variables Firebase productivas. No fusionar el PR todavía.
2. Antes de publicar Rules, obtener el snapshot vigente y compararlo con la base
   `rules/legacy-write-revision/hotfix-strict.rules`. Resolver cualquier divergencia
   antes de reemplazar Rules productivas; conservar ese snapshot para recuperación.
3. Con autorización independiente, publicar únicamente el artefacto
   `rules/final-grades/hotfix-strict.rules` mediante una configuración de release
   explícita para Rules. No usar el deploy genérico del repo: apunta a otro ruleset.
   No publicar `full-strict.rules` ni habilitar instances en este rollout.
4. Comprobar las Rules publicadas y luego autorizar por separado el merge/frontend.
   Main dispara el despliegue automático de Vercel. Validar notas, promedio, reset
   y privacidad con el procedimiento autorizado para producción.
5. Ante una regresión de interfaz, volver al frontend previo conservando las notas
   y las Rules compatibles. Revertir Rules al snapshot previo bloquearía lecturas
   y escrituras de notas del frontend nuevo; coordinarlo con rollback del frontend.
   No borrar notas ni retirar la protección writeRevision.

No se requieren migraciones. Los tests nuevos de Emulator tienen runner dedicado;
el workflow CI existente no lo invoca todavía. Ejecutarlo explícitamente para esta
revisión, sin confundir los jobs históricos con acreditación de estas nuevas Rules.
