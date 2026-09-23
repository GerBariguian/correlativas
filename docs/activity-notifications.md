# Actividad y notificaciones - v1.15.0, Etapas 1-5

## Estado vigente de cierre

Las Etapas 1-4 están implementadas y la validación manual de Activity fue PASS,
incluida la comprobación posterior de `activity-sr-only`, reportada por el usuario.
La infraestructura Auth/Firestore Emulator manual funciona. No hubo producción.

Etapa 5 incorpora generación local de Rules maintenance/recovery y build web de
mantenimiento. Procedimiento vigente, matriz y rollback:
[activity-rollout.md](activity-rollout.md). Reemplaza la propuesta inicial de
puente/versionado permanente que aparece en el registro histórico más abajo.

Última validación anterior a Etapa 5: Node 504/504; Rules Activity 43/43,
históricas 148/148, total 191/191. Después de implementar Etapa 5: Node 514/514,
incluidos 10 tests nuevos de rollout; builds normal y maintenance PASS; rechazo
de build Emulator PASS. Validación final de Rules completada después de corregir
dos errores exclusivamente del harness: históricas 148/148, Activity 43/43 y
rollout/recovery 41/41, total 232/232, sin fallos ni omitidos. La publicación sigue
siendo una operación posterior del usuario; ningún resultado autoriza un deploy automático.

Contrato actual: dos listeners acotados, historial reciente de hasta 30 elementos,
badge hasta 50+, horizonte visible de 90 días, lectura individual y navegación
contextual. No página completa/paginación, marcar todo, push, backend, backfill ni
eliminación física garantizada. Índices remotos deben estar READY antes del rollout;
Emulator no acredita su disponibilidad.

## Registro histórico de implementación (Etapas 1-4)

Las referencias siguientes a funciones "futuras", pruebas pendientes y conteos
menores describen el cierre de cada etapa, no el estado vigente de arriba.

Contrato, dominio, repositorio/sesion y campana/panel web. Sin pagina completa,
paginacion ni marcar todo. Sin acceso a produccion. Las secciones por etapa registran la evolucion; la UI inicial se describe en Etapa 4.
Base: 605e99a (v1.14.0), working tree inicialmente limpio.

## Decisiones y documento v1

Inbox `users/{uid}/activityInbox/{itemId}`; no colección global. El destinatario
es la ruta, sin recipientUid redundante. Allowlist exacta:

- schemaVersion: entero 1.
- type: FRIEND_REQUEST_RECEIVED, FRIEND_REQUEST_ACCEPTED, JOINT_PLAN_INVITATION.
- actorUid: autenticado, distinto del destinatario.
- createdAt: serverTimestamp, validado contra request.time.
- target: mapa exacto { kind, id }.
- readAt: null inicialmente.

No payload libre, texto final, URL, nombre, foto, email, carrera, progreso, materias,
groupingKey ni expiresAt. El módulo activityLogic.js solo construye datos/IDs;
recibe el timestamp del adaptador, no importa React ni Firebase. No pretende
validar que un sentinel sea de servidor: esa garantía corresponde a Rules.

| Tipo | target.kind | itemId |
|---|---|---|
| FRIEND_REQUEST_RECEIVED | friendship | fr_{friendshipId} |
| FRIEND_REQUEST_ACCEPTED | friendship | fa_{friendshipId} |
| JOINT_PLAN_INVITATION | jointPlan | jp_{planId} |

Friendship conserva el ID del recurso (dos UIDs separados por :), hasta 257
caracteres. PlanId admite letras ASCII, números, guion y underscore, 1..100;
los IDs automáticos actuales cumplen. No usar IDs aleatorios para el inbox.
No inferir destinatarios desde nombres o texto de presentación.

## Atomicidad bidireccional

La fuente exige que el aviso no exista antes y que getAfter encuentre el aviso
correcto, de este actor, timestamp actual y no leído. El create del aviso exige
una transición fuente real con get/getAfter. No basta con que el recurso exista.
Las Rules de la fuente siguen validando los demás campos/roles originales.

