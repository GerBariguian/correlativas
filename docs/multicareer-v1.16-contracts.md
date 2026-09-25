# Multicarrera — v1.16.0, Etapa 0: contratos

Estado: contrato objetivo congelado documentalmente. Etapas 1–2 implementan
dominio puro y persistencia de metadata aislada, descritos al final.
La integración productiva y la migración productiva **no están implementadas**.
Etapa 3 incorpora un [migrador solo local](multicareer-migration.md), con
fixtures/Emulator y checkpoints administrativos; no activa enforcement de
freeze, cliente puente ni cutover productivo.
Base auditada: `8a4abd4` — v1.15.0, Centro de Actividad y notificaciones sociales.
Esta etapa no cambia código, Rules, paths productivos ni datos. Aprobar este
documento no autoriza ejecutar migraciones ni publicar ningún artefacto.

## 1. Alcance y precedencia

Las decisiones normativas se expresan con «debe»/«no debe». Los schemas son
contratos conceptuales para implementar y probar en etapas posteriores; no son
una afirmación de que los paths ya existen. La codificación definitiva de Rules
y sus límites debe demostrarse en Emulator antes de conectar funcionalidad.

Este documento es la referencia objetivo de v1.16. Los documentos siguientes
conservan evidencia del comportamiento implementado hasta v1.15; sus decisiones
incompatibles quedan **superseded para el diseño v1.16**, no para describir el
runtime actual:

| Evidencia histórica | Comportamiento actual que no debe trasladarse a v1.16 |
|---|---|
| [Sharing](planificar-con-amigos.md), [fase 2](planificar-con-amigos-fase-2.md) | Consentimiento único por usuario y lectura condicionada por carrera activa |
| [Planes colaborativos](planes-colaborativos.md) | Ingreso/creación por carrera activa, sin binding personal explícito |
| [Persistencia de proyección](career-projection-persistence.md) | Documento y controlador identificados por catálogo |
| [Motor de proyección](career-projection-engine.md) | Rechazo retrospectivo de estados por `INCONSISTENT_STATUS` |
| [Activity](activity-notifications.md), [rollout](activity-rollout.md) | Su gate de creación social no es un gate de migración académica |

La propuesta conversacional previa de suspender todo un Joint Plan ante un
miembro archivado queda reemplazada: **se inactiva solo su participación**.
No cambia el cierre explícito del plan ni se reabre un plan cerrado al restaurar.

Fuera de Etapa 0: App multicarrera, repositorios nuevos, generador de IDs,
migrador, Rules nuevas, cambios académicos, UI y cualquier acceso productivo.
La eliminación física general queda fuera del release multicarrera inicial.

## 2. Identidad: invariantes oficiales

- La cuenta representa una persona; `uid` no identifica una carrera.
- La cuenta puede tener cero, una o múltiples carreras, de distintas universidades.
- Los actuales `careers[].id` pasan conceptualmente a `catalogId`: universidad,
  carrera y plan. Cambiar una etiqueta visible no exige cambiar ese identificador.
- Los códigos de materias son locales a un catálogo, nunca globalmente únicos.
- `careerInstanceId` es opaco e independiente de `catalogId`; no se usa el ID del
  catálogo como ID de instancia. La identidad personal completa es `(uid, instanceId)`.
- Un usuario tiene como máximo una instancia por catálogo, también al archivar.
  Se usa un índice único por catálogo dentro del usuario, no una búsqueda/listado.
- `careerInstance.catalogId` es inmutable. Cambiar de plan académico no reasigna
  silenciosamente la instancia anterior. No se implementan equivalencias.
- `activeCareerInstanceId` es navegación exclusivamente y puede ser `null`.
  Cambiarlo no modifica permisos, progreso, sharing, amistad ni Joint Plans.
- Al archivar la seleccionada se guarda `null`; no se elige una carrera arbitraria.
- «Activa» en lifecycle significa **no archivada**, no «visible en pantalla».

Los nombres de universidad/carrera/plan se resuelven por `catalogId`. No se
duplican en cada documento personal. Los IDs de catálogo no se renombrarán por
similitud textual: una eventual sustitución requiere mapping explícito y revisión.

## 3. Schema objetivo

Convenciones: `timestamp` de servidor para nuevas mutaciones; no inventar fechas
históricas desconocidas. `status` es Pendiente/Cursando/Regularizada/Aprobada.
Las listas de campos de nuevos documentos serán allowlists, no permiso para
escribir propiedades arbitrarias. Los campos legacy retenidos no habilitan
escrituras de clientes antiguos sobre una autoridad `instances`.

### 3.1 Cuenta, instancia e índice

| Path | Campos y tipos | Relación/invariantes |
|---|---|---|
| `users/{uid}` | `schemaVersion: 2`, `activeCareerInstanceId: string|null`, `socialEmail?: string`, `createdAt?: timestamp`, `updatedAt: timestamp`, `activeCareerId?: string` legacy | Selección propia no archivada o null. Conservar campos históricos inventariados, sin descartarlos al cambiar el sobre |
| `users/{uid}/careerInstances/{instanceId}` | `schemaVersion: 1`, `catalogId: string`, `lifecycle: active|archived`, `createdAt: timestamp`, `updatedAt: timestamp`, `archivedAt: timestamp|null`, `sharing: {enabled: bool, consentVersion: int|null, epoch: int, updatedAt: timestamp}` | ID y catálogo inmutables. Creación con sharing OFF. Fechas de instancia nuevas no se presentan como fecha histórica de inicio de carrera |
| `users/{uid}/catalogMemberships/{catalogId}` | `schemaVersion: 1`, `careerInstanceId: string` | Correspondencia única, inmutable y bidireccional con la instancia |

`deleting/deleted` no son estados operativos del release inicial. No se crearán
servicios, UI ni permisos de eliminación física de carreras en estas etapas.

