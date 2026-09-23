# v1.15.0 — rollout y recovery de Activity

Estado: Etapa 5 validada localmente: Node 514/514, Rules 232/232 (148 históricas,
43 Activity, 41 rollout/recovery), builds normal/mantenimiento PASS y build Emulator
rechazado como corresponde. Ningún paso de publicación de este documento fue ejecutado.

## Decisión y máquina de estados

Una sola fuente: `firestore.rules`, con `activityCreationEnabled()` en true.
`scripts/activity-rollout.cjs` genera mantenimiento/recovery cambiando únicamente
ese literal a false. No duplica Rules mantenidas a mano. No documento de control,
claims, Functions, Remote Config, polling ni negociación permanente de versiones.
El gate se exige tanto en la fuente (noticeRequired) como en la creación del inbox.
No agrega access calls. Recovery ES el mismo artefacto de mantenimiento.

| Estado | Web | Rules | Nuevas solicitudes/aceptaciones/invitaciones |
|---|---|---|---|
| A, previo | v1.14 | v1.14 | Protocolo histórico sin inbox |
| B, entrada a mantenimiento | cualquier pestaña | maintenance | Denegadas, incluso con inbox correcto |
| C, preparado | v1.15 build maintenance | maintenance | UI y servicios bloquean; Rules también |
| C2, web normal preparada | v1.15 normal y pestañas anteriores | maintenance | Denegadas por Rules |
| D, operativo | v1.15 normal | finales estrictas | Solo source + inbox atómicos |
| E, recovery | cualquier web; preferir maintenance | maintenance | Denegadas; cleanup coherente disponible |

Combinaciones fuera del camino: v1.15 contra Rules v1.14 falla atómicamente por
inbox no autorizado. v1.14 contra finales falla si omite el aviso obligatorio.
Una web maintenance contra finales sigue pausada localmente hasta recargar la web
normal. Esto no abre una ventana insegura. No es necesario que todos recarguen a
la vez: pestañas antiguas fallan cerradas; no se puede inyectarles el copy nuevo.

La pausa comienza al hacerse efectivas las Rules maintenance, no al generar el
archivo ni al publicar un banner. La propagación de Rules no debe confundirse
con sincronización instantánea. Antes de declarar B hay que confirmar la publicación
y su efecto. Los commits previamente aceptados bajo v1.14 pertenecen al estado A;
no se les fabrica Activity ni se promete backfill. El nuevo cliente nunca degrada
una transacción a escritura sin aviso si recibe permission-denied.

## Matriz exacta de mutaciones

Siempre se conservan las condiciones históricas de autorización.

| Operación | Maintenance/recovery | Final |
|---|---|---|
| Enviar solicitud de amistad | DENY viejo/nuevo | Solo solicitud + fr |
| Aceptar solicitud de amistad | DENY viejo/nuevo | Solo aceptación + fa |
| Crear plan con 1..4 invitados | DENY viejo/nuevo | Solo padre + todos los jp |
| Agregar/reinvitar participante | DENY viejo/nuevo | Solo transición + jp nuevo |
| Inbox independiente/spoof/replay | DENY | DENY |
| Rechazar solicitud de amistad | ALLOW autorizado | Igual; conserva historial |
| Aceptar invitación existente al plan | ALLOW autorizado | Igual; no crea nuevo evento |
| Rechazar/salir de plan | Solo si jp queda ausente atómicamente | Igual |
| Cerrar/bloquear plan, drenar subjects | ALLOW autorizado | Igual |
| Eliminar padre/tombstone | Solo con retiro de todos sus jp | Igual |
| Renombrar, editar subjects | ALLOW según reglas existentes | Igual |
| Inbox propio: leer, readAt, borrar aviso | ALLOW según reglas existentes | Igual |
| Progreso, proyección, sharing y perfiles | Sin cambios | Sin cambios |

Un cleanup viejo que deja un jp existente es rechazado. Si el jp ya no existe
(plan histórico o aviso borrado por su dueño), no hay inconsistencia que bloquear:
el cleanup puede pasar incluso con payload antiguo. No se usa versión de cliente
como sustituto de verificar la postcondición. No se reemiten avisos borrados.
El retiro seguro no se pausa, para no retener acceso o avisos innecesariamente.
La eliminación mantiene lock/drenado/tombstone/retry existentes.

## Web de mantenimiento

`npm.cmd run build:maintenance` construye en modo production, con la misma carga
de variables de Firebase que `npm.cmd run build`; SOLO cambia la constante de UX
`__SOCIAL_MAINTENANCE__`. La variable de build se pasa al proceso hijo, no cambia
`.env`, la terminal padre, Firebase ni el modo Emulator. Salida separada:
`.tools/activity-rollout/web-maintenance`.