Solicitud: inexistente -> pending; emisor crea aviso al receptor.
Aceptación: pending -> accepted; receptor original crea aviso al emisor.
Rechazo: conserva contrato existente, sin aviso nuevo.
Plan nuevo: aviso obligatorio por cada invitado (1..4).
Invitación posterior: exactamente una adición real, actor miembro autorizado,
invitedBy correcto y amistad directa aceptada entre actor e invitado.

La validación de amistad de invitaciones reside en el create del inbox obligatorio.
Esto distribuye los access calls entre operaciones sin quitar la exigencia de
amistad. El padre no puede omitirse ni crearse/invitar sin los avisos: todo falla
atómicamente si falta un aviso o es inválido. No existe fallback de writes separados.

friends.js y jointPlans.js agregan únicamente set/delete de inbox dentro de las
transacciones existentes. No leen inboxes ajenos. No se cambia el drenado de subjects,
los locks ni el tombstone de eliminación. Las pruebas cargan esos servicios reales
con el SDK apuntando exclusivamente al Emulator, además de pruebas directas de Rules.

## Lectura, retiro y reinvitación

Get/list: solo propietario con Google y email verificado (socialUser), aun cuando
actor, invitador, amigo o miembro hayan participado de la escritura. Conocer un ID
no concede lectura. No se amplía acceso académico ni se publica statusMap.

Update: solo propietario, readAt null -> request.time. Ningún otro campo cambia.
No se permite reset, cambio de fecha posterior, actualización por actor ni campos extra.
Incluso una repetición del write después de leído puede rechazarse: el futuro servicio
de lectura deberá revisar el estado para resolver el no-op, no debilitar Rules.

Delete: propietario de inbox puede borrar su aviso. Un tercero solo puede borrar el
slot jp_{planId} de un invitado del plan que él posee, cerrado y bloqueado, en la misma
operación que elimina ese padre. No hay borrado genérico entre miembros.

Rechazar/salir exige que el slot no exista después, y el servicio lo elimina junto
con la membresía. Funciona si ya faltaba. La eliminación final exige retirar los
slots de todos los invitados todavía registrados, junto con padre+tombstone.
No quedan slots de exintegrantes por los flujos autorizados nuevos.

Reinvitar tras salida/rechazo crea de nuevo el mismo slot con nuevo createdAt y
readAt null. No necesita contador de generación: la instancia se identifica con
(itemId, createdAt). Un comando futuro de lectura debe comparar el createdAt observado
en transacción, para no marcar una reinvitación nueva por una acción de UI vieja.
Un actor no puede recrear un aviso borrado mientras la invitación siga existiendo.

Estas garantías aplican a writers cliente sujetos a Rules. Un administrador que
salte Rules debe mantener el lifecycle explícitamente; no hay backend reparador.
Datos previamente descargados no pueden borrarse del conocimiento de un usuario.

## Idempotencia y concurrencia

Un retry del callback usa los mismos IDs; no reinicia avisos leídos ni genera duplicados.
La suite fuerza un conflicto de lectura y comprueba que el SDK ejecuta nuevamente el
callback y conserva un solo aviso. También prueba dos intentos simultáneos.

No se promete que ambos double-clicks devuelvan éxito: los servicios existentes
rechazan relaciones/invitaciones repetidas. Una carrera entre commits puede terminar
en permission-denied/aborted para el perdedor; no hay éxito parcial. Reintentar luego
con lectura del recurso permite reconocer el estado existente sin reemitir el aviso.
accepted -> accepted no constituye una nueva aceptación y sigue rechazado.
Crear dos avisos por la misma transición (otro ID o destinatario) invalida todo el batch.

## Fan-out y access calls

Casos críticos: crear plan + cuatro inboxes (5 writes), invitar al cuarto invitado,
y eliminar padre + tombstone + cuatro slots (6 writes). Se prueban amistades en
orientación directa e inversa, notices faltantes, cero y exceso de invitados.

Límites documentados: 10 access calls por operación y 20 para el batch/transacción;
algunos accesos repetidos se cachean. En create del padre, la ruta máxima tiene
hasta 10 expresiones de acceso: perfil activo, tombstone y dos por cada aviso
(antes/después). Las validaciones de amistad se ejecutan en las operaciones inbox.
Esto deja poco margen: cualquier nuevo lookup exige repetir el caso máximo.

