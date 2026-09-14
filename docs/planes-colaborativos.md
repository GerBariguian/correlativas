# Planes conjuntos colaborativos

Evolución de Fase 2 sobre las mismas colecciones, sin nuevas dependencias, Cloud Functions ni cambio de Firebase Spark. No se hicieron commit, push, deploy o publicación de reglas.

## Modelo

`jointPlans/{planId}` conserva `ownerId`, `careerId`, `memberIds`, `inviteeIds`, `closed`, `createdAt`, `updatedAt`, y añade:

- `name`: nombre humano, normalizado, entre 1 y 80 caracteres. Sin caracteres de control. Opcional en documentos antiguos. Si no se ingresa al crear, se persiste un nombre como “Plan con Juan y Nacho”. Nunca se muestra el ID del plan como título.
- `invitedBy`: mapa `{ uidInvitado: uidInvitador }`. Se conserva para invitados que ya aceptaron. Una entrada ausente en un documento viejo significa que invitó el creador.
- `deleting`: opcional, false por defecto. Bloqueo irreversible previo a la limpieza de un plan cerrado. Permite reintentar tras un fallo de red.

`inviteeIds` mantiene su semántica de Fase 2: todos los participantes explícitos salvo el creador, tanto pendientes como aceptados. `memberIds` contiene únicamente miembros aceptados e incluye siempre al creador. Un pendiente es quien está en el primer array y no en el segundo. Continúa el límite de **5 personas totales**, incluidos pendientes; salir/rechazar libera una plaza.

`jointPlans/{planId}/subjects/{code}` conserva `code`, `proposedParticipantIds`, `updatedAt`, y agrega `addedByUid`, `createdAt`. La primera autoría/fecha se conservan cuando otro miembro modifica la propuesta. Una materia antigua sin autor se atribuye al creador (era el único editor en Fase 2); como fecha aproximada se conserva su antiguo `updatedAt`. No se copian nombres ni datos académicos al plan.

## Roles y acceso

| Acción | Creador | Miembro aceptado | Pendiente | Externo |
| --- | --- | --- | --- | --- |
| Leer metadatos de invitación | Sí | Sí | Sí | No |
| Leer materias | Sí | Sí, incluso cerrado | No | No |
| Renombrar / agregar / quitar materias | Abierto | Abierto | No | No |
| Invitar a un amigo propio accepted | Abierto | Abierto | No | No |
| Aceptar | No aplica | No agrega a otros | Solo él, plan abierto | No |
| Salir / rechazar | No | Solo él | Solo él | No |
| Cerrar | Sí | No | No | No |
| Eliminar definitivamente | Cerrado, con confirmación | No | No | No |

Cerrar impide cualquier edición de contenido o invitación. Se permite salir/rechazar en un plan cerrado: es revocación del acceso propio, no edición del contenido. Durante una eliminación ya iniciada también se bloquean cambios de membresía. No hay reapertura, transferencia de creador, expulsión de otro miembro ni cancelación de una invitación por terceros.

La lectura de metadatos para pendientes incluye nombre, carrera, creador, participantes/invitadores, estado y fechas; no incluye materias. Firestore no oculta campos dentro de un documento: por eso las materias siguen en su subcolección separada. No añadir datos sensibles al documento principal.

## Invitación por cualquier miembro

“Agregar participante” lista únicamente amigos accepted del actor que no estén ya en el plan. No exige sharing ni amistad con el creador. El servicio lee la amistad directa en la transacción, y las reglas vuelven a comprobarla. La actualización solo puede añadir un UID, mantener miembros existentes y registrar al actor como invitador. Las transacciones evitan duplicados y pérdida de actualizaciones concurrentes.

Ejemplo: A es creador, B miembro, C solo es amigo de B. B puede invitar a C y C puede aceptar y colaborar sin amistad A:C. Aceptar no crea amistades. El destinatario es el único que puede aceptarse/rechazarse; nadie puede introducir otro miembro aceptado en los arrays.

Una invitación válida y la membresía posterior son autorizaciones del plan independientes de la amistad. Romper la amistad con el invitador **no expulsa del plan ni cancela automáticamente una invitación existente**. Salir o eliminar el plan revoca el acceso. Esta semántica también aplica a planes antiguos al publicar las nuevas reglas.

## Separación académica