La web muestra un aside con role=status, deshabilita enviar/aceptar solicitudes,
crear planes/agregar participantes y rechaza esas llamadas desde los servicios
antes de entrar al SDK. Rechazos locales propagan un mensaje, nunca éxito.
No oculta páginas, borra estado, marca avisos ni bloquea lecturas/progreso.
El build normal compila la constante en false; no consulta ningún flag remoto.
La seguridad no depende del build: omitir el guard cliente no elude Rules.

## Preparación local reproducible (sin publicación)

```powershell
npm.cmd run rollout:prepare
npm.cmd run rollout:check
npm.cmd run build:maintenance
npm.cmd run build
```

El generador no importa Firebase, no usa CLI/red ni credenciales. Produce, dentro
de `.tools/activity-rollout` (ignorado):

- firestore.final.rules y firestore.maintenance.rules;
- firestore.indexes.json (copia exacta);
- firebase.final.json y firebase.maintenance.json, con rutas relativas locales;
- manifest.json con hashes SHA256 de esos cinco archivos.

`rollout:check` falla si faltan o difieren de las fuentes actuales. Regenerar y
revisar luego de cualquier cambio. Los artefactos no deben editarse a mano.
Conservar fuera del working tree los artefactos aprobados y sus hashes durante la
publicación/recovery. No usar config de Emulator para desplegar ni elegir proyecto
mediante un alias implícito. El script no selecciona ni conoce proyecto productivo.

## Procedimiento de publicación — SOLO tras autorización posterior

1. Completar Node/build y Rules históricas + Activity + rollout. Aprobar el release
   review. Identificar explícitamente proyecto, base y destino web; comprobar que
   coinciden con el entorno existente, sin inventar esos valores desde esta revisión.
2. Generar/verificar artefactos, construir ambas webs y conservar el manifest.
   En Vercel/u otro proveedor, configurar la construcción de mantenimiento con
   `npm run build:maintenance` y directorio de salida
   `.tools/activity-rollout/web-maintenance`; construcción normal `npm run build`,
   salida `dist`. No publicar por error dist cuando se pretende maintenance.
3. Publicar SOLO los índices. Esperar ambos Activity READY, conservando el índice
   existente de jointPlans. Emulator no demuestra su disponibilidad remota.
4. Comunicar la pausa. Publicar Rules maintenance y confirmar su efecto: una
   solicitud antigua y una moderna deben rechazarse sin escrituras parciales.
   A partir de aquí no volver a Rules v1.14. Las pestañas antiguas pueden mostrar
   su error genérico; el rechazo debe ser atómico.
5. Publicar la web maintenance, verificar banner, cuatro acciones pausadas y
   continuidad de lecturas/progreso. Esta web ya usa el protocolo final para cleanup.
6. Conservar maintenance Rules. Publicar la web normal v1.15; comprobar versión,
   configuración y carga de Activity. Todavía no se aceptan altas sociales, aunque
   una pestaña normal tenga botones activos. Si se intentan, las Rules rechazan;
   no hay fallback a operaciones antiguas.
7. Publicar Rules finales verificadas: este es el punto de reapertura. Verificar
   los tres eventos y cleanup/reinvitación mediante cuentas/acciones autorizadas.
   Las pestañas maintenance necesitan recarga para habilitar UI; las v1.14 necesitan
   recarga para poder crear nuevos eventos. No exigir recarga simultánea.
8. Conservar artefactos maintenance y una web compatible para recovery. No borrar
   inboxes ni modificar progreso para solucionar un problema de publicación.

### Canal definitivo: Firebase Console y Vercel, sin login de Firebase CLI

La CLI local no está autenticada. No ejecutar deploy ni login de Firebase CLI.
Las configs generadas son artefactos de referencia; no son un requisito para
publicar manualmente. Confirmar proyecto y base `(default)`, igual que getFirestore(app).

Antes de subir el commit a una rama conectada a Vercel, controlar la publicación
automática: no promover esa versión hasta el paso correspondiente. Mantener el
deployment v1.14 actual hasta activar maintenance Rules. No asumir que un push
es solo una transferencia de código: puede provocar una publicación automática.

Firebase Console, Firestore, Índices: crear SOLO estos dos índices de collection
scope `activityInbox`, sin eliminar/modificar índices existentes:

- `createdAt DESC`, `__name__ ASC`.
- `readAt ASC`, `createdAt DESC`, `__name__ ASC`.