La evidencia del Emulator es ALLOW/DENY real, no un mock ni un contador inventado.
El harness no entrega el número exacto de llamadas cobradas después de caching:
no afirmar que observamos exactamente N/20. La aceptación de los máximos demuestra
viabilidad bajo el intérprete local actual, no capacidad para ampliar el fan-out.
Fuentes: https://firebase.google.com/docs/firestore/security/rules-conditions
https://firebase.google.com/docs/firestore/manage-data/transactions

## Queries futuras e índices

Probadas en Emulator: inbox propio ordenado por createdAt desc con límite, readAt
igual a null + createdAt desde un corte, y cursor startAfter para la página siguiente.
No hay servicio de consulta ni paginación implementados. Las Rules no imponen hoy
un límite de listado al dueño: es política futura del repositorio, no privacidad.

Recientes usa índice simple de createdAt. No leídas con igualdad readAt + rango/orden
createdAt probablemente requiere compuesto (readAt ASC, createdAt DESC), scope
COLLECTION. El Emulator no valida la disponibilidad de índices compuestos de
producción; queries exitosas no demuestran que el índice esté provisionado.
firestore.indexes.json no se modifica hasta implementar la query concreta.

Badge futuro 50+, sin contador persistido. Horizonte visible futuro 90 días, sin
promesa de limpieza física automática. TTL/retención física no implementados.

## Propuesta histórica de rollout de Etapa 1 (sustituida por Etapa 5)

El procedimiento operativo vigente está en [activity-rollout.md](activity-rollout.md).
La propuesta siguiente conserva el razonamiento de incompatibilidad; el puente
con negociación permanente no se implementó ni es requerido por la solución elegida.

Rules estrictas rechazan clientes v1.14 que envían/aceptan/invitan sin aviso.
La web nueva con inbox también falla contra las Rules antiguas (path no autorizado).
No existe orden de dos deploys independientes que garantice cero fallos para todas
las pestañas viejas sin mecanismo de transición: no afirmar lo contrario.

Recomendación para esta web: preparar primero una versión puente con control de
protocolo/pausa y mensaje de actualización (fuera de esta etapa), distribuirla y
planificar una ventana corta de mantenimiento de mutaciones sociales. Pausar dichas
mutaciones en servidor, publicar la web compatible en Vercel y las Rules estrictas,
verificar, luego habilitar. Lecturas y progreso no necesitan pausarse. Las pestañas
anteriores al puente seguirán necesitando recarga; no se puede actualizar código
ya cargado por publicar Vercel. Documentar la pausa y no presentar fallos como éxito.

No se despliega una ventana que permita omitir avisos silenciosamente como si ya
cumpliera el protocolo nuevo. Otra alternativa es versionar las operaciones con
contrato de transición explícito; requiere aprobación aparte, no está implementada.

Futuro Android/iOS: adoptar negociación/versión mínima y política de compatibilidad
antes del primer cliente instalado. Contrato de datos/target no depende de UI;
credenciales de push nunca pertenecen al cliente. No hay push ni entrega ahora.

## Validación local y alcance

Comandos: node --test tests/activity.test.cjs; node scripts/test-rules.cjs --activity-only;
npm.cmd run test:rules; suites sociales; npm.cmd test; npm.cmd run build;
git diff --check. Runner fija demo-correlativas-rules / 127.0.0.1:8088 y limpia
variables de credenciales/proyecto. Sin login ni consultas remotas.

Las regresiones históricas ahora escriben avisos cuando representan clientes
válidos del nuevo protocolo; las pruebas de omisión usan writes crudos separados.
Los mocks sociales verifican atomicidad del servicio, no reemplazan Emulator.
No se cambian Planner, Mapa, Proyectar, motores, catálogos, statusMap ni snapshots.

Limitaciones aceptables de Etapa 1: sin UI, sin lectura masiva, sin retención física,
sin reparación administrativa, sin backfill histórico. Rollout coordinado pendiente
es condición de publicación futura, no permiso para desplegar estas Rules ahora.

### Resultado final verificado — 2026-09-23

- Suite Node completa: 423/423, sin fallos ni omitidos. Incluye los 4 tests
  puros de actividad y las suites sociales existentes (friends, jointPlans,
  planning y planning-ui).
