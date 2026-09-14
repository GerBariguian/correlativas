# Planificar con amigos — fase 1

Implementación para Firebase Spark, sin funciones, dependencias nuevas ni despliegue automático.

## Publicación manual obligatoria

1. Respaldar las reglas actuales de Firebase Console → Firestore Database → Rules.
2. Publicar el contenido completo del `firestore.rules` de este repositorio. Conserva las reglas de Amigos y agrega `acceptedPlanningFriend`, `planningSharing` y `planningSnapshots`. Si producción tiene cambios ajenos al repositorio, revisarlos antes de reemplazar. No dejar reglas generales permisivas, porque se combinan con OR.
3. Publicar las reglas **antes de usar este cliente**: guardar progreso ahora lee el consentimiento del propietario. Con las reglas anteriores, esa lectura falla y el guardado no se confirma. No hay fallback que omita consentimiento/snapshot.
4. Actualizar o recargar el cliente en las cuentas de prueba. No hace falta crear documentos ni índices manualmente. El consentimiento está apagado si falta el documento.
5. Usar dos cuentas Google con amistad `accepted` y la misma carrera/plan. En Amigos activar el control en una de ellas. En la otra entrar a Planificador, seleccionar ese amigo y abrir Comparar avance.

No se ejecutaron commits, push, despliegues ni cambios del plan Firebase. Las reglas no fueron publicadas ni ejecutadas contra una base real desde esta tarea.

## Modelo

- `planningSharing/{uid}`: `enabled`, `sharedCareerId`, `updatedAt`. Un único plan compartido explícitamente por usuario. Propietario y amigos aceptados pueden leer este consentimiento; solo el propietario puede escribirlo. No admite listados generales.
- `planningSnapshots/{uid}/careers/{careerId}`: `approvedCodes`, `availableToCourseCodes`, `sourceUpdatedAt`, `updatedAt`, `schemaVersion` (1), `logicVersion` ('1'), `catalogVersion` (huella de códigos y correlativas de cursada del catálogo). No contiene nombre, email, `statusMap`, regularizadas ni cursando.
- `users/{uid}/careers/{careerId}`: sigue siendo el progreso privado original. No se agregan permisos de lectura a amigos ni confirmaciones manuales de revisión.

Las reglas leen internamente documentos privados para comprobar vigencia y carrera del lector. Eso **no** concede al navegador del amigo acceso a esos documentos.

## Persistencia y privacidad

`saveUserStatus` delega en `savePlanningProgress`. La transacción lee el consentimiento y guarda el progreso. Si está activo para esa carrera, publica también el resumen derivado de exactamente ese mapa. Ambos comparten el timestamp del progreso de origen. El mapa se reemplaza como campo completo, preservando otros campos del documento privado.

Activar o actualizar la compartición lee el progreso guardado dentro de una transacción y genera el snapshot. Si aún no había documento, guarda el estado inicial que la app ya utiliza. No pide confirmación de progreso revisado. La transacción también escribe el consentimiento. Desactivar solo actualiza consentimiento: los resúmenes anteriores quedan almacenados, inaccesibles para amigos mientras esté apagado.

Guardar progreso y cambiar consentimiento concurrentemente generan conflictos de transacción y reintentos de Firestore. Si una escritura falla, no se aplica parcialmente y App conserva su manejo de errores. Las transacciones requieren conexión; el apagado queda efectivo para nuevas lecturas cuando Firebase confirma la operación, no antes de recibirla.

Para leer un snapshot ajeno deben cumplirse todas estas condiciones: sesión Google verificada, amistad `accepted` en cualquiera de los dos órdenes de UID, compartición activa, carrera compartida igual a la ruta, carrera activa guardada del lector igual a esa carrera y `sourceUpdatedAt` igual al `updatedAt` del progreso privado. Los listados de snapshots están prohibidos. Escrituras: propietario, campos permitidos, arrays limitados y sin duplicados/intersección, versiones y fechas válidas, fuente y consentimiento coherentes mediante `getAfter`.

El acceso deja de cumplir las reglas si desaparece la amistad o cambia su estado a cualquier valor distinto de `accepted`. No se agregó UI ni una transición nueva para eliminar amistades; la eliminación administrativa de una relación sirve para verificar la revocación. La lectura no depende de que el lector también comparta su progreso.

No se cachean resúmenes de amigos en localStorage. Se descartan resultados de suscripciones anteriores y resultados de caché o escrituras pendientes que todavía no fueron confirmados por servidor. Desactivar o perder autorización retira la comparación. No es posible revocar información que alguien ya vio o copió.