El propietario lee su cuenta, instancias e índices y puede listar los propios.
Puede escribir únicamente mediante transiciones validadas. No puede borrar
libremente el índice ni reasignarlo. Las instancias archivadas siguen legibles
por su propietario, pero no aceptan edición académica ordinaria hasta restaurar.

### 3.2 Compatibilidad mínima entre amigos

Se permite comprobar un `catalogId` concreto, no listar carreras ajenas:

1. El solicitante está autenticado según el contrato social y tiene amistad aceptada.
2. Posee una instancia no archivada de ese catálogo.
3. Se resuelve exactamente el índice del amigo y su instancia compatible no archivada.
4. No se entrega progreso, proyección, consentimiento privado, fechas ni inventario.

Firestore entrega documentos completos; **no se debe autorizar lectura ajena
del documento privado `careerInstances` para simular una lectura de campos**.
El índice solo contiene el ID y versión. Su `get` ajeno puede condicionarse por
Rules a las instancias compatibles activas; `list` ajeno queda denegado. Rules
puede inspeccionar documentos privados para esa comprobación sin conceder su
lectura al solicitante. Ausencia/denegación no debe presentarse como certeza de
que el amigo no estudia esa carrera: la UI recibe compatible/no disponible.

Esta precisión de acceso no altera los paths propuestos: evita exponer el
consentimiento embebido y otros campos privados de la instancia.

### 3.3 Progreso y proyección

| Path bajo `users/{uid}/careerInstances/{instanceId}` | Campos y tipos | Contrato |
|---|---|---|
| `academic/progress` | `schemaVersion: 1`, `statusMap: map<code,status>`, `revision: int`, `updatedAt: timestamp` | Propietario exclusivo. Revisión validada, no contador arbitrario. Copiar estados históricos exactamente |
| `planning/projection` | `schemaVersion: 3`, `revisionToken: string`, `scenario: map`, `updatedAt: timestamp` | Propietario exclusivo; compare-and-set con revisión. Identidad por path, no por catálogo duplicado |

`scenario` conserva startPeriod, initialCapacity, maxPeriods, capacities,
manualPeriods y finalEvents del contrato actual. La versión 3 cambia el sobre
de identidad, no inventa una semántica nueva para las decisiones. La lectura
legacy reconoce v1/v2 antes de convertir el sobre. No se persiste statusMap ni
el resultado simulado dentro de la proyección.

Progreso, autosave, caché, controladores, requests de workers y respuestas tardías
deben quedar aislados por usuario e instancia. Dos catálogos con el mismo código
de materia no comparten estado. Cambiar progreso real no dispara autosave de las
decisiones de proyección por sí solo.

### 3.4 Consentimiento y snapshot

El consentimiento pertenece al campo `sharing` de la instancia. Esto permite
archivar y apagar sharing en la misma actualización, sin coordinación global.

Path: `users/{uid}/careerInstances/{instanceId}/sharing/snapshot`.

Campos: `schemaVersion: 3`, `approvedCodes: string[]`,
`availableToCourseCodes: string[]`, `pendingFinalCodes?: string[]`,
`sourceProgressRevision: int`, `sourceUpdatedAt: timestamp`, `consentEpoch: int`,
`logicVersion: string`, `catalogVersion: string`, `updatedAt: timestamp`.

- Propietario escribe con coherencia de progreso/consentimiento en operación atómica.
- Incrementar epoch al revocar; una nueva autorización usa un epoch nuevo. Un
  snapshot viejo no vuelve a ser vigente por restaurar o volver a consentir.
- Restaurar nunca activa sharing. Rehabilitar exige acción explícita y snapshot vigente.
- Conservar límites, gramática de códigos, unicidad e intersecciones del contrato.
- Consentimiento v1 no autoriza finales pendientes; no se convierte a v2 sin permiso.
- `pendingFinalCodes` significa regularizadas pendientes de aprobación, no todas
  necesariamente habilitadas para rendir.
- El propietario puede leer su snapshot archivado. Terceros solo mediante el
  predicado de privacidad de la sección 5; no hay listado global.
- Rules valida autorización, forma y coherencia, no recalcula el catálogo entero.
  El snapshot cliente sigue siendo una declaración derivada, no una certificación.

### 3.5 Identidad social

`socialProfiles/{uid}` objetivo: `schemaVersion: 2`, `uid: string`, `name: string`,
`photoURL: string`, `updatedAt: timestamp`. Sin `careerId` como identidad pública.
Escribe el propietario bajo autenticación social y coherencia del índice de email;
lectura de esos campos sociales según el contrato actual, sin agregar carreras.
Durante transición se leen perfiles v1/v2, pero no se publica una carrera activa
como sustituto de un inventario personal.

`friendships/{id}` conserva participants, senderId, recipientId, status y fechas,
con las transiciones y privacidad existentes. No incorpora catalogId/instanceId.
`socialEmails/{email}` conserva el índice exacto email → uid y sus protecciones.
Amistad entre universidades/planes distintos es válida; no otorga acceso académico.

### 3.6 Joint Plans

`jointPlans/{planId}` objetivo: `schemaVersion: 2`, `catalogId: string`,
`ownerId: string`, `inviteeIds: string[]`, `memberIds: string[]`,
`participants: map<uid, {careerInstanceId: string|null,
bindingState: resolved|unresolved|catalog-unavailable, resolutionReason?: string}>`,
`name: string`, `invitedBy: map<uid,uid>`, `closed: bool`, `deleting: bool`,
`createdAt: timestamp`, `updatedAt: timestamp`.

El mapa acotado conserva el máximo actual de propietario + cuatro invitados;
arrays y mapa deben ser coherentes. Cada binding resolved apunta a una instancia
del UID correspondiente con el catálogo del plan. No se sustituye al cambiar
selección ni se asigna a un plan diferente por el nombre visible.