- Rules Emulator completo: 187/187, sin fallos ni omitidos: 39 de actividad
  y 148 regresiones históricas. Incluye los dos tests de servicios reales,
  retry forzado del callback, ambas orientaciones de amistad y retiro máximo.
- Creación máxima: padre + 4 avisos aceptados atómicamente (5 writes).
- Eliminación máxima: tombstone + padre + 4 slots aceptados (6 writes),
  también con uno de esos avisos previamente eliminado.
- Build: aprobado; advertencia de chunk superior a 500 kB, sin cambios de
  dependencias ni trabajo de splitting en esta etapa.
- Rules verificadas, SHA256:
  `024827e8d0d1e74ccb29366c487830d5ecf24eb159f6a1e420d8219c21258460`.

No hay blocker de viabilidad para Etapa 2. La coordinación de rollout sigue
siendo un requisito previo a publicación, no implementado ni autorizado aquí.

## Etapa 2 — dominio puro

Se conserva el builder de escrituras de Etapa 1 sin cambiar servicios ni Rules.
El contrato persistido no contiene campos de presentación. La validación cliente
es defensa adicional; no sustituye las transiciones y autorización de Rules.

`normalizeActivityItem(itemId, data)` devuelve `{ok:true,item}` o
`{ok:false,diagnostic}`. Valida allowlists exactas, versión, tipo, actor, timestamps,
kind/id y correspondencia del slot. `normalizeActivityItems([{itemId,data}])`
separa items válidos y diagnósticos por índice; no publica valores del documento.
Versiones desconocidas, campos extra y datos incompletos no son renderizables.
No se interpreta v2 como v1 ni se implementan migraciones.

Modelo normalizado: itemId, instanceKey, schemaVersion, type, actorUid,
createdAt, target, readAt e isRead. Se copian target y timestamps, sin alias
con los datos de entrada. Helpers de orden/filtro/badge reciben este modelo ya
validado; no son validadores de documentos ni deduplicadores de páginas.

Frontera temporal: pares numéricos `{seconds,nanoseconds}`, compatibles con
Timestamp resuelto del SDK y fixtures JSON. Segundos enteros en el rango de
Firestore, nanos enteros entre 0 y 999999999. No se invocan métodos del SDK,
no se aceptan sentinels pendientes, Date, strings ni milisegundos ambiguos.
No se inventan fechas. Se conserva precisión nanosegundo, incluyendo fechas
anteriores a epoch. readAt null significa no leído; timestamp válido significa
leído (también igual a createdAt). No se agrega una restricción temporal a readAt
que las Rules aprobadas no establecen.

instanceKey es JSON de `[itemId,seconds,nanoseconds]`. Distingue una reinvitación
del mismo slot; no efectúa escrituras ni sustituye la comparación transaccional
futura contra la instancia observada. Orden: createdAt DESC preciso y, en empate,
itemId ASC por comparación ordinal, sin locale ni dependencia del orden de entrada.

Horizonte: intervalo cerrado `[now - 90*86400 segundos, now]`, con now explícito
como timestamp. Incluye ambos extremos; excluye fechas futuras. Son 90 días de
24 horas, no días calendario locales ni TTL; no borra documentos. Agrupar por
fecha/zona horaria pertenece a la futura presentación.

Filtros cerrados: all/unread. Badge estructurado `{count,isCapped}`, máximo 50
por defecto; exactamente 50 no está saturado, 51 sí. Cuenta únicamente los items
entregados: el consumidor debe aplicar horizonte y reunir un alcance suficiente;
no implica contador global ni completitud de páginas no descargadas. No genera
el string visual 50+. No se agrega agrupación, buscador ni filtros por tipo.

Navegación continúa usando `activityTarget`, sin módulo duplicado, URLs ni
activePage. La futura presentación resolverá actorUid mediante perfil autorizado;
para invitaciones podrá resolver el jointPlan autorizado. Para solicitudes y
aceptaciones podrá consultar la relación para acciones vigentes. Ningún nombre,
foto o nombre del plan se copia al inbox. Recursos ausentes/inaccesibles deben
admitir fallback genérico sin revelar el motivo de denegación.

