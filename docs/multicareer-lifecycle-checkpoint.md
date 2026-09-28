# v1.16.0 — Etapa 5: Lifecycle / Mis carreras

Base: `8939ce7`, main limpio y hash verificado contra origin/main antes de editar.
Implementación exclusivamente local, sin publicación, migración real o Etapa 6.
Reutiliza Etapas 0–4; no reemplaza DTOs, dominio, identidad, bridge o motor.

## Protected new-account bootstrap — BLOCKED / RELEASE BLOCKER

Bootstrap de cuenta realmente nueva está **PENDIENTE/BLOQUEADO POR DISEÑO**.
Legacy admite documentos académicos sin padre y IDs históricos/desconocidos.
Rules puede comprobar rutas concretas, no enumerar exhaustivamente esa historia.
La ausencia de migrationUsers, users, catálogos conocidos, perfiles o snapshots
no certifica origen nuevo. Tampoco datos del cliente, auth_time o heurísticas.
No se relaja la inmutabilidad administrativa del control ni se alteran permisos
legacy para producir una falsa prueba.

Falta elegir/diseñar una fuente confiable de certificación de origen y su protocolo
de verificación. No se diseñó ni implementó esa infraestructura en este alcance.
**NO-GO para release v1.16** hasta resolverlo, aunque lifecycle esté validado.
Una fixture administrativa `origin=new` acredita comportamiento posterior al
control, nunca la seguridad del bootstrap de producción.

## Arquitectura y operaciones

- `careerLifecycleRepository`: fachada de add/select/archive/restore; contexto y
  registro inyectados, sin inicialización Firebase ni API de eliminación.
- `careerInstancesRepository`: reutiliza creación atómica y lectura de índice,
  DTOs y traducción de errores. El modo producto añade lectura transaccional del
  control y perfil schema 2. Exige instances/complete válido antes de escribir.
  Las APIs metadata-only anteriores conservan su contrato aislado; Rules impide
  usarlas para dejar seleccionada una instancia archivada.
- Selección delegada al repositorio existente del bridge. Ninguna operación
  escribe control, manifest, datos legacy, progreso, proyección o Joint Plans.
- Catálogo para agregar: se valida contra el registry real recibido desde el hook,
  no se copia el catálogo ni se crean documentos académicos vacíos/de ejemplo.
  Rules mantiene validación estructural de catalogId de Etapa 2, no certifica
  pertenencia al registry de la versión web. IDs desconocidos históricos se
  preservan y presentan como catálogo no disponible, sin fallback.
- Unicidad: índice por catálogo más ID opaco; archivadas siguen reservando índice.
  Dos adds concurrentes no generan dos identidades. Error duplicate explícito.
- Archivo: metadata conserva ID, catálogo y createdAt; establece archivedAt y
  updatedAt servidor. Si estaba seleccionada, el mismo commit guarda selección
  null. Si no lo estaba, conserva la selección ajena a esa operación.
- Restore: misma identidad, archivedAt=null, datos intactos; nunca autoselecciona.
  Archivo/restauración repetidos sobre el estado deseado son no-op tras validar
  contexto, metadata e índice. No hay physical delete ni reset académico.

## UX e integración

El selector de navegación ofrece acceso a **Mis carreras**, sin agregar otra
pestaña a la navegación académica principal. Con selección nula/zero-career se
muestra también la administración con CTA Agregar carrera. Lista activas y
archivadas; resuelve universidad/nombre/plan del registro, señala selección actual
y deshabilita duplicados incluidos archivados. No muestra IDs ni campos técnicos.
Archivo requiere confirmación explícita y explica conservación de datos.
Controles nativos, labels, fieldset/legend, foco visible, avisos role=status/alert,
acciones con wrap y select limitado al ancho disponible.

Loading/errores/frozen/blocked no ofrecen mutaciones. Legacy conserva su flujo.
No se convierte ausencia de control en cuenta nueva. El servicio valida autoridad
otra vez dentro de cada transacción, incluso si la vista quedó desactualizada.

Bridge listeners actualizan inventario/selección sin logout. Sigue la separación
de fuente por UID/modelo/instancia y la espera de progreso antes de mostrarlo.
Una instancia sin progreso usa mapa vacío, no initialStatus de ejemplo del catálogo.
No se persiste ese mapa como efecto de agregar o navegar. Los estados académicos
existentes no se recalculan. Archivar suspende el controlador de autosave de esa
instancia; conserva su borrador de sesión. Restaurar no dispara autosave ni lo
transfiere a otra instancia. Reintento/edición explícitos y CAS siguen vigentes.

## Rules, concurrencia y presupuesto

Cambios acotados:

1. Selección instances verifica metadata posterior con getAfter.
2. Archivo instances verifica perfil anterior/posterior: seleccionada → null;
   no seleccionada → no puede terminar seleccionada en ese commit.
3. Escritura académica comprueba lifecycle posterior, cerrando batch
   archivo + escritura de progreso/proyección.

No cambian rutas legacy, permisos de bootstrap, social, Activity ni índices.
La lectura de selección en la regla de archivo exige coherencia de navegación;
no concede autorización académica. Se puede archivar/restaurar cualquier instancia
propia, seleccionada o no. Ownership/authority/lifecycle siguen autorizando datos.

