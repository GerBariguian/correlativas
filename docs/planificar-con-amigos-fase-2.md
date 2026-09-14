# Planificar con amigos — Fase 2

Implementación sobre Fase 1, sin dependencias nuevas, Cloud Functions ni cambios de Firebase Spark. No se publicaron reglas ni se hicieron commits, push o deploy.

## Modelo final

| Ruta | Campos y propósito |
| --- | --- |
| `users/{uid}/careers/{careerId}` | Progreso privado original, sin cambios de estructura ni permisos para amigos. |
| `planningSharing/{uid}` | `enabled`, `sharedCareerId`, `consentVersion` (2 en el cliente nuevo), `updatedAt`. Si no existe, compartir está apagado. Documentos antiguos sin versión equivalen a consentimiento 1. |
| `planningSnapshots/{uid}/careers/{careerId}` | `approvedCodes`, `availableToCourseCodes`, `pendingFinalCodes` solo en esquema 2, `schemaVersion`, `logicVersion`, `catalogVersion`, `sourceUpdatedAt`, `updatedAt`. |
| `jointPlans/{planId}` | ID aleatorio. `ownerId`, `careerId`, `inviteeIds` (hasta 4), `memberIds` (hasta 5, incluye creador), `closed`, `createdAt`, `updatedAt`. |
| `jointPlans/{planId}/subjects/{code}` | `code`, `proposedParticipantIds` (2 a 5), `updatedAt`. Una propuesta por materia; volver a guardarla reemplaza su subconjunto. |

`socialProfiles`, `socialEmails` y `friendships` se mantienen. No se copian combinaciones del mapa, perfiles o estados académicos al plan. Los nombres se resuelven desde los perfiles mínimos de amigos directos; para otros participantes se muestra UID. Los participantes de un plan pueden conocer los identificadores de los demás y las propuestas de materias del plan.

## Comparación y finales pendientes

`PlannerPage` conserva la selección individual. Usa `usePlanningParticipants` para cargar los amigos aceptados y escuchar separadamente sus snapshots. Máximo 4 amigos además del usuario. Elegir/quitar amigos no crea planes ni modifica amistades. El hook anterior `usePlanningFriend` fue reemplazado.

Las capas Aprobadas / Habilitadas / Finales pendientes usan `compareParticipants`, una función pura. Cada materia tiene coincidencias conocidas, participantes sin datos y total seleccionado. “Todos” exige datos de todos en esa capa y coincidencia de todos. Un permiso apagado, otro plan, una respuesta pendiente o un snapshot inválido nunca reducen el denominador. Un snapshot antiguo puede servir para aprobadas/habilitadas y ser desconocido en finales. La falta de datos no se interpreta como una lista vacía.

Categorías visuales estables: todos, subconjunto, solo usuario, solo amigo, sin coincidencias conocidas; bordes discontinuos cuando falta información. Texto y contador complementan el color. Hay filtro de coincidencias de al menos dos personas. Al tocar una materia se muestra cada participante y su presencia/ausencia/desconocimiento en la capa. Los nombres de las tarjetas evitan asignar colores a cada combinación.

`pendingFinalCodes` incluye **exactamente materias cuyo estado guardado es Regularizada**. No se filtra por `canTakeFinal`: tener final pendiente no garantiza estar habilitado para rendirlo hoy. Se excluyen aprobadas, cursando y pendientes. Este conjunto permite conocer qué materias están regularizadas: la privacidad se explica como información expresamente consentida, no como anonimización.

## Consentimiento, coherencia y revocación

