# Fase B: frontera local de escritura legacy

Estado: implementación local acreditada; matriz Emulator 108/108 PASS y Node 1108/1108 PASS.
No se publicaron Rules ni se modificaron configuraciones de despliegue.

## Contrato

`users/{uid}/careers/{careerId}` incorpora `writeRevision`: entero seguro positivo.
Ausencia se interpreta como cero únicamente para calcular la primera escritura (1).
Un valor presente inválido falla; nunca se normaliza a cero. Cada escritura legítima
incrementa dentro de la transacción. El agotamiento del entero seguro bloquea.
Guardado habitual conserva las operaciones por materia de Fase A; onboarding
conserva su merge de claves ausentes. Reset compara además la revisión esperada.
Sharing incorpora revisión cuando necesita inicializar/completar el documento.
Operaciones sin cambios no fuerzan una escritura ni enrolan el documento.
Instances mantiene su contrato `revision` sin cambios.

## Artefactos (no configurados para deploy)

- `rules/legacy-write-revision/hotfix-transition.rules`
- `rules/legacy-write-revision/hotfix-strict.rules`
- `rules/legacy-write-revision/full-transition.rules`
- `rules/legacy-write-revision/full-strict.rules`

`node scripts/prepare-legacy-write-revision.cjs` los reproduce desde los originales.
Sólo sustituye el grant de `users/{uid}/careers/{careerId}`; los archivos base
permanecen intactos. No publicar las Rules completas como parte de este hotfix.
La validación de Node compara los artefactos con el generador.

Transición admite el contrato anterior sólo mientras tanto el documento anterior
como el resultante carezcan de revisión. Una primera escritura con revisión activa
la frontera de manera irreversible bajo estas Rules. DELETE de protegidos se deniega.
Estricto exige revisión incluso en creación y primera actualización de documentos
sin revisión; deniega todo DELETE de progreso. Lecturas privadas se conservan.
Las escrituras protegidas exigen timestamp servidor, estados válidos, cambios sólo
en progreso/timestamp/revisión y snapshot contemporáneo compatible con consentimiento
cuando sharing esté activo. No se recalcula elegibilidad académica dentro de Rules.

## Validación reproducible

`node scripts/test-legacy-onboarding-race.cjs`

Usa exclusivamente el Emulator local 127.0.0.1:8088 y proyecto demo-correlativas-rules.
No ejecutarlo contra un Emulator ocupado por otra sesión: el harness borra sólo
los datos de su proyecto de pruebas. Incluye ambos originales, cuatro artefactos,
escritor antiguo de `916bf6c:src/services/planning.js` como fixture y regresiones
de onboarding/instances. Los rechazos deben ser permission-denied sin agotamiento
de recursos; el test no presenta esos errores como prueba lógica.

## Rollout propuesto, no ejecutado

Gradual: acreditar artefactos; publicar transición sobre snapshot productivo actual;
publicar cliente compatible; activar onboarding; cerrar posteriormente con estricto.
Una cuenta enrola cada carrera al escribir. Las carreras no enroladas siguen
expuestas a clientes antiguos. Leer, habilitar sharing sobre progreso ya completo
o un guardado vacío no garantiza enrolamiento. No afirmar protección global durante
la transición.

Estricto inmediato: protege también carreras existentes sin revisión, sin reescribir
sus datos. El cliente compatible puede realizar su primera escritura con revisión 1.
Las pestañas antiguas reciben rechazo y necesitan recargar; no se puede mantener su
escritura y garantizar simultáneamente esta protección. Coordinar publicación del
frontend compatible con la activación: una ventana controlada de edición suspendida
es preferible a permitir escrituras antiguas. No requiere migración de datos.

Enrolamiento preventivo masivo sería una migración/control administrativo adicional,
no implementado ni autorizado aquí. No es necesario para activar estricto.

Rollback: mantener la frontera y revisiones; usar un frontend compatible o dejar
edición temporalmente suspendida. Volver a Rules originales reabre la pérdida de datos.
No eliminar revisiones ni restaurar mapas completos automáticamente.

## Límites

Rules acredita el incremento respecto del documento vigente, no que el cliente
utilizó la UI correcta. Un cliente adaptado que lea la revisión y envíe un mapa viejo
puede cumplir ese requisito: Fase A sigue siendo necesaria. Las precondiciones por
valor tienen límite ABA; reset sí compara revisión global. Los documentos inválidos
requieren diagnóstico, no reparación silenciosa. Presupuestos de Rules y regresiones
deben acreditarse antes de cualquier publicación.


## Corrección de concurrencia y acreditación local

El diagnóstico aislado registró lecturas simultáneas de revisión 0 y propuestas de
revisión 1. Una transacción ganadora cambia la revisión; las restantes pueden recibir
permission-denied de la condición nueva = anterior + 1 antes del ABORTED que normalmente
provoca el reintento automático. El SDK instalado clasifica permission-denied como
permanente. La revisión ya se recalculaba correctamente en cada ejecución del callback.

El guardado habitual ahora permite hasta tres recuperaciones adicionales únicamente
si hubo una escritura preparada y una lectura de servidor confirma avance de revisión.
Revalida sesión/contexto y las precondiciones originales; no las reemplaza por valores
nuevos. Cada intento vuelve a comprobar autoridad, progreso y consentimiento en una
transacción. Sin avance, sin escritura preparada o al agotar el límite, propaga error.
Un conflicto de materia o reset no se reintenta. La lectura posterior a un commit
exitoso queda fuera de esta recuperación. Rules y sus artefactos no se debilitaron.

El harness usaba Promise.all: el primer rechazo permitía iniciar clearFirestore
mientras otras transacciones continuaban, causando Transaction lock timeout. Ahora
usa allSettled antes de comprobar resultados o limpiar y usa tres contextos distintos.

- Aislado: 18 PASS, 0 FAIL, 52 omitidos deliberadamente (grupos incluidos).
- Matriz completa: 108/108 PASS, 0 FAIL, 0 skipped, exit code 0.
- Node: 1108/1108 PASS, 0 FAIL.
- Build y git diff --check: PASS. Advertencia existente de tamaño de bundle.
- Sin agotamiento de recursos observado en la matriz.

Comando aislado: node scripts/test-legacy-onboarding-race.cjs --isolated
Comando completo: node scripts/test-legacy-onboarding-race.cjs

Una contención que supere el límite sigue causando error seguro y requiere recargar;
no se promete progreso ilimitado bajo escrituras continuas. Un rechazo de permisos
simultáneo con avance de revisión puede ocasionar una comprobación adicional; nunca
se omiten las validaciones ni se concede permiso desde el cliente.