No cambian `users/{uid}/careers`, `planningSharing`, `planningSnapshots`, `approvedCodes`, `availableToCourseCodes` o `pendingFinalCodes`. Las reglas académicas siguen exigiendo sus permisos propios; nunca consultan membresía del plan. Un miembro que no sea amigo directo del lector no obtiene ni concede acceso académico transitivo.

Las identidades de miembros se resuelven con lecturas directas de los `socialProfiles` mínimos ya existentes, sin directorios ni lecturas de progreso. Los snapshots siguen viniendo exclusivamente de la comparación de amigos seleccionados. La pantalla muestra “Progreso no compartido” cuando el permiso está apagado, “Progreso no compartido con vos” para alguien sin amistad directa, o falta de datos cuando no se consultó/no pudo verificarse. Nunca se interpreta esa ausencia como pendiente/deshabilitada.

Agregar una materia ahora es una propuesta del plan: se puede incluir cualquier materia de la carrera para 2–5 participantes explícitos aunque no se conozca su progreso. Se distingue de poder cursarla y de la intención individual. Si luego deja de estar habilitada, se conserva con “Ya no figura como habilitada”. Si el participante salió, la propuesta y autoría se conservan, sin mantener su acceso.

## Sincronización y UI

- Dos consultas en tiempo real: `ownerId == uid` y `inviteeIds array-contains uid`. No hay consulta por cada amistad ni listados generales. Los planes siguen apareciendo aunque se rompa una amistad.
- Se mantiene filtro local por carrera. Para aceptar una invitación, la carrera activa del destinatario debe coincidir con la del plan, igual que en Fase 2. Puede cambiar de carrera sin compartir progreso.
- Renombrar, invitar, aceptar, salir y cambiar materias usan transacciones. Las ediciones de la misma propuesta/nombre son “última escritura confirmada”; no hay historial ni merge de intenciones simultáneas. La autoría original permanece.
- Al salir o perder autorización, se desmonta la suscripción de materias y se descartan respuestas tardías. Se siguen descartando snapshots de caché y escrituras aún no confirmadas; un fallo no se presenta como guardado exitoso.
- Panel separado de creación, acciones de edición plegables y administración destructiva secundaria. Los controles permiten ajuste de línea y ancho en mobile. No se modificó `App.jsx`, el planificador individual, Amigos ni el borrado de progreso.

## Planes existentes

No se hace migración masiva ni se borran datos. Se conservan arrays, carrera, estado y materias de Fase 2:

1. Sin nombre: se muestra un fallback humano resuelto con perfiles; al renombrar se guarda `name`.
2. Sin `invitedBy`: los participantes anteriores se interpretan como invitados por el creador. Las nuevas invitaciones registran su actor sin falsificar el historial de los anteriores.
3. Sin `addedByUid`/`createdAt`: se muestran los valores históricos aproximados descritos arriba; al volver a guardar esa materia se materializan esos campos.
4. Plan cerrado antiguo: ahora es legible por todos sus miembros aceptados y sigue cerrado. El creador puede eliminarlo mediante el nuevo flujo.

No hay planes válidos de Fase 2 que requieran recrearse. Documentos ajenos al esquema permitido o modificados manualmente deben revisarse antes de intentar editarlos. Clientes viejos que escriban materias sin los nuevos campos de autoría serán rechazados por reglas: recargar/actualizar el cliente antes de probar colaboración.

## Cierre y eliminación segura desde cliente

La UI exige cerrar primero y confirmar “Esta acción eliminará definitivamente este plan conjunto. No se puede deshacer.” con **“Sí, eliminar plan”**. Cancelar tiene el foco inicial; se bloquean envíos duplicados.

La operación:

1. Comprueba creador y plan cerrado en una transacción y escribe `deleting: true`.
2. Lee desde servidor páginas de hasta 100 documentos de `subjects`, borrándolas en lotes. Ningún cliente autorizado puede agregar/editar materias mientras está cerrado/bloqueado.
3. Después de una lectura de servidor que confirme la subcolección vacía, borra el documento padre en una transacción.
4. Las suscripciones retiran el plan tras la confirmación. Si falla antes, el padre queda con “Eliminación pendiente”, para reintentar desde la misma cuenta creadora. No se presenta como eliminado ni se borra el padre antes de terminar.

