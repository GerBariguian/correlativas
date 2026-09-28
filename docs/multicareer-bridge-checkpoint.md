# v1.16.0 — Etapa 4: bridge y authority cutover

Estado: implementación local para revisión. Base `8147718`. No autoriza
migración real, publicación de Rules/índices ni deploy. Etapa 5 no iniciada.

## 1. Base y checkpoint recuperado

Base confirmada: `8147718`, migrador multicarrera. El inicio original estaba
limpio. La continuación conservó el diff de Rules, resolver, repositorio, hooks,
suspensión de autosave, documentación y 21 tests puros; App aún no estaba
conectada. El checkpoint 41/43 de Activity quedó superado, no descartado.

## 2. Bloqueo de Activity y solución

El padre exige los cuatro avisos: consulta anterior y posterior de cada slot,
además del perfil activo legacy y tombstone. Cada aviso valida el plan fuente
antes/después, actor, destinatario y amistad aceptada. Etapa 4 agrega los
controles de authority del actor y de cada destinatario. Las validaciones de
amistad estaban escritas como `exists(path)` seguido de `get(path)`.

Con amistad inversa hay además una consulta fallida a la orientación directa
por invitado. El servicio real lee ambas orientaciones en su transacción;
la creación sintética con batch no realiza esas lecturas cliente previas.
El Emulator rechazaba el caso inverso y el servicio máximo, con errores de
access call y mensajes de 1000 expresiones; mover el gate del padre a los
avisos obligatorios solamente había recuperado el caso directo.

La solución obtiene cada recurso con `get()` una vez, conserva el resultado
y comprueba `resource == null` o sus datos. Tanto `legacyAuthority` como
`acceptedPlanningFriend` eliminan pares exists/get y accesos repetidos al mismo
recurso. Se comprueban ambas orientaciones explícitamente, sin depender de cuál
existe ni de que sea la primera evaluada. La ausencia del control es legacy;
un control existente inválido nunca lo es. Una amistad ausente no es aceptada.

El padre sigue exigiendo cada aviso nuevo de la misma operación atómica; esos
avisos validan actor y destinatario. No se quitaron condiciones ni se redujo el
máximo; tampoco se añadieron campos redundantes ni se implementaron bindings nuevos.
Las lecturas repetidas pueden cachearse, pero el harness no expone un contador
exacto después de caching: no afirmamos N llamadas cobradas. La evidencia es
ALLOW/DENY de ambas orientaciones, controles ausentes/presentes, servicios
reales, spoofing, replay, omisión y máximos. No habilita ampliar el fan-out.

## 3. Arquitectura

- `userDataAuthorityLogic.js`: único decoder semántico de authority y selección.
- `services/academicBridge.js`: Firebase inyectado, listeners de control/perfil/
  metadata, repositorios privados de progreso y proyección, selección.
- `hooks/useAcademicBridge.js`: contexto por sesión y adaptación a una interfaz
  común `source.load/subscribe/save/projection`. Selecciona una sola rama.
- `App.jsx`: consume capabilities y source; no interpreta migrationUsers.
- Controladores de proyección separados por uid/modelo/id; la fuente no depende
  de la navegación de otra carrera. UI y caché se identifican por scope.

No se inicia Firebase desde el repositorio, no se ejecuta el migrador en App,
no se crean IDs/instancias automáticamente y no se altera configuración Firebase.

## 4. Authority y matriz de datos

Control exacto: schemaVersion 1, generation `multicareer-v1`, authority,
phase, origin legacy/new, manifestId igual a uid, updatedAt timestamp.
Combinaciones: legacy pending/blocked; frozen copying/validated/blocked;
instances complete/blocked. `blocked` siempre suspende edición.

| Control | Fuente runtime | Escrituras académicas | Académico-social |
|---|---|---|---|
| Ausente | Legacy transitorio | Semántica legacy | Semántica legacy |
| legacy/pending | Legacy | Semántica legacy | Semántica legacy |
| frozen/copying o validated | Última fuente coherente en memoria; sin mezcla ni nuevos loaders | Denegadas; timers suspendidos | Suspendido |
| instances/complete | Instancia propia exclusivamente | Activa, schema/revisión/fecha válidos | Suspendido hasta Etapa 6 |
| blocked o inválido | Última vista no editable o error recuperable | Denegadas | Suspendido |