- Un permiso anterior no autoriza finales automáticamente: `savePlanningProgress` mantiene snapshots de esquema 1 hasta la acción explícita “Autorizar compartir también finales pendientes”. Esa acción respeta la carrera que ya se compartía. Después puede cambiarse explícitamente la carrera compartida.
- Activar/actualizar genera un snapshot de esquema 2 desde el progreso persistido, sin confirmación recurrente de revisión. Guardar progreso y snapshot usa la misma transacción y timestamp de origen. El reset pasa por esa misma persistencia.
- Cambiar de carrera activa no cambia silenciosamente la carrera compartida: se mantiene la decisión explícita de Amigos. Comparación compatible exige el mismo `careerId` y huella de catálogo/lógica; los planes “A confirmar” siguen dependiendo de la calidad del catálogo actual.
- Las reglas requieren propietario para escribir; para lecturas ajenas requieren Google verificado, amistad accepted, sharing activo, carrera compartida correspondiente, carrera activa del lector compatible y timestamp de origen vigente. Esquema 2 requiere consentimiento 2. Se prohíben listados de snapshots y campos adicionales.
- Desactivar corta nuevas lecturas **cuando Firestore confirma la escritura**. Si no hay conexión, se informa el error/estado y no se finge una revocación ya aplicada. Los documentos pueden seguir almacenados, pero ya no son legibles por amigos. No puede retirarse información ya vista o copiada.
- Eliminar administrativamente la amistad o cambiarla a un estado no accepted revoca el acceso. No se agregó UI de eliminación de amistades.
- No se guarda progreso ajeno en localStorage. Las suscripciones descartan datos de caché y escrituras pendientes, errores, resultados tardíos y sesiones anteriores. Perder datos deja al participante seleccionado con explicación. “Reintentar conexión” vuelve a verificar.

## Plan conjunto: propuesta persistida y permisos

1. Desde el detalle de una materia en Habilitadas con al menos dos coincidencias, “Agregar al plan conjunto” abre la tercera pestaña con la materia candidata. Todavía no escribe datos.
2. Se elige un plan propio abierto o se pulsa explícitamente “Crear plan e invitar”. La creación exige en la UI que todos los amigos seleccionados tengan datos compatibles disponibles. Las reglas comprueban amistad directa accepted con cada invitado y carrera activa del creador. No hay grupo permanente.
3. Inicialmente solo el creador está en `memberIds`. Cada invitado puede ver los metadatos, aceptar o rechazar. Para unirse, las reglas comprueban su carrera activa. Hasta aceptar no puede leer la subcolección de materias.
4. Solo el creador propone/quita materias. Elige al menos dos personas con habilitación conocida en la selección actual; pueden ser subconjuntos distintos por materia, incluso un subconjunto sin el creador. Pueden incluir invitados pendientes, identificados como tales. El guardado es una **propuesta del creador**, no una declaración de intención individual de los demás.
5. Los miembros ven las propuestas; para mostrar habilitación académica se usa exclusivamente el progreso propio y los snapshots de amigos directos seleccionados. La membresía del plan nunca habilita lecturas académicas de otros participantes.
6. Salir/rechazar quita al usuario de `memberIds` e `inviteeIds` en una transacción. No puede agregarse a otros ni cambiar su participación. La lectura se revoca; las propuestas existentes se conservan y marcan al participante como pendiente/salido. No se reinvita en esta versión.
7. El creador puede cerrar el plan, pero no transferirlo ni salir dejando un plan sin dueño. Cerrar impide editar, aceptar invitaciones y leer materias como invitado. Los invitados aún pueden salir. El creador conserva permisos de lectura de los datos, aunque esta UI muestra el estado cerrado sin las materias. No hay reapertura ni borrado físico desde la UI.

### Lectura y escritura

| Acción | Autorización |
| --- | --- |
| Crear | Propietario autenticado con Google; 1–4 amigos directos accepted; carrera activa propia. |
| Leer metadatos | Creador o invitado explícito con amistad accepted directa con el creador. |
| Leer materias | Creador, o invitado que aceptó, permanece en ambos arrays, conserva amistad accepted con el creador y el plan sigue abierto. |
| Agregar/reemplazar/quitar materia | Solo creador de plan abierto. Campos limitados a código, participantes propuestos y fecha. |
| Unirse | Solo el propio invitado, con carrera activa compatible y plan abierto. No puede incluir a otro UID. |
| Salir/rechazar | Solo el propio invitado; no puede remover al creador ni a otras personas. |
| Cerrar | Solo creador. No puede cambiar identidades, carrera ni participantes arbitrariamente. |

Ser amigo de un miembro no da acceso al plan. Estar invitado o unido no da acceso a `users/...` ni al snapshot de alguien que no es amigo directo. Si se revoca la amistad con el creador, las lecturas ajenas del plan se deniegan aunque su UID aún figure en los arrays; el creador conserva sus propuestas.

Las consultas son por `ownerId == uid` para planes propios; para invitaciones se consulta por cada amigo directo, con `ownerId == amigoUid` e `inviteeIds array-contains uid`. Esto permite comprobar amistad en reglas y evita un directorio de planes. Se agrega el índice compuesto descrito abajo. Los planes se cargan al visitar por primera vez la pestaña Plan conjunto y se mantienen mientras está montado el Planificador.