Android/iOS pueden reutilizar estos helpers si su tecnología lo permite o
reimplementar el contrato y probar conformidad con los mismos pares temporales,
IDs y casos de borde. No se presupone React Native. Los fixtures de tests ya son
serializables; no se crea un archivo de fixtures externo ni infraestructura de
plugins sin consumidor actual. La evolución del protocolo sigue requiriendo una
política explícita para clientes viejos, según el rollout descrito arriba.

Validación Etapa 2: actividad 28/28 (24 casos nuevos sobre los 4 anteriores),
sociales Node 72/72, ejecución conjunta 100/100. Node completo 447/447;
Rules actividad 39/39 e históricas 148/148 (187/187). Build aprobado con la
advertencia existente de chunk >500 kB. Sin cambios de Rules/servicios en esta
etapa, sin acceso a producción y sin publicación. No se detectaron bugs del
protocolo aprobado; se corrigió una comparación del harness entre realms de VM.

## Etapa 3 — repositorio y sesión compartible (sin UI)

`services/activity.js` es el adaptador SDK. `activityRepository(uid)` captura
la identidad del objeto auth.currentUser y rechaza uid incorrecto, usuario sin
email verificado o sesión reemplazada (también mismo uid con otro objeto).
API: `subscribe('recent'|'unread', next, onError)` devuelve unsubscribe;
`markRead(itemId, expectedInstanceKey)` devuelve marked/alreadyRead/stale/missing.
Errores usan códigos cerrados, sin mensajes ni payloads originales. Rules sigue
siendo autoridad de autenticación Google/autorización.

`createActivitySession({repository,now,...})` en activitySession.js es la capa de
lifecycle, independiente de React. App podrá poseer UNA instancia por shell y
pasar estado/acciones a campana y página; no se integra App todavía. Factory y
reloj serán activityRepository y activityNow. API: setUser(user|null), getState(),
observe(callback) -> unsubscribe, retry(), markRead(item), dispose(). Observe
no abre consultas; rerenders con el mismo objeto user no reinician listeners.
El consumidor inicial obtiene getState y observa cambios; no debe mutar el estado.
No se agrega hook/Context sin consumidor: no es necesario para compartir sesión.
setUser debe seguir la identidad de sesión auth, no solo uid. Logout, A->B y
reemplazo del objeto user limpian inmediatamente ambos streams, errores y badge,
cancelan listeners/timer e invalidan callbacks y resultados asincrónicos viejos.
Un commit ya enviado no puede cancelarse desde la UI, pero no actualiza otra sesión.

Queries reales, siempre dentro del inbox propio:
- recent: createdAt >= cutoff, createdAt DESC, documentId ASC, limit 30.
- unread: readAt == null, mismo cutoff/orden, limit 51.
cutoff = reloj al suscribirse menos 90 días. Nunca consulta fuentes sociales,
planes, subjects ni snapshots. 30 es una ventana inicial pequeña, no historial
completo. atLimit solo indica que se alcanzó el límite, no prueba otra página.
El orden ordinal de IDs ASCII coincide con el dominio. No se implementan páginas
históricas, cursor, merge ni markMany: se difieren hasta su consumidor; evitar API
especulativa. La futura paginación deberá usar ambos componentes del orden y
reconciliar instancias, no concatenar slots ni mantener avisos retirados como vigentes.

Cada snapshot pasa por normalización de Etapa 2. Estado por stream:
loading/ready/error (idle sin sesión), items, diagnostics, atLimit, error.
Un error limpia ese stream sin borrar el otro. Badge null significa desconocido;
ready válido produce count/isCapped: hasta 50 exacto en el horizonte consultado,
51 significa 50+, nunca total 51. Documentos inválidos en unread producen badge
null y diagnósticos, no un cero engañoso. Si el reloj está detrás y hay filas
futuras ocupando el límite, badge permanece desconocido hasta poder evaluarlas.

El horizonte se vuelve a evaluar en cada callback y cada minuto con reloj local,
sin nuevas queries. El cutoff inicial del listener puede incluir filas ya viejas;
se filtran localmente. El orden descendente evita que viejas filas desplacen a
recientes. Precisión de expiración en reposo: hasta un minuto (o demora del timer
si la pestaña está suspendida). Se requiere reloj local razonable; no se promete
sincronización de reloj de servidor. Reiniciar/retry toma un cutoff nuevo.