Verificar la dirección explícita de `__name__` y esperar ambos READY/habilitados,
no Building. Si la consola no permite representar esa definición exacta, detener
el procedimiento y resolver la creación oficial del índice; no aceptar otro orden
ni activar billing/CLI por cuenta propia. No se verificó la UI del proyecto remoto.

Firebase Console, Firestore, Rules: pegar el contenido COMPLETO de
`.tools/activity-rollout/firestore.maintenance.rules`, revisar gate false y publicar.
No pegar fragmentos ni restaurar Rules antiguas. Confirmar propagación con acciones
de clientes sujetos a Rules, usando cuentas y recursos de prueba autorizados:
solicitud, aceptación, creación de plan e invitación deben fallar sin alterar fuente
ni inbox. Repetir con cliente nuevo normal bajo maintenance en el paso 6, antes de
reabrir. El editor de datos administrativo de Console NO demuestra enforcement.

Vercel: para publicar maintenance configurar Build Command `npm run build:maintenance`
y Output Directory `.tools/activity-rollout/web-maintenance`; construir el commit
aprobado con las variables Production existentes y promover ese deployment.
El build remoto genera su salida ignorada; no hay que subir `.tools` al repositorio.
Verificar banner y controles. Para la web normal restaurar Build Command
`npm run build` y Output Directory `dist`, construir el mismo commit y promoverlo
manteniendo maintenance Rules. Confirmar que CORRELATIVAS_SOCIAL_MAINTENANCE no
quedó definida globalmente en Vercel: solo el script hijo debe establecerla.
No promover un preview con configuración Firebase de otro entorno. La selección
de proyecto/branch/deployment se confirma manualmente, no se inventan sus IDs.

Para reabrir: en Firebase Console publicar el contenido completo de
`.tools/activity-rollout/firestore.final.rules`, con gate true. Luego comprobar
solicitud recibida, aceptación e invitación con source + aviso, lectura individual,
retiro y reinvitación. Usar flujos normales y recursos autorizados, no crear avisos
a mano. Confirmar progreso/lecturas operativos y ausencia de errores de índices.
Coordinar recarga de pestañas v1.14 y maintenance; verificar web normal sin banner.

Antes de tocar Rules, si falla preparación/build/índices: detenerse y mantener A.
Desde B, ante cualquier falla: mantener/reaplicar maintenance Rules y conservar o
volver al deployment maintenance compatible. Nunca usar rollback automático a
v1.14 después de empezar la transición. Los pasos de recovery de abajo aplican
también si falla el smoke test posterior a la reapertura.

Referencias oficiales de las operaciones de consola/dashboard:
https://firebase.google.com/docs/firestore/query-data/indexing
https://vercel.com/docs/builds/configure-a-build
https://vercel.com/docs/deployments/promoting-a-deployment

No se requiere CLI global, gcloud, backend, billing ni servicios pagos nuevos.

## Rollback seguro

Antes de reabrir, quedarse en maintenance: no hay necesidad de restaurar Rules
v1.14. Servir la web maintenance compatible y corregir/testear el cliente.

Después de reabrir:
1. Reaplicar el artefacto maintenance revisado y confirmar su efecto. Mientras
   se propaga, las Rules finales anteriores todavía exigen atomicidad completa.
2. Publicar la web maintenance guardada; permitir lectura y cleanup coherente.
3. No restaurar writers/Rules v1.14 ni borrar Activity. Mantener índices.
4. Corregir y probar; repetir web normal bajo pausa y finalmente Rules estrictas.

Es una reversión de disponibilidad, no de los datos ya confirmados. Una pestaña
v1.15 normal que siga abierta no elude la pausa; una pestaña maintenance que siga
abierta tras reapertura permanece conservadoramente pausada. No se garantizan
operaciones que un administrador haya escrito saltándose Rules.

## Evidencia y límites

Node verifica artefactos, gate único, build flag, UI, servicios y ausencia de
transacciones al conocer mantenimiento. Rules/Emulator ejecutó y aprobó la matriz
viejo/nuevo × final/maintenance, no-op histórico seguro, cleanup máximo, privacidad,
reinvitación y recovery real final → maintenance → final sin borrar datos.
La ejecución completa fue 232/232 después de corregir la captura de snapshots y
la reutilización de instancias Firestore del harness. No cambió código de aplicación
ni Rules por esas correcciones. No ejecutar el runner sobre 8088 mientras esté
ocupado por pruebas manuales.

El contrato Activity sigue sin URLs/texto web/campos de navegador, sin push,
backend, backfill ni eliminación física garantizada. Mobile futuro deberá enviar
el protocolo estricto y tolerar denegaciones durante mantenimiento; no necesita
consumir la constante de build web ni cambiar el esquema persistido.