`jointPlans/{planId}/subjects/{code}` conserva code, proposedParticipantIds,
addedByUid y fechas. Los UIDs propuestos se resuelven contra el binding del plan.
No hace falta duplicar nombres de catálogos o instancias en cada subject.

Lectura histórica por propietario/invitados y lectura de subjects por miembros
según contratos de privacidad existentes. Escritura académica solo por miembros
operativos en plan abierto. Cierre/salida/cleanup autorizados se evalúan aparte:
archivar no debe impedir el retiro seguro. Mantener las transacciones source +
Activity y tombstone de eliminación de planes; no confundirlas con eliminación
de una carrera personal, que está diferida.

### 3.7 Activity y experiencias de producto

`users/{uid}/activityInbox/{itemId}` conserva schemaVersion, type, actorUid,
createdAt, target y readAt. Inbox y lectura son user-scoped. Los eventos sociales
los escriben los actores autorizados junto con su transición atómica. No se
generan avisos sintéticos por copiar una carrera ni se duplican los existentes.

El ID de destino permite resolver un plan autorizado y después el binding del
usuario. No es necesario agregar catalogId/instanceId a todos los avisos. Si en
otra etapa se incluye contexto, será una pista no autoritativa. El `instanceKey`
actual de Activity identifica una ocurrencia del aviso, no una carrera personal.

`users/{uid}/productExperiences/{experienceId}` objetivo:
`schemaVersion: 1`, `definitionVersion: int`, `status: completed|dismissed`,
`updatedAt: timestamp`. Solo el propietario lee/escribe; compartible entre
clientes futuros, sin depender de localStorage ni de una carrera.

IDs conceptuales distintos: `new-user-onboarding-v1` y `multicareer-release-v1`.
La ausencia de un documento de experiencia no demuestra que la cuenta sea nueva.
El origen legacy/new se resuelve por el protocolo de alta/migración protegido.
Onboarding breve y omitible incluye agregar la primera carrera, sin obligarla.
Migrados reciben novedades, no onboarding por quedar con selección null.

## 4. Lifecycle y operatividad colaborativa

| Acción | Efecto obligatorio |
|---|---|
| Agregar | Transacción índice + instancia, catálogo permitido, sharing OFF, sin duplicado incluso concurrente |
| Seleccionar | Solo cambia contexto propio; selección null permitida |
| Archivar | Preserva progreso/proyección/historia; lifecycle archived, sharing OFF y epoch invalidado; selección propia a null si correspondía |
| Restaurar | Misma identidad y datos; lifecycle active; sharing OFF; no reabre planes cerrados |

La creación verifica el índice exacto. Si ya existe una instancia archivada no
se crea otra: corresponde restaurar. Rules debe comprobar mediante `getAfter`
que índice e instancia se referencian mutuamente y prohibir cambios/borrados que
permitan evadir unicidad. El ID opaco no es una barrera de privacidad.

### Binding histórico versus operatividad actual

`bindingState` registra si la referencia histórica pudo resolverse. No persistir
un booleano operativo como autorización: la operatividad se deriva del estado
actual de instancia, compatibilidad, membresía y cierre/bloqueo del plan.

| Situación | Historia | Operatividad |
|---|---|---|
| resolved + instancia activa compatible | Conservar binding | Según rol y estado del plan |
| resolved + instancia archivada | Conservar binding y propuestas | Inactiva solo esa persona; los demás continúan |
| restauración de la misma instancia | Reusar binding | Reevaluar; sharing sigue OFF |
| unresolved, sin instancia demostrada | Conservar UID y rol histórico | No asignar nuevas materias ni fabricar instancia |
| catálogo inexistente | Conservar referencia literal | No operativo para ese catálogo; diagnóstico explícito |
| invitación pendiente | Conservar invitación | No aceptar durante migración; resolución compatible antes de ingreso |

Los bindings ajenos no pueden ser reasignados libremente por el propietario del
plan. Las nuevas invitaciones/aceptaciones validarán correspondencia de UID,
instancia y catálogo, además de amistad donde corresponda.

Un participante archivado no recibe nuevas propuestas/asignaciones. Las antiguas
se preservan y se identifican como históricas/inactivas; conservar una propuesta
existente no equivale a agregar una nueva. No se bloquea al resto de miembros
compatibles por el archivado de otro, incluso si es el propietario. Sus acciones
exclusivas de administración y cleanup se separan de la edición académica.
No se elimina historia para satisfacer una validación de un payload nuevo.

## 5. Invariantes de seguridad y futuros tests de Rules

| ID | Invariante normativa / prueba exigida |
|---|---|
| SEC-01 | `activeCareerInstanceId NEVER authorizes access`: cambiar selección de cualquiera no cambia el resultado de autorización académica |
| SEC-02 | `uid + catalogId` → máximo una instancia; creación concurrente, índice ausente/falso y reasignación deben probarse |
| SEC-03 | `careerInstance.catalogId is immutable`; índice e instancia deben corresponder atómicamente |
| SEC-04 | Instancia archivada no comparte progreso; restauración no reactiva sharing ni un snapshot de epoch previo |
| SEC-05 | `friendship != academic access`; amistad permite relación social, no leer progreso privado |
| SEC-06 | `joint-plan membership != academic sharing`; sin transitividad entre participantes |
| SEC-07 | `Activity target != authorization`; resolver destino con permisos actuales |
| SEC-08 | `legacy consent cannot expand during migration`; catálogo y alcance de consentimiento preservados |
| SEC-09 | `social/historical references cannot create academic trajectories`; migrador debe demostrar evidencia propia, no confiar en referencias sociales |
| SEC-10 | Progreso/proyección privados solo al propietario; datos de otra instancia no se mezclan por código de materia |
| SEC-11 | Compatibilidad ajena: get exacto y mínimo entre amigos compatibles; nunca listado de carreras ajenas ni lectura del documento privado completo |
| SEC-12 | Snapshot ajeno exige amistad, propietario activo, consentimiento propio, lector activo compatible y vigencia; sharing es unilateral |
| SEC-13 | Autoridad y checkpoints no son campos editables libremente por cliente; ningún payload puede autoconceder una migración validada |
| SEC-14 | Autoridad instances bloquea escrituras legacy y rutas legacy que eludan revocación/archivado |
| SEC-15 | Archivo de participante conserva historia y no suspende a los demás; no admite nuevas asignaciones al inactivo |
| SEC-16 | Mantener source + inbox atómicos, anti-spoof/replay, retiro seguro y tombstones de planes |
| SEC-17 | Sesión/instancia capturada en cada operación; respuestas tardías y autosave no escriben en otro contexto |