Timestamp.now y new Timestamp están exclusivamente en el adaptador Firestore.
Datos resueltos se convierten por el normalizador a seconds/nanoseconds, sin SDK
en el dominio/sesión. Cache o pending writes generan loading y limpian datos
confirmados del stream: no se presentan como lista vacía ready. El SDK actual
usa getFirestore sin configuración nueva de persistencia durable. No se promete
soporte offline; un listener puede quedar loading esperando servidor, y una
transacción offline puede fallar. No IndexedDB/localStorage ni cola propia.

markRead lee transaccionalmente el documento propio, normaliza y compara la
instanceKey antes de decidir. Missing/stale no escriben ni son errores fatales;
alreadyRead no cambia readAt. Solo marked actualiza readAt con serverTimestamp.
Cada retry repite las comprobaciones. Dos clientes concurrentes convergen a
marked/alreadyRead. Un retiro o reinvitación después de leer obliga a reintentar
por conflicto y devuelve missing/stale, sin marcar la nueva instancia. Sesión
expuesta traduce excepciones a {status:'error',error:codigo} y resultados viejos
tras cambio de usuario a {status:'cancelled'}.

Actividad muestra únicamente inbox real. Amigos conserva solicitudes antiguas
pendientes sin inbox. No backfill ni fechas fabricadas. Targets siguen semánticos;
el repositorio no decide pantallas ni rutas. No resolución de perfiles aún.
Dos pestañas tienen sus propios listeners; dentro del shell, todos los consumidores
comparten los mismos DOS listeners. No coordinación multitab implementada.

Costo relativo: iniciar sesión abre dos consultas (hasta 30 + 51 documentos,
con posible solapamiento); cambios/reconexiones tienen lecturas propias del SDK.
No es una cota de facturación: consultas vacías, índices, Rules y reconexiones
pueden agregar costo. Observe/rerender no añade queries; timer solo filtra memoria.
Marcar requiere lectura transaccional + una actualización si sigue unread, más
lecturas por retry y notificaciones de listeners. No contador agregado. Abrir
página siguiente todavía no tiene API ni costo implementado.

Índices locales añadidos SOLO para estas queries, scope COLLECTION:
1. createdAt DESC + __name__ ASC (recent).
2. readAt ASC + createdAt DESC + __name__ ASC (unread).
La dirección explícita del ID difiere del default que sigue al último campo.
Fuente oficial: https://firebase.google.com/docs/firestore/query-data/index-overview
Emulator verifica ejecución/autorización, no provisionamiento de índices remotos.
No se publica ningún índice ni Rule. Deben estar listos antes del rollout futuro.

Android/iOS podrán implementar estas mismas queries, identidad de instancia y
resultados de transacción con su SDK; el controlador JS no obliga a una tecnología
mobile. Rules y servicios productores de Etapa 1 permanecen sin cambios aquí.

Hallazgo real de integración: Rules puede devolver permission-denied al write
obsoleto antes de que el SDK reintente por conflicto (readAt ya leído o documento
retirado). El repositorio reconcilia una sola vez con transacción SOLO LECTURA:
si confirma alreadyRead/missing/stale lo devuelve; si sigue siendo la misma
instancia unread conserva el error original. No relaja Rules, no reescribe fechas
ni convierte denegaciones sin evidencia en éxito. Este camino agrega una lectura
en dichas carreras y está probado con SDK real en Emulator y con fallo persistente
simulado. La reinvitación concurrente también se prueba durante el callback real.

Validación final Etapa 3: dominio 28/28, repositorio Node 11/11, sesión 6/6,
sociales Node 72/72. Suite Node completa 464/464 (+17 sobre Etapa 2).
Rules actividad 43/43 (+4 de repositorio real), históricas 148/148: total 191/191.
Build aprobado, warning existente de bundle >500 kB. Sin cambios de Rules ni
servicios sociales productores. Sin acceso a producción ni publicación.
La integración visual, paginación histórica, marcar todo y rollout siguen pendientes;
no son blockers del contrato de consumo de Etapa 4.

## Etapa 4 — campana y panel rapido

App posee una unica instancia de useActivity por usuario autenticado. El hook
crea/observa/descarta activitySession; Header solo recibe el estado y acciones.
ActivityBell no consulta Firestore. Al cambiar usuario el hook devuelve estado
vacio de carga inmediatamente, ignora perfiles/callbacks anteriores y dispone
la sesion anterior. La futura pagina podra consumir este mismo objeto.

