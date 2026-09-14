# Amigos: configuración y límites del MVP

## Publicar las reglas antes de habilitar la página

El repositorio no tenía reglas de Firestore ni configuración de Firebase CLI.
Esta implementación no publica reglas ni modifica la base remota automáticamente.

1. Revisar y respaldar las reglas actualmente desplegadas en Firebase Console → Firestore Database → Rules.
2. Publicar el contenido de `firestore.rules` para las colecciones de este proyecto. Si existen otras colecciones, conservar sus permisos específicos después de revisarlos.
3. Eliminar cualquier regla general que permita leer/escribir toda la base a usuarios autenticados (o a cualquier persona). Los permisos coincidentes se combinan con OR: agregar una regla restrictiva no revoca un permiso general previo.
4. Probar con dos cuentas de Google y una tercera cuenta ajena a la relación. No considerar habilitada la funcionalidad hasta validar las reglas desplegadas.

No hay dependencias nuevas ni backend adicional. Las comprobaciones del cliente sirven para la experiencia de uso; la autorización depende de estas reglas.

Referencias: [permisos y métodos get/list de Firebase](https://firebase.google.com/docs/rules/rules-behavior) y [validación de escrituras atómicas](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Documentos

- `users/{uid}`: continúa privado y agrega `socialEmail`, el email actualmente indexado. Solo la sincronización del propietario lee/escribe este dato; buscar amigos no lee perfiles privados. `users/{uid}/careers/{careerId}` y su progreso no se modifican ni se leen desde Amigos.
- `socialProfiles/{uid}`: exclusivamente `uid`, `name`, `photoURL`, `careerId`, `updatedAt`. No contiene email. Se publica al entrar con Google y tener una carrera guardada. La carrera debe coincidir con el perfil privado. El nombre/foto son datos visibles, no acreditaciones de identidad.
- `socialEmails/{emailNormalizado}`: solo `uid`. Es el único mecanismo de búsqueda. Email completo, sin espacios exteriores y en minúsculas. No se permiten consultas/listados. Para terceros las reglas solo resuelven un índice si coincide con `users/{uid}.socialEmail`; el propietario también puede leer sus índices anteriores para limpiarlos. No se eliminan puntos ni sufijos `+` de Gmail.
- `friendships/{uidMenor:uidMayor}`: `participants` (dos UID), `senderId`, `recipientId`, `status`, `createdAt`, `updatedAt`. Una solicitud comienza como `pending`; solo su destinatario puede cambiarla a `accepted` o `rejected`. Una amistad aceptada es ese mismo documento, sin duplicarla en otra colección.

Los UID se restringen a letras, números, guion y guion bajo para que `:` sea un separador inequívoco. Es compatible con los UID estándar de Firebase Authentication; cuentas importadas con otros identificadores necesitarían una migración explícita.

La transacción consulta ambos órdenes de la pareja. Las reglas validan el ID y prohíben también el documento inverso, incluso dentro de una escritura atómica. Así no alcanza con manipular el cliente para crear solicitudes cruzadas duplicadas.

Se mantiene este chequeo: ordenar los UID en JavaScript no obliga a un cliente modificado a hacerlo. Las reglas admiten ambos órdenes y hay que preservar relaciones previas. Eliminarlo sin otra garantía equivalente en las reglas debilitaría la protección.

La consulta de relaciones usa `participants array-contains uid`, sin `orderBy` ni filtros compuestos: basta el índice automático de array de Firestore. No deshabilitar ese índice. Las listas se actualizan con `onSnapshot`.

## Comportamiento y privacidad

- Los usuarios existentes aparecen cuando vuelven a entrar con esta versión; Firebase Auth no se puede listar desde el navegador y los perfiles previos no contenían los datos sociales.
- Un error al registrar el perfil social no bloquea el progreso académico. Amigos muestra el error y permite reintentar.
- Buscar requiere conocer el email completo. Los perfiles mínimos también son legibles por UID para usuarios de Google autenticados; no son secretos y no incluyen progreso.
- Impedir listados no impide que alguien pruebe muchos emails conocidos. Las reglas no aportan un límite de frecuencia por usuario. Si hay abuso, la siguiente etapa requiere búsqueda mediante servidor con límites; este MVP no ofrece protección contra enumeración por intentos.
- No se reenvían solicitudes rechazadas, ni se cancelan o eliminan amistades en este alcance. El resultado de búsqueda informa la relación existente.
- El perfil social y las listas no muestran email; solo se introduce en el formulario de búsqueda exacta.
- No hay comparación de materias, horarios, grupos, bloqueos, push ni planificador compartido.

## Cambio de email y migración

`syncSocialProfile` refresca el token de Firebase Authentication y usa su email verificado. Una transacción lee el perfil privado propio, el perfil social propio y los índices conocidos; después elimina los anteriores que pertenezcan al mismo UID, actualiza `users/{uid}.socialEmail`, reemplaza el perfil social sin email y escribe el índice nuevo. Se preservan los demás campos privados, progreso y amistades. Si falla, nada de esa transacción se aplica.

Las reglas exigen que el índice nuevo coincida con el email verificado y el puntero privado después de la transacción. Cambiar ese puntero exige liberar el índice anterior propio. Borrar un índice requiere ser su propietario y que ya no sea el índice vigente. No se puede borrar ni apropiarse del índice de otro UID. Una colisión del email nuevo con un UID distinto se detiene para revisión administrativa.

Para perfiles de la versión anterior, el email público se usa como dato de migración una sola vez y se elimina mediante reemplazo completo. Mientras exista ese campo, las reglas impiden que terceros lean el documento; el dueño sí puede leerlo para migrarlo. Un perfil todavía no migrado aparece sin identidad en las relaciones existentes, sin borrar la amistad ni bloquear las demás filas.

Los índices históricos desconocidos (creados antes de guardar el puntero) quedan invalidados para terceros si no coinciden con el puntero privado. No se enumera la colección para buscarlos. El índice/puntero sigue siendo válido hasta la próxima sincronización: el navegador no puede detectar inmediatamente un cambio externo en Authentication. La limpieza ocurre al volver a entrar o reintentar la sincronización; si el email del objeto de usuario cambia y se renderiza nuevamente, también se resincroniza. Una actualización inmediata sin que el usuario entre requeriría un backend y queda fuera de este alcance.

Las lecturas denegadas de índices invalidados o perfiles antiguos se presentan como resultado no disponible, sin revelar datos adicionales. La denegación general de reglas en esas lecturas también produce ese resultado; la sincronización propia conserva su aviso explícito de permisos.

Antes de publicar, desplegar las reglas nuevas y este cliente coordinadamente: la versión vieja que escribe email público dejará de poder sincronizar Amigos. Revisar si hay datos antiguos en producción; no se ejecutó ninguna migración remota. Para eliminar físicamente índices históricos desconocidos o migrar cuentas que no vuelvan a entrar hará falta una tarea administrativa. No hay nuevas colecciones ni cambios en `friendships`.

## Validación

Ejecutar `node --test tests/friends.test.cjs` y `npm.cmd run build`.
Las pruebas locales usan un adaptador Firestore simulado: no compilan ni ejecutan las reglas. Para probar las reglas usar Firebase Emulator Suite (requiere herramientas externas no incluidas) o una base de prueba con estas reglas publicadas.

Casos obligatorios para reglas/integración:

1. A y B publican su perfil con Google. Buscar B por email desde A devuelve únicamente el perfil mínimo. Una consulta general a `socialEmails` o `socialProfiles` debe fallar.
2. A envía solicitud a B. Ambos la ven; C no puede leer el documento ni consultar sus relaciones. B la ve como recibida y A como enviada.
3. A no puede aceptar/rechazar su propia solicitud. B puede aceptar o rechazar una sola vez; no puede cambiar participantes, emisor ni fecha de creación.
4. Dos envíos simultáneos A→B/B→A producen un único documento. Intentar crear ambos órdenes en un batch también debe fallar.
5. Intentar enviarse una solicitud, crear una solicitud ya aceptada, usar otro email o incluir `statusMap` en el perfil visible debe fallar.
6. Tras aceptar, ni A ni B pueden leer el progreso privado del otro. C tampoco.
7. Cambiar de cuenta durante una búsqueda, carga o escritura no debe mostrar resultados de la sesión anterior. Desconexión, permisos denegados y reintento deben mostrar errores sin alterar las relaciones confirmadas.
8. Cambiar el email verificado de A y sincronizar: el índice anterior desaparece y solo el nuevo devuelve a A. Intentar actualizar el puntero sin liberar el índice anterior debe fallar. Un fallo de transacción conserva los documentos previos.
9. A no puede borrar el índice de B, aunque altere su puntero privado para señalarlo. Tampoco puede crear un índice para un email que no figure verificado en su token ni sobrescribir el UID ajeno de un índice existente.
10. Un perfil antiguo con email solo puede leerlo su propietario; después de migrar contiene exactamente los cinco campos permitidos. Índices históricos cuyo email difiera del puntero privado no pueden resolverse por terceros.