Predicado final de lectura ajena de snapshot:

```text
socialUser(reader)
AND acceptedFriend(reader, owner)
AND unarchived(ownerInstance)
AND ownerInstance.sharing.enabled
AND reader owns an unarchived instance of ownerInstance.catalogId
AND snapshot matches progress revision, consent epoch and supported versions
```

No incluye la carrera visible de ninguna persona ni consentimiento recíproco.
El catálogo compatible se resuelve con índice de path conocido. No se concede
acceso a todos los catálogos por ser amigo. Listados y reads exactos tendrán
contratos distintos; Rules no debe usarse como un filtro posterior a la consulta.

La implementación debe medir los accesos de Rules para fan-out máximo con
bindings, amistad e inbox. Los éxitos de v1.15 no prueban el presupuesto de v1.16.
SEC-09 e idempotencia requieren además tests del migrador: una herramienta
administrativa omite Rules de cliente y necesita invariantes propias.

## 6. Migración administrativa idempotente

Protocolo aprobado:

```text
inventory → freeze por usuario → reread → copy → validate → cutover
```

Herramienta local administrativa, lotes pequeños y autorización separada para
acceso real. Sin Cloud Functions, billing/trial ni supuesto de CLI autenticada.
Credenciales nunca en repositorio/logs. No se crea esa herramienta en Etapa 0.
La ejecución futura debe fijar proyecto/base, limitar operaciones y poder
detenerse/reanudar por cuotas; no presumir que un volumen desconocido cabe en Spark.

### Evidencia y clasificación

| Evidencia | Tratamiento |
|---|---|
| Progreso privado | Evidencia fuerte de trayectoria; copiar estados exactos |
| Proyección privada | Evidencia fuerte aun sin progreso; preservar decisiones |
| activeCareerId válido | Elección propia; permite instancia vacía, no aprobaciones ficticias |
| Consentimiento propio validado | Evidencia propia; heredar solo para sharedCareerId y con el mismo alcance |
| Snapshot aislado | Evidencia derivada insuficiente; preservar/revisar |
| socialProfiles.careerId | Presentación histórica insuficiente |
| Joint Plan, invitación, referencias sociales | No fabrican trayectoria |
| Catálogo desconocido/legacy | Preservar origen y reportar; no mapear por parecido |

No migrar únicamente activeCareerId: v1.15 guarda progreso/proyecciones de varios
catálogos. Inventario debe contemplar documentos sin padres y cuentas Auth sin
perfil Firestore. Proyecciones y snapshots tienen restricciones de list en Rules
actuales: una enumeración de cliente incompleta no demuestra ausencia.

### Control protegido y checkpoints

Path conceptual: `migrationUsers/{uid}`. Campos:
`schemaVersion: 1`, `generation: string`, `authority: legacy|frozen|instances`,
`phase: pending|copying|validated|complete|blocked`, `origin: legacy|new`,
`manifestId: string`, `updatedAt: timestamp`.

Solo el operador autorizado modifica controles de migración; lectura propia
para que el cliente explique su estado. El alta de cuentas nuevas necesitará
un bootstrap separado y probado: no permitir que una cuenta antigua se declare
new/complete para saltear verificación. Origen no se infiere de selección null.

Manifiesto/checkpoints protegidos por usuario/tarea: paths origen/destino,
identidad asignada, versión/huella de fuente, estado copied/verified, error
acotado. No incluir tokens ni progreso completo en logs. Metadata técnica no es
identidad académica ni debe utilizarse para ampliar permisos.

### Algoritmo contractual

1. Inventariar fuentes y clasificar evidencia/conflictos; aprobar manifiesto.
2. Si ya está complete/instances, verificar sin recopiado ni nueva identidad.
3. Congelar las escrituras relevantes del usuario mediante autoridad protegida.
4. Releer fuentes después del freeze; si difieren, revalidar antes de copiar.
5. Por catálogo demostrado, reutilizar índice o ID reservado en manifiesto;
   crear índice + instancia atómicamente. Una divergencia bloquea, no se pisa.
6. Copiar progreso exacto y proyección compatible; preservar fuentes originales.
   Ausencia de progreso no autoriza inventar estados alcanzados.
7. Importar consentimiento solo a su catálogo; OFF sigue OFF, v1 no pasa a v2.
   No dar por vigente un snapshot viejo: regenerar desde fuente/consentimiento
   verificados o mantener acceso no disponible hasta poder demostrar coherencia.
8. Resolver selección antigua válida; inválida o no resoluble → null.
9. Clasificar planes propios, membresías e invitaciones; no crear instancias
   para resolverlos. Mantener invitaciones pendientes y bindings unresolved.
10. Verificar payloads, fuentes, índices, revisiones, alcance de consentimiento
    y referencias. Un caso desconocido debe quedar explícito; no declarar
    completitud si su preservación/aislamiento no está demostrada.