Componentes: ActivityBell (boton/panel no modal) y ActivityItem reutilizable.
activityPresentation separa copy, tiempo y politica de interaccion del contrato.
Campana junto a controles personales, Lucide Bell, badge oculto para cero o
unknown; nombre accesible anuncia cantidad/50+/incertidumbre. Botones nativos,
foco visible, region etiquetada; abrir enfoca el panel, Escape/cerrar devuelve
foco, pointer fuera cierra sin robar el foco del control externo. Sin focus trap.
Desktop anclado; mobile web panel acotado al viewport, con scroll vertical.
Apertura/listeners NO marcan items; no hay enlace muerto a pagina futura.

Estados: loading, error con retry, vacio confirmado, lista y diagnosticos seguros.
Recent/unread siguen independientes. Leido/no leido se distingue con punto,
peso/fondo sutil y texto para lector de pantalla. Tiempos: Ahora/minutos/horas,
luego fecha corta es-AR en zona local, time con dateTime ISO y fecha completa.

Actores: reutiliza loadSocialProfiles, una lectura por actor nuevo de recientes
por sesion, deduplicada incluso mientras esta pendiente; no listeners por actor.
La lista aparece sin esperar perfiles. Solo se conserva nombre para presentacion;
error/ausencia usa Alguien sin revelar motivo ni email. Cache hasta fin de sesion,
sin retry automatico repetitivo; cambios de nombre se reflejan al resolver de
nuevo en otra sesion. Esto no es una auditoria historica del nombre del actor.
No se consultan nombres de planes: copy generico Plan conjunto evita lecturas
adicionales. No cambian Rules ni servicios sociales para enriquecer texto.

Activar captura itemId/instanceKey e intenta markRead incluso si ya figura leido,
para detectar retiro/reuso entre render y click. marked/alreadyRead navegan;
stale/missing permanecen en panel con mensaje generico. cancelled no navega.
Error o espera superior a 8 segundos permite ir a seccion general con aviso,
SIN seleccionar plan no confirmado. El timeout no cancela un commit enviado;
la identidad transaccional de Etapa 3 sigue protegiendo reinvitaciones.
Se bloquean activaciones repetidas mientras se espera, no la navegacion global.

Friendship abre Amigos sin modificar relaciones. JointPlan emite intencion con
token de un solo uso; Planner espera su lista autorizada, filtrada por carrera,
abre Plan conjunto y selecciona solo un plan presente y no en eliminacion.
Ausente/no autorizado/otra carrera devuelve explicacion generica sin consulta
adicional, sin cambiar carrera ni progreso. La intencion se consume al resolver
la lista y no reaparece por rerenders. Acceso perdido despues queda cubierto por
los listeners y fallback existentes del Planner. No modifica motor inteligente.

Costo nuevo: hasta un perfil por actor distinto observado en recientes durante
la sesion (maximo 30 en la ventana inicial; nuevos actores pueden sumar lecturas).
Abrir/cerrar panel no reinicia los dos listeners ni relee perfiles. Navegar usa
los flujos existentes de Amigos/Planner; marcar usa la transaccion ya documentada.
Sin pagina completa, paginacion historica, filtros visuales, marcar todo ni push.

Validacion visual NO aprobada automaticamente. Checklist manual, en entorno de
Emulator aislado con cuentas de prueba y sin configuracion de produccion:
1. Desktop: campana cerca del perfil, panel anclado, textos largos y scroll.
2. 320/375/768 px: sin overflow horizontal, cerrar accesible y lista desplazable.
3. Tab a campana; Enter y Space abren; Escape/cerrar devuelven foco; click fuera
   cierra sin mover foco; Tab recorre items sin quedar atrapado.
4. Badge: 0 oculto, 1/50 numerico, 51 como 50+, loading/error sin falso cero.
5. Abrir/cerrar sin activar no cambia readAt. Un item activado cambia solo su
   instancia; comprobar estilo leido y que no se duplica la escritura.
6. Solicitud recibida/aceptada -> Amigos. Invitacion -> Plan conjunto correcto;
   carrera distinta/no disponible -> fallback sin cambiar carrera.