La ausencia total es el único fallback legacy. No identifica una cuenta nueva.
Schema/generation/authority/origin/phase inválidos, errores del listener y
control sólo en caché suspenden capacidades. Un error terminal no puede ser
reabierto por callbacks de perfil; Reintentar crea una suscripción nueva.

Las Rules conservan get privado legacy al dueño como historia; eso no convierte
legacy en fuente del runtime después de instances. No se suman ni mezclan mapas.

## 5. Selección y bootstrap

Instances usa `activeCareerInstanceId`. Ausencia/null, ID inexistente, ajeno,
archivado o inválido resuelven null, incluso con una única instancia disponible.
El selector sólo enumera instancias existentes; no es la futura UI Mis carreras.
Un catálogo no disponible se informa y no se sustituye por otro.

Guardar navegación requiere ownership, authority instances, cuenta schema 2,
ID propio activo o null, cambios exclusivamente de selección/updatedAt y fecha
servidor. Esa validación no autoriza lectura/escritura de ningún otro documento.
Se puede editar una instancia propia activa aunque no esté seleccionada.

Bootstrap protegido de cuentas nuevas sigue pendiente: no se infiere del control
ausente ni se introdujo creación automática de trayectorias desde el navegador.

## 6. Progreso

Legacy conserva `users/{uid}/careers/{catalogId}`, incluido su flujo vigente de
snapshot consentido. Instances usa exclusivamente
`users/{uid}/careerInstances/{id}/academic/progress`: schema 1, statusMap,
revision y updatedAt. Lectura sin recalcular estados; CAS de revisión en
transacción, incremento de uno y timestamp servidor. Un conflicto no sobrescribe.
No cambia PPS06, catálogos ni correlativas.

El contexto de carga incluye el scope; App no expone el mapa de la fuente
anterior con el catálogo nuevo mientras llega la lectura. Respuestas tardías y
sesiones reemplazadas no cambian el progreso visible. No hay dual-write.

## 7. Proyección, freeze y borradores

Legacy mantiene careerProjections v1/v2; instances usa
`careerInstances/{id}/planning/projection`, schema 3, scenario/revisionToken/
updatedAt. El codec de decisiones existente sigue siendo la fuente de validación.
No hay conversión del progreso ni aprobaciones académicas implícitas.

Se conservan debounce de 800 ms, primera creación inmediata, CAS, reset,
conflictos, navegación y una escritura en vuelo. Freeze cancela timers y bloquea
change/reset/retry-save, conservando el scenario. Los callbacks en vuelo revisan
si siguen habilitados; Rules son la barrera final frente a carreras de red.

Al volver a la misma autoridad, un borrador suspendido requiere reintento o
edición explícita. Un controlador legacy queda suspendido después del cutover;
no se copia ni guarda su borrador sobre instances. La UI informa su retención
en la sesión. No se implementa transferencia/reconciliación de borradores entre
modelos ni persistencia offline; cerrar sesión/pestaña puede perder un borrador
que nunca llegó a guardarse, como en la arquitectura anterior.

La UI frozen dice: “Estamos actualizando tu cuenta. Volvé a intentar en unos
instantes.” Retiene la última vista coherente, bloquea interacción académica y
recupera el contexto por listener sin exigir logout. Si no había datos leídos,
no fabrica una vista académica inicial. Activity y la historia siguen accesibles.

## 8. Rules y cliente viejo

- Control propio legible; todo write de control/manifest continúa administrativo.
- Progreso/proyección legacy, selección y eliminación de cuenta no se pueden
  modificar bajo frozen/instances; tampoco el cliente v1.15 con pestaña abierta.
- Metadata/índice no se pueden modificar bajo frozen/control inválido/blocked.
- Hijos nuevos: get privado en instances, sin list/cross-user; escribe sólo el
  propietario con metadata activa e índice coherente. Progreso no se borra;
  reset de proyección sí, sujeto al mismo gate. Archivadas se leen sin editar.