**Límite explícito:** no es una única transacción de borrado recursivo. Un corte puede dejar el plan parcialmente vaciado, pero con su padre y bloqueo conservados. Firestore Rules no puede demostrar que una subcolección arbitraria está vacía; un creador que saltee deliberadamente el servicio y borre directamente el padre podría dejar documentos huérfanos. Estos no serían legibles sin un padre autorizado, pero necesitarían limpieza administrativa. La garantía de limpieza del flujo normal depende de completar o reintentar este servicio. No se conceden permisos de borrado a otros usuarios ni a otras colecciones. No se admiten subcolecciones adicionales desde este cliente/reglas; si una administración las crea, deberá incluirlas en una limpieza administrativa.

Firebase no elimina subcolecciones al borrar un documento; el borrado desde cliente tiene limitaciones y requiere coordinación explícita. Véase la [documentación de eliminación de Firestore](https://firebase.google.com/docs/firestore/manage-data/delete-data).

## Reglas e índices

Solo se modifica el bloque `jointPlans` de `firestore.rules`. Se valida nombre, campos permitidos, arrays y límite de miembros, invitador nuevo y cambios por actor, autoría inmutable, creación de materias, cierre y bloqueo de eliminación. Las reglas de Amigos y datos académicos no cambian.

**No se necesitan índices compuestos nuevos.** Se usan índices de campo único estándar: `jointPlans.ownerId` y `jointPlans.inviteeIds` (array). Si se deshabilitaron mediante excepciones de indexado, restaurarlos. El índice compuesto anterior de `firestore.indexes.json` puede permanecer; el cliente nuevo no depende de él. No se elimina ni publica ese archivo.

## Pruebas y pasos manuales

```text
node --test tests/friends.test.cjs tests/planning.test.cjs tests/jointPlans.test.cjs tests/planning-ui.test.cjs
npm.cmd run build
```

Las pruebas locales usan SDK/permisos simulados y ejecutan la lógica y los hooks/componentes. No ejecutan el intérprete real de Firestore Rules. No hay Java/Firebase CLI ni navegador automatizable disponibles en este entorno; quedan pendientes validación del motor real y revisión visual en dispositivos.

Antes de Firebase real:

1. Respaldar las reglas publicadas y probar primero en un proyecto Firebase de prueba Spark. Mantener configuración Authentication Google y variables `VITE_FIREBASE_*`.
2. Publicar manualmente el contenido completo del `firestore.rules` del repositorio desde Firestore Database → Rules. Revisar cambios de producción ajenos al repositorio antes de reemplazar. No agregar reglas generales permisivas: se combinan con OR.
3. Confirmar indexado de campo único en `ownerId` e `inviteeIds`; no crear nuevos índices compuestos. Recargar el nuevo cliente en todas las cuentas de prueba.
4. Crear A:B accepted y B:C accepted, sin A:C, y una cuenta D externa. A crea/invita a B. Comprobar que B pendiente no lee materias ni edita; después de aceptar, renombra, agrega/quita e invita a C. C acepta y colabora sin friendship A:C ni sharing activo.
5. Probar mediante SDK/Rules Playground o Emulator Suite: invitación de B a D sin amistad denegada; autoaceptación de C únicamente; manipular ownerId/careerId/otros miembros/invitadores denegado; duplicados/campos extra/autor falsificado denegados; consultas sin filtros y D por ID conocido denegadas.
6. Verificar que A no puede leer `users/C/careers/...` ni el snapshot de C por pertenecer al mismo plan; repetir con sharing apagado, plan incompatible y amistad pendiente. Amigos y las tres capas de comparación deben conservar su comportamiento.
7. Renombrar/editar en dos sesiones, aceptar/salir simultáneamente e invitar dos veces: sin duplicados ni pérdida de miembros. Romper A:B no elimina acceso al plan ya autorizado; salir sí. Conservar materias y autoría al salir.
8. Cerrar como A: B y C aún leen, pero nadie renombra/agrega/quita/invita. B no puede cerrar/eliminar. Probar eliminación de A cancelada, confirmada, interrumpida y reintentada; comprobar en consola que no quede el padre ni `subjects` al completarse. Usar solo datos de prueba descartables.
9. Probar un plan previo sin campos nuevos, abierto y cerrado; comprobar nombres humanos, invitador/autor históricos y que no se borre progreso ni planes existentes.
10. Revisar desktop y mobile (360–390 px), nombres largos, formularios plegables, planes cerrados, foco de Cancelar y confirmación destructiva. Las selecciones temporales se reinician al recargar; los planes persisten.

No se implementan transferencia de ownership, chat, notificaciones, horarios, calendario, cupos, grupos separados, amistad automática, rankings ni logros.