7. Retirar/reinvitar entre render y click: la nueva invitacion sigue sin leer,
   aparece fallback; dos pestanas leyendo convergen sin resetear readAt.
8. Cortar conexion: error/loading honesto y retry; fallo al marcar permite seccion
   general tras como maximo 8 s. Perfil no disponible usa Alguien.
9. Logout y A->B: no quedan avisos, nombres ni navegaciones del usuario anterior.

No se crean fixtures en produccion. Los eventos manuales pueden generarse desde
los flujos normales con dos cuentas SOLO cuando la app este configurada y
verificada contra Auth/Firestore Emulator en proyecto demo; este cambio no agrega
conexion UI al Emulator. Si ese entorno no esta preparado, prepararlo aparte
antes de realizar estas pruebas. Los tests automatizados ya usan Emulator aislado.
Rollout web + Rules + indices sigue pendiente y requiere autorizacion separada.

Resultado automatico Etapa 4: dominio 28/28, repositorio 11/11, sesion 6/6,
presentacion/UI/integracion 29/29 nuevos, sociales Node 72/72.
Node completo 493/493 (+29), Emulator 191/191 (43 actividad + 148 historicos,
sin cambios de Rules/indices en esta etapa). Build aprobado.
Ajustado el harness del test existente de App para inyectar el nuevo hook;
sin cambios de expectativa sobre motores/progreso. No hay aprobacion visual
implicita: pendiente checklist manual anterior. Sin produccion ni publicacion.

Infraestructura de validación manual: ver [manual-emulator.md](manual-emulator.md).
Incluye modo dev explícito, proyecto demo fijo y Auth/Firestore locales juntos.
Preparar esta infraestructura no implica haber iniciado el entorno manual ni
haber aprobado visualmente la Etapa 4. El runner aislado de Rules sigue separado.

## Revisión posterior a validación manual de Etapa 4

Validación manual reportada por el usuario, con dos cuentas ficticias en Chrome y
Edge y proyecto demo-correlativas-manual: solicitud recibida, aceptación,
invitación de plan, navegación exacta, lectura individual, retiro al rechazar y
reinvitación pasaron. También reportó realtime, orden, nombres, tiempos y ausencia
de contaminación entre esas dos sesiones. No se atribuye esta prueba al agente.

Se encontró un defecto de alcance CSS: ActivityItem usaba planning-sr-only, cuya
regla requiere un ancestro planning-ui. La campana no lo tiene, por eso aparecía
el texto destinado al lector de pantalla. Corrección mínima: activity-sr-only
con recorte visual propio, sin display:none, visibility:hidden ni aria-hidden.
Leída/Sin leer se conserva en el nombre accesible; punto, peso y fondo siguen
identificando el estado visualmente. Agregada regresión de markup y selector CSS.
La comprobación visual posterior ya fue realizada por el usuario: PASS. Badge,
fondo, punto, peso, actor y tiempo correctos; Sin leer ya no aparece visualmente
y el layout se conserva. Esto cierra esa comprobación, no toda la checklist manual.

Regresión Node actual: 504/504 (UI 30/30; +1). Incluye dominio, repositorio,
sesión, sociales y los 10 tests de infraestructura, con build Emulator rechazado.
Build normal aprobado, warning conocido de bundle >500 kB.
Validación pendiente completada tras el cierre manual confirmado por el usuario: Rules actividad 43/43, históricas 148/148, total 191/191, sin fallos ni omitidos. Runner demo-correlativas-rules cerrado correctamente. No fueron necesarios otros cambios de código ni nuevas regresiones Node después de la corrección CSS ya validada. Lista para release review; la publicación sigue sujeta al rollout separado.

Conservar infraestructura Emulator para futuras regresiones locales. Pendientes
manuales no cubiertos por la prueba reportada: responsive, recorrido completo de
teclado/lector, volumen 50+, concurrencia durante click, timeout/desconexión,
fallback de actor, logout/A->B dentro del mismo navegador. Varios tienen tests
automáticos, pero eso no equivale a validación manual. Rollout coordinado,
índices remotos y compatibilidad de clientes antiguos siguen siendo condiciones
de publicación separadas del dictamen funcional.