## Cambios de datos y límites del MVP

- Una materia propuesta que ya no está habilitada permanece en el plan con “Ya no figura como habilitada”. Sin snapshot válido se muestra “Sin datos actuales”, no se presume deshabilitada. Si salió el participante se indica pendiente/salido.
- Al recargar se recuperan los planes y las invitaciones desde Firestore. La selección temporal de amigos y del plan abierto no se guarda: hay que volver a elegirlos. Para evaluar habilitación de miembros, seleccionarlos también en la comparación; miembros ajenos a tus amistades directas siempre quedan sin datos académicos.
- La carrera del plan queda fija. Cambiar de carrera en la app muestra los planes correspondientes a la nueva carrera; no borra los anteriores. Los permisos de lectura del plan son por participación, no dependen de compartir progreso ni de seguir con esa carrera activa. Los snapshots sí dependen de compatibilidad/consentimiento.
- No hay confirmación individual por materia; solo propuesta del creador y aceptación del acceso al plan. No se afirma que cada participante ya quiera cursar lo propuesto. No hay período de cursada, oferta real, horarios, comisiones, cupos ni inscripción.
- Las reglas validan acceso, forma, pertenencia y coherencia de timestamps. No ejecutan el catálogo ni certifican la verdad de los estados autodeclarados. Un creador puede proponer un código desde otro cliente: no es prueba de elegibilidad. El lector valida los snapshots contra su catálogo.
- El progreso propio sigue el flujo existente de App: no escucha cambios de otra pestaña; recargar para recibirlos. No se reescribió esa arquitectura.
- Lecturas en Spark: hasta cuatro snapshots seleccionados y sus permisos; consultas de planes por cada amigo aceptado. Cada consulta/suscripción y las comprobaciones dependientes pueden generar lecturas. No se habilitó facturación. Para muchas amistades/planes hará falta paginación o bandeja explícita; no se amplió esa infraestructura ahora.
- No hay limpieza física automática de planes cerrados ni snapshots revocados. No hay notificaciones, chat, rankings, logros ni grupos sociales permanentes.

## Protección del borrado

Se retiró “Reiniciar” de Header. En Materias → “Opciones avanzadas de esta carrera” aparece “Borrar progreso de esta carrera”. Un diálogo modal muestra carrera/plan y la advertencia irreversible, enfoca Cancelar y requiere “Sí, borrar progreso” con estilo rojo. Impide envíos duplicados y cerrar con Escape mientras guarda. Cambiar de carrera desmonta el diálogo.

El cuerpo de `reset()` conserva `persistStatus(() => initialStatus)`; solo se trasladó la confirmación. No borra otras carreras, amistades, permisos, planes ni la selección individual. Si sharing está activo, actualiza el snapshot de esa carrera a través del mecanismo de persistencia existente.

## Pruebas y validaciones

Ejecutar desde la raíz:

```text
node --test tests/friends.test.cjs tests/planning.test.cjs tests/jointPlans.test.cjs tests/planning-ui.test.cjs
npm.cmd run build
```

Pruebas con SDK Firestore simulado, lógica pura y ejecución de hooks/componentes mediante un adaptador local. Cubren Amigos/Fase 1, finales y consentimiento antiguo/nuevo, 2 y varios participantes, subconjuntos/desconocidos, límite de cuatro, atomicidad, cierres de sesión/respuestas tardías, crear/editar/salir/cerrar plan, permisos simulados, conservación de propuestas y alcance/confirmación del reset. Se usa el transformador de Rolldown ya instalado por Vite, sin agregar dependencias.

**No son pruebas del intérprete real de Firestore Rules.** En este entorno no hay Java/Firebase CLI ni navegador conectado para comprobar visualmente. Se revisaron CSS responsive y manejadores localmente. Validar mobile/desktop y la matriz de reglas siguiente antes de habilitar usuarios reales.

## Pasos manuales exactos antes de Firebase real