11. Cutover: authority instances. Legacy permanece almacenado y no autoritativo.

La migración de planes es una unidad separada, con versión y checkpoint propios;
un usuario no puede reescribir arbitrariamente bindings de otros. La coordinación
de cambios sociales concurrentes necesita ensayo de freeze/relectura por plan,
no suponer que congelar un usuario congela todos sus planes. No debe haber una
ventana de edición legacy que omita los bindings una vez convertido el plan.

Idempotencia de dominio:

```text
M(M(datos)) = M(datos)
```

No nuevos IDs, revisiones/fechas de dominio repetidas, avisos de migración ni
reactivación de consentimiento. No sobrescribir progreso posterior al cutover.
Interrupción: retomar checkpoint y validar destino antes de continuar; nunca
interpretar «existe» como «copiado correctamente». Checkpoints técnicos de
verificación pueden registrar intentos sin alterar los datos de dominio.

## 7. Compatibilidad, rollout y recovery

| Autoridad | Fuente y escrituras |
|---|---|
| legacy | Modelo v1.15 autoritativo; cliente puente usa adaptadores legacy |
| frozen | Fuentes académicas detenidas para copia/verificación; no convertir falla en datos vacíos ni guardar defaults |
| instances | Modelo v1.16 autoritativo; escrituras legacy bloqueadas, sin fallback al legacy ante error |

`activeCareerId` puede conservarse como evidencia legacy: no selecciona el
contexto principal v1.16 ni autoriza. No mantenerlo con dual-write ingenuo.
Antes del cutover el runtime legacy aún tiene sus condiciones históricas;
estas no deben sobrevivir como una segunda vía de permiso tras el cutover.

Dual-read permitido: adaptador elige schema/fuente por autoridad; inspección y
comparación de copias durante validate; lectura histórica explícita. Prohibido
fusionar statusMaps de fuentes distintas o hacer fallback silencioso por error.

No dual-write bidireccional en progreso, proyección, sharing o lifecycle. Copy
controlado no es replicación continua. No duplicar Activity ni amistades.

Secuencia futura: contratos → dominio/repositorios aislados → tests/Emulator →
Rules de transición revisadas → cliente puente → inventario autorizado → piloto
freeze/copy/validate/cutover → lotes → Rules finales → retiro legacy en otra versión.
La publicación puede ser manual desde Console; no presupone CLI autenticada.
Cada publicación y ejecución real necesita autorización independiente.

| Punto de recovery | Límite |
|---|---|
| Antes de cutover | Volver a legacy si fuente sigue íntegra y no hubo escritura nueva autoritativa |
| Copia interrumpida | Mantener freeze o reanudar; no activar parcialmente documentos |
| Después de cutover | Preferir cliente puente/recovery manteniendo authority instances |
| Después de escritura/archivado nuevo | No volver ciegamente a v1.15 ni publicar sus Rules originales |

Recovery nunca reabre snapshots legacy que ignoren el nuevo archivado/consentimiento.
Un cliente viejo de usuario migrado falla cerrado; compatibilidad no promete que
pueda seguir mutando un modelo que desconoce. Mantener lectura propia histórica
no equivale a seguir autorizando acceso social mediante condiciones legacy.
El generador de rollout de Activity es antecedente de artefactos verificables,
no prueba de que ya exista un protocolo multicarrera.

## 8. Requisitos académicos agregados e historia

Contrato genérico, sin fijar todavía nombre de metadata:

```text
COUNT(computable academic elements WHERE state == Aprobada) >= N
```

El conjunto computable debe ser explícito/versionado y pertenecer al catálogo
de la instancia. No contar claves desconocidas, otra trayectoria, regularizadas
ni duplicados. No deducir pertenencia por nombre, horas o año curricular.

El dominio produce `required`, `actual`, `missing`, `satisfied` e identificación
del requisito. La UI no cuenta ni decide elegibilidad: presenta ese diagnóstico.
El evaluador común debe integrar correlativas por código y agregados sin crear
códigos ficticios ni inventar aristas del Mapa.

Integración posterior: canCourse, diagnósticos, Dashboard/Advisor, Materias,
Mapa, Planner general/optimizado/sugerencias, Projection, snapshots y versiones.
Fingerprint debe incluir requisito y conjunto computable; logicVersion debe
reflejar cambios semánticos. Snapshot viejo no se declara compatible por mantener
los mismos códigos. Rules no se convierte en un segundo motor académico.

Estados reales son hechos históricos. Nuevos requisitos no degradan ni invalidan
estados alcanzados; afectan futuras transiciones. Se mantienen validaciones de
forma, estados válidos y referencias; una discrepancia retrospectiva académica
no debe por sí sola impedir proyectar. No reescribir progreso para «arreglarla».

Simulación: separar estado real inicial de cambios hipotéticos; no aprobar
automáticamente. Regularizar no incrementa aprobadas. Finales al cierre afectan
períodos posteriores; eventos del mismo período usan la misma instantánea.
La equivalencia del Planner optimizado con su evaluador de referencia es obligatoria.

### PPS06: conocido pero no activable todavía

PPS06 de `uade-informatica` requiere **38 materias aprobadas con final para
iniciar/cursar**. No extender esta condición a acreditación/finalización sin
evidencia adicional. El conjunto exacto computable todavía no está definido.

No modificar `src/data/uade/informatica.js`, no contar automáticamente sus 52
elementos ni decidir inclusión/exclusión de inglés, optativas, PPS o Proyecto
Final. El nombre o estructura de un elemento no prueba su computabilidad.
No cambiar temporalidad de PPS por esta condición ni inventar correlativas.