Presupuesto conceptual sin asumir caching: create tiene dos escrituras con gates
de control y checks de índice/metadata posterior (hasta 8 accesos sumados).
Archivo seleccionado tiene dos escrituras: metadata (gate de control, validación
de transición, control legacy, perfil antes/después e índice: hasta 6 accesos),
perfil (gates legacy/instances: hasta 2; selección null no consulta otra metadata).
Total aproximado máximo de esa operación: 8 accesos sin contar lecturas del SDK
como llamadas de Rules. No depende del número de carreras de la cuenta.
No se afirman lecturas cobradas ni contadores internos exactos. Se valida con
Emulator, incluyendo fan-out máximo histórico de Activity y ambas amistades.

Select y archive leen los documentos involucrados transaccionalmente. Bajo
contención, Rules puede observar el commit ganador antes del retry del SDK:
la operación perdedora puede devolver error explícito. La UI no finge éxito;
permite revisar/reintentar. Se exige ausencia de estados parciales; no un éxito
incondicional de ambos requests. No hay reemplazo silencioso de selección.

## Sharing y Joint Plans: frontera de Etapa 6

En instances, sharing académico está cerrado desde Etapa 4, tanto antes como
después de archivo/restauración. Los snapshots nuevos siguen default-deny y los
legacy no son legibles por terceros para cuentas migradas. No se borra ni altera
el consentimiento histórico: puede existir enabled=true almacenado pero carece
de autorización efectiva. Restore no lo reactiva. No se añade todavía sharing
embebido, epoch operativo ni sincronización; ese contrato corresponde a Etapa 6.

Archivar no cambia ningún plan, membership, invitación, subject o binding histórico.
No introduce suspensión global por lifecycle. Sigue la suspensión transitoria
por authority aprobada en Etapa 4 para operaciones académico-sociales no migradas.
La inactivación de una sola participación requiere bindings operativos de Etapa 6;
no se pretende que ese comportamiento futuro esté implementado ahora.

## Validación

Node: UI con registry real, cero/una/múltiples carreras y universidades,
duplicados/archivadas, confirmación/cancelación, doble submit, errores, loading,
frozen/invalid/blocked; bridge con lectura demorada, progreso vacío y autosave
archivado. Suites históricas completas conservadas.

Emulator: repositorio real, controles preestablecidos origin legacy/new,
zero-career/add, todos los catálogos, concurrencia, archivo atómico/selección,
restore/idempotencia, preservación exacta, old/stale client, batches maliciosos,
cross-user/anónimo, frontera bootstrap, sharing cerrado y bridge live.
Las fixtures administrativas nunca representan bootstrap exitoso desde cliente.

Comandos locales: `node --test tests/career-lifecycle-ui.test.cjs`,
`node scripts/test-rules.cjs --lifecycle-only`, `npm.cmd test`,
`npm.cmd run test:rules`, `npm.cmd run build`, `git diff --check`, `git status --short`.
Runner aislado: demo-correlativas-rules, 127.0.0.1:8088; no usar en paralelo con
Emulator manual. No se accede a producción ni se acredita infraestructura remota.

## Cierre verificado — 2026-09-28

| Validación final | Resultado |
|---|---|
| UI lifecycle focalizada | 15/15 PASS |
| UI lifecycle + bridge UI + persistence focalizadas | 38/38 PASS |
| Node completo | 693/693 PASS |
| Rules históricas | 148/148 PASS |
| Activity | 43/43 PASS |
| Rollout/recovery | 41/41 PASS |
| careerInstances | 45/45 PASS |
| Migración | 14/14 PASS |
| Bridge/authority | 23/23 PASS |
| Lifecycle/servicios reales/bootstrap cerrado/bridge live | 21/21 PASS |
| Emulator consolidado | 335/335 PASS, 16 suites |
| Build normal | PASS (2753 módulos) |
| git diff --check y whitespace de archivos nuevos | PASS |

Cero fallos, cancelados u omitidos en las ejecuciones finales. Los parciales
Emulator están incluidos en el consolidado. La primera suite focalizada tenía
20 casos y detectó un supuesto excesivo del test de contención (exigía éxito de
archive en vez de error explícito/coherencia/reintento); se corrigió esa expectativa
sin debilitar Rules ni ignorar estados parciales. La suite final agrega bridge live.

Rules SHA256: `d25c2ca2bdc71bb448afd5d39c65dc1cbdff9ffd04dffbf1584c25075cf8f4fc`.
Emulator inició y cerró por el runner aislado. Denegaciones intencionales imprimen
PERMISSION_DENIED; máximos permitidos históricos siguen pasando. Build conserva
la advertencia de chunk superior a 500 kB (principal: 1161.13 kB, gzip 343.28 kB).

Auditoría final: no duplicados de catálogo; sin fallback/selection-as-authorization;
una única fuente de escritura; archivo conserva identidad/datos e impone null si
corresponde; sharing académico no utilizable en archivo/restauración; restaurar
no selecciona ni vuelve a compartir; cliente no puede autodeclararse nuevo ni
reescribir el control; zero-career legítimo funciona. No cambia motor, correlativas,
PPS06, catálogo, dependencias, Firebase config o índices. No hay prueba manual de
navegador en esta etapa; la evidencia UI es de comportamiento mediante harness.

Git: 13 modificados y 6 nuevos, ninguno staged; base sigue 8939ce7.
No hubo producción, Firebase Console, migración real, publicación de Rules,
commit, push o deploy. Etapa 6 no iniciada.

**GO para continuar a Etapa 6**, sujeto a revisión del alcance implementado.
**NO-GO para release v1.16**: bootstrap protegido sigue BLOCKED / RELEASE BLOCKER.
Antes de producción también corresponde revisión manual de UX y plan de rollout
autorizado; el test local no acredita infraestructura ni datos productivos.
