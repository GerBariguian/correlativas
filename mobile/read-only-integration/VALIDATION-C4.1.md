# C4.1: catálogos UTN y adaptador read-only

Alcance: módulos puros, frontera específica, tests y documentación dentro de mobile/read-only-integration/. Sin pantallas, navegación ni C4.2. No se cambian C1/C2/C3, prototipo responsive, src, B, Rules o fixtures. No hay instalaciones, escrituras académicas, listeners Firestore, commit ni push.

## Archivos y frontera

- catalogRegistry.mjs: registro cerrado de utn-sistemas-2023 (44 actividades), utn-industrial-2023 (45) y utn-industrial-2007 (44). Importa solo subjects; no utiliza initialStatus. Copia y congela sus propios datos sin alterar los módulos originales.
- academicViewModel.mjs: validación de catálogo y proyección pura del snapshot vigente de C3.
- c4.mjs: entrada de biblioteca, sin efectos de red ni UI.
- importPolicy.c4.mjs y vite.c4.config.mjs: configuración independiente con ocho módulos fuente permitidos: tres propios, tres catálogos y los dos módulos puros academicOnboardingLogic.js/logic.js para reutilizar la validación de identidad. No admite SDKs, servicios con escritores, hooks productivos u otros catálogos. Las políticas C1–C3 permanecen intactas y siguen rechazando estos imports de datos.
- academicViewModel.test.mjs y c4-imports.test.mjs: 18 tests nuevos, incluyendo auditoría completa del grafo fuente.
- c4.emulator.integration.test.mjs y run-c4-integration.cjs: pruebas del bundle C4 con snapshots reales de C3 sobre B existente, sin seed/reset ni escrituras.

## Contrato

`academicViewModel({ scope, connectionId, connectionCurrent, snapshot }, catalogs = UTN_CATALOGS)`

El llamador aporta el scope actual completo, la identidad opaca de conexión C3 y una captura booleana estricta de su vigencia. El adaptador no consulta un cliente o SDK: es puro y sin caché. Comprueba snapshot.scope, snapshot.key y snapshot.connectionId frente a las entradas actuales. No acepta un resultado C2 crudo como si fuera un snapshot C3. La vigencia temporal y las generaciones continúan siendo responsabilidad de C3; un llamador no debe reutilizar una captura antigua de connectionCurrent.

Salida: state, queryState, catalogState, scope, rows y counts; revision solo para loaded. queryState conserva el estado original C3 aunque state sea error por catálogo/identidad. catalogState diferencia unselected, unknown, invalid y available. Los estados distintos de loaded no entregan filas, contadores ni revisión. No contienen una propiedad progress; los errores tampoco retienen filas previas. Idle o conexión no vigente nunca muestran datos académicos.

Los errores de entrada C3 sin scope se conservan como error sin datos. Una discrepancia de identidad se señala explícitamente y no se sustituye por otro contexto. Catálogo desconocido produce C4_UNKNOWN_CATALOG; referencias inválidas C4_INVALID_REFERENCE; códigos de progreso desconocidos C4_UNKNOWN_SUBJECT. Se rechaza la proyección completa, sin descartar silenciosamente códigos corruptos.

Cada fila conserva code, name, year, level, term y los tres tipos de correlatividad, más una copia completa de subject para conservar electivas, exclusiones de ALL y demás metadatos. recorded es booleano; status es uno de los cuatro estados registrados o null. Los contadores separan total, recorded, unrecorded y byStatus. No se calculan porcentajes, habilitaciones, recomendaciones ni estados derivados.

### Diferencias reales preservadas

- Los tres catálogos actuales usan year y no declaran level: se conserva year y level=null, sin inventar una etiqueta.
- Los períodos se conservan literalmente (Anual, Cuatrimestral, 1°/2° cuatrimestre, 2C, Actividad); no se fuerza una equivalencia.
- Industrial 2023 omite approvedPrereqs y finalPrereqs en 16 materias. La salida conserva null para información no declarada, distinto de [] explícito. No se amplía el alcance ni se modifica el catálogo para completarlos.
- ALL permanece como marcador exclusivamente de finalPrereqs; no se expande ni se usa para inferir habilitaciones. Se conservan elective y excludeFromAllFinals en subject.
- Se validan códigos únicos, campos básicos y referencias existentes; no se certifica la vigencia oficial del plan ni se evalúa la semántica académica completa o ciclos entre requisitos.

## Reproducción

Desde la raíz, con B ya disponible y dependencias existentes. Comprobar salida cero de cada comando. Los builds son secuenciales porque C1 recrea dist; C4 no debe construirse antes de C1 si se desea conservar todos los artefactos.

```powershell
node --test mobile/read-only-integration/isolation.test.mjs mobile/read-only-integration/academicRead.test.mjs mobile/read-only-integration/academicDecoders.test.mjs mobile/read-only-integration/academicQueryController.test.mjs mobile/read-only-integration/academicSessionController.test.mjs mobile/read-only-integration/useAcademicRead.test.mjs mobile/read-only-integration/academicViewModel.test.mjs mobile/read-only-integration/c4-imports.test.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c2.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3-manual.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c4.config.mjs
node mobile/read-only-integration/run-integration.cjs
node mobile/read-only-integration/run-c3-integration.cjs
node mobile/read-only-integration/run-c4-integration.cjs
git diff --check
```

## Evidencia y límites

- 53 tests unitarios/SSR/imports aprobados: 35 de regresión C1–C3 y 18 nuevos C4.1.
- Integración real: 13 casos C2, 5 C3 y 2 C4.1 aprobados. Node informa 14, 6 y 3 respectivamente al sumar cada contenedor. Total: 73 pruebas/casos, 0 fallidos y 0 omitidos (76 aprobados según el conteo Node con tres contenedores).
- Sistemas: 44 actividades, 4 registradas, 40 sin registro; Pendiente explícito solo en UTN-ISI23-04. Industrial 2023: loaded revisión 1 con 45 actividades sin registro, sin inventar Pendiente. Industrial 2007: archived, sin filas o progreso. Regresión de legacy revisión null y todos los estados C3 sin datos retenidos.
- Los tests negativos usan copias en memoria para catálogos desconocidos/incorrectos, código desconocido, estado/revisión inválidos, referencias inexistentes, duplicadas o autorreferentes y cambios de identidad/conexión. No alteran las fixtures Emulator.
- Integración C4 usa el bundle C2, los controladores compilados C3 y el bundle C4 con el SDK real en Node. Verifica Sistemas → Industrial → Sistemas, loading sin filas, archivo y desconexión sin datos anteriores. El guard del proceso permite solo 127.0.0.1:9199 y 8188 y no registra intentos externos. No es auditoría de Chrome o firewall del sistema.
- Builds C1, C2, C3, pantalla manual C3 y C4 aprobados, con control de imports. Generados bajo dist ignorados por Git. Sin cambios a contratos o políticas anteriores.
- Permanecen las advertencias de tamaño del chunk C1 y MODULE_TYPELESS_PACKAGE_JSON de los módulos ESM existentes. La pantalla manual usa React de desarrollo, sin minificar. No se modifican manifiestos para silenciarlas.

No hay UI C4 y no se acredita validación visual de C4 en Chrome. Los límites de C2/C3 sobre cancelación lógica, autoridad no atómica y ausencia de actualización automática se conservan. C4.2 requiere autorización aparte.