Aceptación futura: pendiente con 37 → falta 1; con 38/39 → satisface el umbral
si se cumplen otros requisitos. PPS ya Regularizada/Aprobada con 20 permanece
en ese estado y no bloquea toda la proyección por el umbral de ingreso añadido.
Los tests genéricos pueden usar conjuntos sintéticos explícitos; no presentarlos
como validación del conjunto real de PPS06.

## 9. Decisiones pendientes y límites

- Conjunto académico computable oficial de PPS06. Bloquea su activación, no el
  desarrollo de dominio genérico ni de instancias.
- Eliminación física: referencias históricas, reserva de identidad y reingreso
  al mismo catálogo. **Physical career deletion is deferred beyond the initial
  v1.16 multicareer release.** No UI, servicio ni Rules de eliminación ahora.
- Inventario real autorizado: tamaño, datos desconocidos, divergencias y cuentas
  Auth sin perfil. No se presupone ausencia de anomalías desde el repositorio.
- Bootstrap protegido para altas nuevas y coordinación de migración de planes:
  demostrar con contratos ejecutables en etapas 2–4 antes de su uso real.
- Límites exactos de Rules con bindings/fan-out y consultas necesarias: medir
  antes de cerrar implementación; no reducir garantías para encajar una operación.
- Credenciales/permisos del operador, cuotas y tamaño del lote: acordar al preparar
  migrador/release; no usar secretos en proyecto ni interpretar este documento como login autorizado.

No quedan abiertas la unicidad por catálogo, el sharing unilateral, la comprobación
mínima entre amigos ni la política de archivado de participantes: están aprobadas.

## 10. Criterios de aceptación por etapa

| Etapa | Demostración mínima / superficies | Límite para avanzar |
|---|---|---|
| 1 — Dominio de instancias | Helpers puros: identidad, índice, catálogo inmutable, cero carreras, lifecycle y binding/operatividad; tests unitarios sin React/Firebase | No conectar App ni persistencia productiva |
| 2 — Persistencia y Rules aisladas | Schemas y repositorios aislados; SEC-01..17 aplicables, creación concurrente, propietario archivado, privacidad de metadata, fan-out, altas y controles protegidos en Emulator | No publicar Rules ni cambiar paths runtime |
| 3 — Migrador | Inventario/manifest/checkpoints; una/múltiples carreras, proyección sola, IDs desconocidos, consentimiento v1/v2/OFF, repetición y corte por paso; M(M)=M | Solo fixtures/Emulator; sin ejecución productiva |
| 4 — Cliente puente | Selección de fuente por autoridad, cero carreras, fallos sin fallback, autosave/requests aislados y clientes viejos denegados tras cutover; freeze de planes probado | Sin migración masiva ni autorización implícita de publicación |
| 5 — Lifecycle/Mis carreras | Agregar/select/archive/restore; dos universidades y códigos coincidentes; null al archivar seleccionada; sharing OFF al restaurar | Sin eliminación física |
| 6 — Sharing/Joint Plans | Consentimientos independientes, no navegación como permiso, lectura exacta mínima, no transitividad, unresolved histórico, archivado de un miembro no bloquea al resto, restauración sin sharing | Mantener fuentes/avisos atómicos y cleanup; no fabricar bindings |
| 7 — Activity/ProductTour | Destino autorizado de otra carrera, avisos globales sin duplicación, onboarding omitible, migrated != new, completed/dismissed persistibles | No otorgar acceso por target ni por tour |
| 8 — Requisitos agregados/PPS | Fuente única, diagnósticos, 37/38/39, historia 20, Planner optimizado equivalente, Projection por instante, UI y fingerprint compatibles | Motor genérico puede completarse; PPS real solo con conjunto aprobado |
| 9 — Ensayo completo | Node, integración, Rules y smoke; matriz old/bridge/new × legacy/frozen/instances, recovery, interrupciones y ausencia de escrituras parciales; regresiones v1.15 | Todo local, sin dar por probado índice remoto o datos reales |
| 10 — Release review | Artefactos revisados, hashes, plan piloto/lotes, criterios de parada y recovery, pendientes clasificados y autorización separada | Review no es deploy; legacy no se retira en v1.16 |

Cada etapa deja el repositorio coherente y se detiene para revisión. No cambiar
runtime para hacer pasar un test contractual anticipado. Evitar tests de texto
que repitan este Markdown sin demostrar invariantes ejecutables.

## 11. Evidencia actual y contradicciones que se resolverán después

- `src/App.jsx`: catálogo por defecto y gate de onboarding; no representa aún
  cuenta sin carrera ni selección de instancia.
- `src/services/firestore.js`, `careerProjections.js`, `hooks/useCareerProjection.js`:
  paths/claves por careerId de catálogo. Hay datos potenciales de varios catálogos.
- `firestore.rules`: perfil social, snapshot ajeno, creación e ingreso a planes
  dependen hoy de activeCareerId. Deben evolucionar, no fingir que ya cumplen SEC-01.
- `src/services/planning.js`: un consentimiento global por usuario. Migración
  debe conservar alcance y versiones, no compartir automáticamente otras carreras.
- `src/projectionLogic.js`: `INCONSISTENT_STATUS` invalida entradas alcanzadas
  que no satisfacen requisitos actuales; futura adaptación distingue historia y
  nuevas transiciones. No se corrige en Etapa 0.
- `src/plannerLogic.js`: evaluación optimizada basada en listas de requisitos;
  agregar metadata sola no implementa agregados de manera consistente.
- `src/planningLogic.js`: huella actual no incluye conjuntos/requisitos agregados.
- `src/activityPresentation.js`: resuelve planes de la carrera visible; se debe
  resolver contexto autorizado, sin transformar notificaciones en permisos.
- `src/data/uade/informatica.js`: PPS06 sin umbral; sus 52 elementos no constituyen
  un conjunto computable demostrado. Proyecto Final conserva su política vigente.