Referencias de Firebase: [transacciones](https://firebase.google.com/docs/firestore/manage-data/transactions) y [condiciones/reglas y getAfter](https://firebase.google.com/docs/firestore/security/rules-conditions).

## UI y alcance

- Amigos: control `Compartir mi progreso con amigos`, explicación de los dos conjuntos y audiencia (todos los amigos aceptados, incluidos futuros). Muestra la carrera compartida. Cambiar de carrera en la app no cambia ese permiso; `Compartir la carrera seleccionada` lo cambia explícitamente.
- Planificador: un solo amigo seleccionado, vistas `Mi selección` y `Comparar avance`. Quitar amigo solo retira la selección de comparación, no elimina la amistad.
- Comparar avance: capas Aprobadas / Habilitadas y tarjetas con color más texto: ambos, solo vos, solo el amigo o sin información en esa capa. El detalle no revela otros estados.
- Compatible significa el mismo ID de carrera/plan del catálogo y la misma huella del catálogo/lógica. No se comparan materias por nombre entre planes. Los planes actuales rotulados “A confirmar” conservan esa limitación del catálogo.
- Habilitada significa cumplimiento de correlativas con el progreso registrado, no oferta, cupo ni horario. No hay recomendaciones nuevas, intención de cursada, multi-amigo ni logros.

## Vigencia y límites

- La huella de catálogo se calcula a partir de los datos que utiliza `availableToCourse`. Si se cambia esa lógica, subir `PLANNING_LOGIC_VERSION` y coordinar las reglas. Versiones incompatibles se muestran como resumen desactualizado.
- Un cliente antiguo puede guardar progreso sin regenerar resumen: al cambiar `updatedAt`, las reglas invalidan el snapshot anterior para terceros. El propietario lo regenera con `Actualizar datos compartidos` o un guardado de progreso desde el cliente nuevo.
- Si se deniega una suscripción por vigencia/permisos, la comparación se retira. Puede ser necesario `Reintentar conexión` después de corregir la causa. No se confunde falta de datos con materias pendientes.
- La derivación sigue siendo autodeclarada desde cliente. Las reglas protegen acceso y estructura, no certifican resultados académicos ni ejecutan todas las correlativas. Las listas además se validan contra el catálogo en el lector.
- El progreso propio mostrado por PlannerPage proviene de App, cuyo flujo previo no escucha cambios de progreso hechos en otra pestaña. Recargar para recibir cambios externos del progreso propio. El progreso de amigos sí se observa mediante snapshots.
- Los resúmenes revelan aprobaciones y habilitaciones; esto permite inferir parte de las correlativas cumplidas. No compartir el mapa completo no implica ausencia total de inferencias.

## Pruebas

`node --test tests/friends.test.cjs tests/planning.test.cjs`

33 pruebas locales con adaptadores Firestore simulados: regresión de Amigos, derivación y comparación, versiones, default apagado, habilitación inicial, guardado/reset atómico, fallos sin cambios parciales, carrera compartida estable, sesiones inválidas, incompatibilidad, desactivación, errores de permisos, respuestas tardías y datos offline. No sustituyen la ejecución de reglas.

No hay Java ni Firebase CLI disponibles en este entorno; no se ejecutó Emulator Suite. Antes de habilitarlo a usuarios, probar las reglas en un proyecto de prueba o emulador:

1. A y B aceptados, C ajeno: A puede leer el snapshot de B solo si B comparte el mismo plan. C no puede. A nunca puede leer `users/B/careers/...`.
2. Solicitud pendiente/rechazada: no permite leer snapshots ni consentimiento ajeno.
3. Apagar sharing confirmado en B: un nuevo `get` desde A debe fallar y la comparación debe desaparecer. Si se quita administrativamente la relación accepted, también debe fallar.
4. Listar `planningSnapshots` o su subcolección: denegado, incluso al propietario; solo lecturas directas.
5. Intentar escribir como B desde A, agregar `statusMap`, `takingCodes`, `regularizedCodes` u otros campos: denegado.
6. Cambiar el timestamp privado sin actualizar snapshot: lectura ajena denegada. Guardar desde el cliente nuevo: ambos timestamps coinciden.
7. Cambiar solo la carrera activa de A: no permite leer el snapshot de otro plan. Cambiar la carrera compartida de B: el snapshot anterior deja de ser legible para amigos.
8. Comparar con sharing propio apagado y el de B prendido: permitido. Activar/desactivar al mismo tiempo que B guarda progreso: sin estados parcialmente publicados.