- Sobres estrictos; progreso schema 1 y revisión, proyección schema 3 y token
  nuevo; timestamps servidor. La selección no aparece en esos predicados.
- Sharing/snapshot/perfil académico legacy no aceptan escrituras migradas.
  Snapshot ajeno exige que ambos usuarios sigan siendo legacy además de todos
  los controles anteriores de consentimiento, vigencia y amistad.
- Creación/invitación de plan exige actor/destinatario legacy mediante avisos
  atómicos obligatorios. Mutaciones de planes/subjects se suspenden si dueño o
  algún invitado no tiene authority legacy válida. Así un colaborador no cambia
  la unidad de plan congelada. Esto incluye cierre/salida/retirada temporalmente.
- Get/list históricos de planes conservan ownership/invitación/membership;
  subjects históricos mantienen exactamente su acceso previo. Ningún invitado
  obtiene acceso nuevo a subjects por el bridge.

Esta suspensión por authority es transitoria, no una regla futura de lifecycle
ni la arquitectura de bindings de Etapa 6. Los intents del migrador siguen
siendo referencias sin permisos operativos.

## 9. Excepción legacy y dominios preservados

Los cuatro usos preexistentes de activeCareerId que permanecen son:
publicación de socialProfiles.careerId, snapshot ajeno compartido/vigente,
creación de Joint Plan y aceptación de membresía. Sólo funcionan bajo los gates
legacy correspondientes. La prohibición absoluta aplica al modelo nuevo;
activeCareerInstanceId nunca concede acceso académico. La excepción termina
con Etapa 6 y no se extendió a otras rutas.

Friendship y Activity permanecen user-level: solicitudes, respuestas, inbox,
readAt y navegación histórica no requieren selección académica. El perfil social
migrado se lee sin sincronizar carrera legacy. Un perfil ausente no se fabrica:
queda pendiente del bootstrap protegido.

Para migrated: Mi selección/proyección/progreso propios funcionan sobre su fuente;
comparar avance, compartir progreso y mutar planes quedan suspendidos. Se ofrece
historia read-only de planes existentes, sin consultas a progreso ajeno.

## 10. Migrador, recovery y auditorías

El test de transporte real ejecuta INVENTORY/FREEZE y el resto del migrador con
bridge abierto. Verifica transición live, denegación del cliente viejo antes y
después, copia exacta, nueva fuente, CAS de progreso, proyección/reset, selección
null y reemplazo de sesión. Un cambio administrativo que bypassa freeze sigue
siendo detectado por el migrador. No retrocede authority automáticamente.

Recovery usa las Rules actuales: el generador sólo cambia ACTIVITY_ROLLOUT_GATE,
por lo que conserva las barreras multicarrera. Se prueba maintenance con legacy
write denegado e instancia propia permitida. Restaurar Rules antiguas que quiten
estas barreras no es recovery válido. Los artefactos ignorados en .tools pueden
estar obsoletos: no se regeneraron/publicaron y deben revisarse antes de un rollout
separadamente autorizado.

Auditoría dual-write: source elige exactamente un repositorio. El repositorio de
instancias no contiene writes legacy, snapshot ni sincronización bidireccional;
el codec compartido no implica compartir destinos. El test real confirma que
editar instancia no altera el statusMap legacy ni crea una proyección legacy.

Auditoría autorización: los servicios nuevos comprueban sesión, control,
metadata/lifecycle y revisión, no la carrera elegida. Rules nuevas usan owner,
lifecycle e índice. Se verifica escritura propia con selección null.

Freeze no congela administradores ni toda metadata privada de otros usuarios:
el migrador sigue revalidando su fotografía e intents transaccionalmente. Cambios
concurrentes relevantes producen conflicto, no un cutover con una copia obsoleta.
La coordinación operativa definitiva de planes sigue siendo Etapa 6.

## 11. Tests y alcance de la evidencia

Nuevos: resolver, selección/null/foreign/archived, control corrupto/caché/error,
UI de fuente y suspensión social, retención de borradores, Rules de autoridad,
fan-out con controles presentes y ambas amistades, fail-closed, CAS, aislamiento,
selección, history, recovery y migrador/repositorios reales.