Estas discrepancias son trabajo de etapas futuras, no cambios realizados por
este contrato. El estado del código v1.15 continúa siendo la referencia para
ejecutar hoy; este documento define cómo debe evolucionar.

## 12. Etapa 1: representación pura, todavía sin persistencia

`src/careerInstanceLogic.js` sigue la convención de módulos `*Logic.js` puros.
No importa React, Firebase, catálogos ni otros dominios; no genera IDs ni fechas.
El valor de dominio es exactamente `{uid, careerInstanceId, catalogId, lifecycle}`.
Los adaptadores futuros incorporarán uid/ID desde el contexto de persistencia;
esto no agrega campos a los documentos Firestore ni cambia el schema objetivo.

La representación es intencionalmente mínima: no admite progreso, proyección o
consentimiento embebidos. Archive/restore producen otro valor de lifecycle, no
un reemplazo de documento persistente. **Nunca guardar ese valor como sustituto
del documento completo**. El lifecycle productivo posterior deberá componer
sharing OFF/epoch y selección null, preservando los dominios académicos. El alcance
aprobado de Etapa 2 se limita a archive/restore de metadata, sin esos side effects.
`isActiveCareerInstance` expresa una condición necesaria para sharing, no un
permiso ni una implementación del consentimiento. Restore no tiene un campo
de sharing que pueda reactivar.

API pública:

- `CAREER_LIFECYCLES`, `CAREER_BINDING_STATES`: constantes congeladas.
- `createCareerInstance(identity)`, `validateCareerInstance(instance)`:
  identidad explícita; creación active; IDs distintos de catálogo/instancia.
- `validateCareerInstanceTransition(before, after)`: rechaza cambio de UID,
  instanceId o catalogId; el módulo no ofrece un setter de catálogo.
- `isActiveCareerInstance`, `isArchivedCareerInstance`, `archiveCareerInstance`,
  `restoreCareerInstance`: lifecycle puro, salidas congeladas, sin mutar entrada.
- `validateCareerInstances(uid, instances)`: colección de un propietario; rechaza
  duplicados de catálogo (incluidas archivadas), IDs repetidos y otros propietarios.
- `resolveCareerInstanceByCatalog(uid, instances, catalogId)`: null o instancia;
  ante ambigüedad arroja error, nunca elige la primera sin validar toda la colección.
- `resolveCareerSelection(uid, instances, selectedId)`: ID propio activo o null,
  sin fallback. Una colección corrupta arroja error aunque la selección sea null.
- `areCareerInstancesAcademicallyCompatible(a, b)`: ambas activas y mismo catálogo;
  null/undefined significa ausencia y da false. No recibe navegación ni consentimiento.
- `validateCareerBinding(binding)`: estructura exacta `{uid, careerInstanceId,
  bindingState}`; resolved exige ID, los otros estados exigen null. La razón
  explicativa opcional del documento futuro queda fuera de este valor mínimo.
- `validateResolvedCareerBinding(binding, planCatalogId, instance)`: valida
  pertenencia e identidad, admite archivada como binding histórico válido.
- `isCareerParticipantOperational(binding, planCatalogId, instance)`: deriva
  operatividad académica individual. Ausencia o discrepancia de UID/ID/catálogo
  da false; no cambia binding ni evalúa a los demás participantes. No sustituye
  autorización por membresía, cierre del plan, amistad o sharing.

Errores: `Error` con `code` estable y texto de desarrollo, sin copy de UI.
Códigos: INVALID_ID, INVALID_CAREER_INSTANCE, IMMUTABLE_CAREER_IDENTITY,
INVALID_CAREER_COLLECTION, CAREER_OWNER_MISMATCH, DUPLICATE_CATALOG_INSTANCE,
DUPLICATE_CAREER_INSTANCE_ID e INVALID_BINDING. Estructura corrupta arroja error;
ausencia/incompatibilidad esperadas se representan con null/false según la API.
Los IDs deben ser strings no vacíos, sin espacios, barras ni controles; el
dominio no prueba pertenencia a un catálogo real ni impone un generador concreto.

La unicidad de esta etapa solo valida la colección entregada. **No garantiza
unicidad persistente ni concurrencia**: índice + Rules pertenecen a Etapa 2.
JavaScript no ofrece tipos nominales aquí: campos y validadores distinguen los
roles; un string arbitrario por sí solo no acredita identidad o autorización.
Tests: `node --test tests/career-instances.test.cjs`, también incluidos en `npm test`.

## 13. Etapa 2: persistencia de metadata aislada

Implementación local desconectada de App: `src/services/careerInstances.js` y
`src/careerInstancePersistenceLogic.js`. La fábrica recibe `{db, auth}` y uid;
no importa `src/firebase.js`, no inicializa Firebase y no existe un consumidor
productivo de estas rutas. No migración, cutover ni cambio de fuente autoritativa.

### Schema efectivamente implementado en esta etapa

- `users/{uid}/careerInstances/{id}`: exactamente schemaVersion=1, catalogId,
  lifecycle, createdAt, updatedAt, archivedAt.
- `users/{uid}/catalogMemberships/{catalogId}`: exactamente schemaVersion=1,
  careerInstanceId.
- UID/ID son implícitos por path; no se persisten campos duplicados de identidad.
- IDs de instancia/catálogo: `[A-Za-z0-9_-]{1,100}`, distintos entre sí. Esto es
  validación estructural, **no un registro de catálogos permitidos**. Un cliente
  futuro deberá validar catálogo real; esta etapa no importa el registry ni
  prueba matrícula real. No se modifica la gramática más general del dominio puro.
- Auto-ID opaco generado por `doc(collection(...))`, antes de la transacción y
  sin escritura independiente. Rules no puede demostrar entropía: comprueba
  estructura/coherencia; la generación opaca es responsabilidad del repositorio.