1. Preferir un proyecto Firebase de prueba Spark con Authentication Google y Firestore. Configurar sus variables `VITE_FIREBASE_*` en el entorno local; nunca mezclar cuentas/datos reales de producción con las pruebas destructivas.
2. Respaldar las reglas publicadas. En **Firestore Database → Rules**, pegar el contenido completo de `firestore.rules` del repositorio, revisar cualquier regla propia no presente aquí y publicar manualmente. Se mantienen Amigos y privacidad de `users`, se amplía consentimiento/snapshot y se agrega `jointPlans` con su subcolección. No añadir reglas generales permisivas: se combinan con OR. Publicar reglas **antes** de probar el cliente Fase 2, o sus escrituras de esquema 2/planes fallarán.
3. En **Firestore Database → Indexes → Composite → Add index**, crear: colección `jointPlans`, campo `ownerId` Ascending, campo `inviteeIds` Arrays/Array contains, query scope Collection. Es la definición de `firestore.indexes.json`. Esperar a que esté habilitado. No se ejecutó ningún comando de despliegue; no hace falta crear manualmente otros documentos ni migrar todos los usuarios.
4. Usar cuentas Google de prueba A, B, C, D y E del mismo `careerId` para comparar hasta cinco personas, más una cuenta F ajena y otra carrera/plan para probar incompatibilidad. Crear amistades directas necesarias desde Amigos y aceptarlas. Probar búsqueda exacta por email y rechazo de solicitudes.
5. En Amigos, habilitar sharing explícitamente. Para un permiso de Fase 1, comprobar que no publica finales al guardar progreso hasta pulsar “Autorizar compartir también finales pendientes”. Verificar esquema 2 y `consentVersion: 2` después. Ninguna confirmación recurrente de progreso revisado es necesaria.
6. En Planificador seleccionar B/C/D/E: probar las tres capas, coincidencia de todos, subconjuntos, un amigo sin sharing y otro incompatible. Un desconocido debe conservarse en el total; nunca mostrar “Todos” excluyéndolo. Probar nombres largos y 360–390 px de ancho, desplazamiento horizontal del mapa y el diálogo de borrado con teclado y touch.
7. Crear plan A con B/C y materias para subconjuntos diferentes. B debe ver invitación, no materias antes de aceptar. Después de unirse, B puede leer pero no editar materias/cerrar el plan. B puede salir; sus propuestas se conservan sin acceso posterior. Cambiar una habilitación y comprobar la advertencia sin eliminación de la fila. Recargar y comprobar persistencia del plan.
8. Ejecutar la matriz de permisos siguiente mediante Emulator Suite cuando esté disponible o cuentas/SDK de prueba en ese proyecto. Revisar compilación de reglas e índice antes de llevar estos cambios a producción.

### Matriz de permisos a verificar en motor real

- A nunca puede leer `users/B/careers/{careerId}`; ni por amistad ni por pertenecer a un plan. También denegar listados de `planningSnapshots` y sus subcolecciones, aun al propietario.
- A solo puede obtener directamente el snapshot de B si existe amistad accepted, B comparte el plan compatible y timestamps coinciden. Sharing apagado, relación pendiente/rechazada/eliminada, otro plan y timestamp desactualizado deben denegar nuevas lecturas.
- Escritura de snapshot ajeno, campos `statusMap`/`takingCodes`/otros extras, arrays duplicados o intersectados, esquema 2 sin permiso 2 y timestamps falsos deben fallar.
- `jointPlans` sin filtros debe fallar. Las dos consultas del servicio deben funcionar con el índice. F no puede leer el documento o materias por ID conocido ni listarlos.
- B invitado solo puede leer metadatos. Tras aceptar, puede leer materias; cambiar por SDK `ownerId`, `careerId`, `closed`, o incluir/quitar C en arrays debe fallar.
- Intentar crear con un invitado sin amistad directa, más de 4 invitados, duplicados, auto-invitación o `memberIds` con otro usuario ya unido debe fallar.
- Solo A puede agregar/quitar materias en plan abierto. Campos académicos extra y participantes externos al plan deben fallar. Cerrar impide nuevas propuestas e invitaciones aceptadas; el invitado aún puede salir.
- Eliminar administrativamente A:B revoca lectura de B del plan y de snapshots de A. Ser amigo de C no debe devolver acceso a B. Desactivar sharing de A no elimina por sí solo el acceso legítimo de B a las propuestas del plan: son permisos separados.
- Salir retira únicamente al propio usuario y deja las materias. Una actualización concurrente de participación/propuesta debe reintentarse o fallar, nunca conceder acceso a otro usuario.
- Con datos de prueba, cancelar “Borrar progreso” no escribe; confirmarlo solo reinicia la carrera seleccionada y su snapshot consentido. Otras carreras, Amigos, planes y permisos permanecen intactos.