Regresiones adaptadas sin quitar garantías: reset y Planner usan scope en lugar
de catálogo; el harness de Activity ejercita el componente legacy que ahora es
interno; navegación de metadata se siembra administrativamente para no confundirla
con el nuevo permiso de selección; los dos tests históricos de migración ahora
comprueban freeze real y lectura propia después de instances.

Comandos locales:

```powershell
node --test tests/academic-bridge.test.cjs tests/academic-bridge-ui.test.cjs
node scripts/test-rules.cjs --activity-only
node scripts/test-rules.cjs --bridge-only
npm.cmd run test:projection
npm.cmd test
npm.cmd run test:rules
npm.cmd run build
git diff --check
git status --short
```

Los runners sólo usan demo-correlativas-rules y loopback 8088. Los tests Node
usan fixtures/harnesses, no producción. No hubo prueba manual de navegador ni
se presume que Emulator acredite índices/permisos operativos remotos.

## 12. Deuda deliberada y diferencias

No se implementaron bootstrap/Mis carreras (Etapa 5), sharing/compatibilidad/
bindings (Etapa 6), PPS06, sincronización permanente, limpieza de legacy ni
migración productiva. La única delimitación contractual agregada es la excepción
legacy aprobada y la suspensión temporal correspondiente. El freeze de Etapa 3
sigue siendo evidencia histórica; este diff añade enforcement local comprobable,
no enforcement ya desplegado.

Antes de producción: revisión de diff y UX local, plan de rollout coordinado,
artefactos actuales, prueba operativa/piloto autorizados y tratamiento explícito
de borradores no guardados. GO para revisión de Etapa 5 no significa GO productivo.

## 13. Cierre verificado — 2026-09-28

Se retomó el working tree contra `8147718` sin revertir ni rehacer cambios.
La última pasada reforzó el test de App con lecturas demoradas tanto en
legacy → instances como entre dos instancias del mismo catálogo: mientras la
nueva lectura está pendiente no se muestra Dashboard ni Materias de la fuente
anterior. No requirió cambios adicionales de código productivo.

Validación repetida sobre el estado final:

| Validación | Resultado |
|---|---|
| Bridge UI específico | 4/4 PASS |
| Node completo (incluye dominio, UI, persistencia y regresiones) | 677/677 PASS |
| Emulator consolidado | 314/314 PASS, 16 suites |
| Rules históricas / Activity / rollout | 148 / 43 / 41 PASS |
| Rules careerInstances / migración / bridge | 45 / 14 / 23 PASS |
| Build normal | PASS; advertencia existente de chunk mayor a 500 kB |
| git diff --check | PASS |
| Whitespace de los 10 archivos nuevos | PASS |

Node y Emulator: cero fallos, cancelados, omitidos o pendientes. El runner
aislado usó `demo-correlativas-rules`, `127.0.0.1:8088` y cerró Emulator al
terminar. SHA256 de Rules:
`de8f897a6fdd05493eaa6a25e45e8f58c77dc0276ecef09d338014d751e66d83`.
Las denegaciones intencionales generan mensajes PERMISSION_DENIED; algunos
incluyen límites de evaluación. Los casos permitidos máximos y ambas
orientaciones de amistad pasan, sin afirmar un margen numérico no medido.

Auditorías cerradas: una única fuente de escritura; selección sin autorización
en el modelo nuevo; cuatro referencias de autorización preexistentes a
activeCareerId limitadas a legacy; cambio de fuente sin reutilizar progreso ni
borradores sobre otro destino. No se borró legacy ni se amplió consentimiento.

Estado Git esperado: 18 archivos modificados y 10 nuevos, ninguno staged.
No hay cambios de dependencias, catálogos, motor académico, configuración
Firebase ni índices. No se accedió a producción, publicó Rules, hizo commit,
push o deploy. No se inició Etapa 5.

Dictamen: **GO para Etapa 5 después de revisión/aprobación**. No constituye
aprobación de rollout productivo ni reemplaza una validación manual de UX.