- No campo sharing todavía, conforme al alcance explícito de Etapa 2. No se
  guarda progreso/proyección/snapshot ni se habilita lectura/escritura de sus
  futuros subpaths. La sección 3 sigue siendo el objetivo completo posterior.

El propietario autenticado puede leer/listar instancias e índices propios.
Terceros y anónimos no leen ni mutan ninguno, aun con amistad. La futura lectura
social mínima se construirá sobre get exacto del índice en Etapa 6, comprobando
metadata privada desde Rules; nunca requiere entregar la instancia completa.

### API y resultados

`careerInstancesRepository({db, auth}, uid)` captura la sesión concreta. Métodos:

| Método | Resultado |
|---|---|
| `create(catalogId)` | ID confirmado de nueva instancia; duplicado arroja error |
| `get(instanceId)` | `{instance, metadata}` o null si no existe |
| `list()` | Array validado de envelopes propios; no omite documentos corruptos |
| `getByCatalog(catalogId)` | Envelope o null si no existe índice; índice huérfano/incoherente es error |
| `archiveMetadata(instanceId)` | ID confirmado; no-op si ya archivada |
| `restoreMetadata(instanceId)` | ID confirmado; no-op si ya activa |

`instance` es el valor mínimo del dominio puro y `metadata` el DTO validado con
timestamps. No se expone CRUD genérico ni delete. Las lecturas directas/listados
son desde servidor; el lookup del índice/par usa transacción para coherencia.
Archive/restore comprueban índice y preservan createdAt/catalogId/ID. Los no-op
no cambian fechas. No tocan cuenta/selección, sharing, planes ni hijos académicos:
**NO son la operación productiva completa de archivado/restauración**.

### Transacción, concurrencia e invariantes

Alta usa transacción en vez de batch para leer la reserva y devolver un duplicado
controlado. Rules exige simetría y ausencia previa de la contraparte:
instancia nueva ↔ membership nuevo. No permite anexar unilateralmente un índice
a un huérfano antiguo. Catálogo, createdAt y asociación del índice son inmutables;
ninguno de los dos documentos puede borrarse desde cliente.

Dos altas simultáneas: exactamente una crea el par; la perdedora arroja
`DUPLICATE_CATALOG_INSTANCE`. Emulator mostró que Rules puede observar el ganador
antes del retry del SDK y denegar al perdedor. Por eso el repositorio, solo ante
permission-denied, relee el par en una transacción **sin escrituras**: solo
reclasifica como duplicado si demuestra otra instancia coherente. En caso contrario
conserva la denegación; nunca informa éxito ni reintenta una escritura sin índice.

Errores estables: INVALID_INPUT, DUPLICATE_CATALOG_INSTANCE,
CAREER_INSTANCE_NOT_FOUND (mutación de ausente), INVALID_CAREER_DOCUMENT,
CAREER_SESSION_CHANGED, PERMISSION_DENIED, PERSISTENCE_CONFLICT,
PERSISTENCE_UNAVAILABLE y PERSISTENCE_FAILED. No expone mensajes/rutas/tokens del
SDK. Sesión cambiada antes/después de una operación invalida su resultado; no es
una garantía de cancelar una escritura que el servidor ya aceptó.

### Rules y presupuesto de accesos

Se agregan únicamente los matches nuevos y el helper `instanceKey` bajo users.
Las condiciones legacy, incluidos activeCareerId y gate de Activity, no cambian.

| Operación | Accesos de Rules a otros documentos (sin asumir caché) |
|---|---|
| Alta de instancia | 2: exists(index) previo + getAfter(index) |
| Alta de membership | 2: exists(instance) previo + getAfter(instance) |
| Alta atómica completa | 4 en total; 2 por escritura |
| Archive/restore efectivo | 1: get(index); transición exacta y request.time |
| No-op lifecycle | 0 validaciones de escritura; repositorio lee instancia + índice |
| Get/list propio | 0; autorización por UID autenticado y path |

`exists` observa ausencia antes de la escritura y `getAfter` el par resultante
antes de commit. Archive/restore usa `get`: el índice es inmutable y no se modifica
en la operación. Estas cifras son conteo del código, no telemetría de facturación;
las lecturas de transacción del SDK son adicionales y los retries pueden repetirlas.
Queda holgura frente a los límites de 10 por operación y 20 por transacción.

### Pruebas y frontera de seguridad

- Unit: DTOs, timestamps, errores sanitizados, sesión e inputs; reconciliación
  read-only con ganador coherente, huérfano, otro catálogo o documento corrupto.
- Emulator Rules: owner/foreign/anonymous; schemas exactos, omisión de campos,
  timestamps falsos, orphans en ambos sentidos, pares cross-user, doble instancia,
  hijacking, catálogo/createdAt inmutables, archive/restore y deny de subpaths.
- Ataques delete/recreate y archive + alta duplicada denegados; incluso borrar
  el documento padre users no borra la reserva del catálogo. Restore sigue válido
  después de intentar duplicar. Navegación null/legacy/futura no altera permisos.
- Integración con SDK/repositorio real: ciclo completo, idempotencia, concurrencia,
  aislamiento entre propietarios/catálogos, denegación sin escritura parcial,
  índice huérfano y preservación de hijos/datos legacy durante lifecycle metadata.
- `node scripts/test-rules.cjs --career-only` usa el mismo aislamiento demo/loopback
  del runner. `npm.cmd run test:rules` incluye históricas, Activity, rollout/recovery
  y multicarrera. No se ejecutan herramientas de publicación ni migración.

Los artefactos ignorados `.tools/activity-rollout/*` pueden quedar desactualizados
al cambiar Rules fuente; no se regeneran ni publican en esta etapa. La suite de
rollout prueba las variantes en memoria. El review futuro debe regenerar/revisar
artefactos antes de cualquier publicación autorizada.
