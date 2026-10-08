# CI inicial (sin despliegue)

`Correlativas CI` corre en pull requests a main y workflow_dispatch. No publica
Rules, no migra datos y no usa secretos productivos. No activar required checks
hasta acreditar una ejecución real en GitHub/Linux.

Jobs: changes → node-build y Rules condicionales → ci-gate. Node/build corre
incluso si falla changes; el gate exige changes y node-build exitosos y verifica
los jobs Rules necesarios. Un workflow cancelado no acredita el gate.

PR: checkout del head SHA y diff contra merge-base del base SHA real del evento.
Dispatch: ambas suites Rules siempre; diff contra merge-base de origin/main,
o contra el padre del commit si se ejecuta exactamente en main.

Filtros conservadores en scripts/ci-plan.cjs: stage6 para src/tests/scripts,
firestore Rules/índices, configuraciones Firebase, dependencias, atributos y CI.
Hotfix para src/tests/scripts, sus artefactos/configuración y los archivos comunes
de dependencias/atributos/CI. Documentación sola omite Rules.

Node 24.21.0 y Ubuntu 24.04. Temurin 21 se resuelve mediante setup-java;
su patch exacto queda registrado en logs y GITHUB_STEP_SUMMARY en cada ejecución.
No se afirma equivalencia de patch con Java Windows. Actions oficiales fijadas
por SHA: checkout v6.0.2, setup-node v6.2.0, setup-java v5.2.0; refs verificadas
en sus repositorios oficiales. npm ci usa el lockfile, cache npm no node_modules.

Se reutilizan npm test, npm run build, test-etapa6-final.cjs y
test-migration-users-hotfix.cjs. No se suma un glob de tests ni test:rules histórico.
Las exclusiones acreditadas de Etapa 6 siguen explícitas en su runner.

El chequeo de diff reconoce CR como parte del final de línea mediante
core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol sólo en el
comando. No cambia bytes ni hashes de los artefactos -text.

Validación local final (2026-10-07):

- YAML y estructura del workflow PASS; acciones oficiales fijadas por SHA.
- Filtros/gate y comparación Git real en repositorio temporal: 5/5 PASS.
  Incluye PR con cambios exclusivos en su base y dispatch en main/branch.
- npm test: 979/979 PASS, 0 FAIL. Los tests propios del CI se ejecutan aparte.
- Build PASS; permanece la advertencia conocida de tamaño de bundle.
- Emulator Etapa 6: 221/221 PASS, exit 0, sin validPathFailure.
  Se recuperó el resultado completo de la ejecución iniciada antes del corte;
  sus suites, Rules y runner no cambiaron posteriormente. La deuda negativa
  diferida conserva su clasificación; estos resultados no la cierran.
- Emulator hotfix reejecutado: 10/10 PASS, T9/T10 PASS, exit 0.
- Sintaxis y diff check PASS, incluido el diff acumulado desde origin/main
  con el tratamiento explícito de CR descrito arriba.

Se reprodujo el fallo de Planner con App y test idénticos a HEAD antes de
corregirlo: el harness omitía el stub JointCWorkspace. Se agregó únicamente
ese stub, preservando las aserciones y el código de producto. También se quitó
una línea vacía al final del runner hotfix que hacía fallar el diff acumulado;
no se modificó su lógica ni los artefactos Rules de bytes exactos.

Pendiente de la primera ejecución real: npm ci en un checkout limpio Linux,
disponibilidad de Node 24.21.0, patch Temurin resuelto, contextos/expresiones
GitHub, filtros sobre PR/dispatch y resultado del gate en el servicio Actions.
Las pruebas locales Windows no acreditan esas condiciones. Después de comprobar
PR y dispatch, ci-gate será el único check candidato a required, mediante
autorización separada. Este workflow no ensaya el merge commit automático:
valida el head del PR; debe mantenerse actualizado con main antes del merge.

## Firebase Preview aislado — pendiente

CI sólo usa proyectos demo y Emulator; no crea un entorno Firebase Preview.
Antes de probar previews conectados a Firebase se requiere un proyecto no
productivo separado (Auth/Firestore), datos sintéticos, Rules/índices compatibles
y variables VITE_FIREBASE_* exclusivas del entorno Preview de Vercel. Esas
variables deben quedar separadas de Production; no copiar usuarios ni datos
reales. Definir dominios Auth permitidos para URLs de preview controladas,
responsables de publicación, límites de uso y procedimiento de eliminación de
datos de prueba. Verificar primero el projectId efectivo y el aislamiento.

La creación/configuración de ese entorno y cualquier publicación requieren
autorización posterior. Hoy producción continúa con fe44b29 y el hotfix mínimo;
el CI no publica las Rules completas ni habilita migraciones. Push/merge a main
continúa disparando Vercel: aprobar CI no constituye aprobación de release.
La implementación local no cambia el ruleset ni autoriza push/PR/merge.
