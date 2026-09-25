# v1.16 — Etapa 3: migrador local

Base: `534e81f`. Implementación administrativa para fixtures y Firestore Emulator.
No está conectada a App, servicios productivos, Auth, UI ni bootstrap de cuentas.
No autoriza una migración real. Contrato base: [multicarrera](multicareer-v1.16-contracts.md).

## Frontera de seguridad

**FREEZE es un checkpoint administrativo local, no enforcement productivo.**
Las Rules legacy siguen permitiendo sus operaciones actuales, incluso si un
administrador local cambia authority. El test de integración demuestra una
escritura legacy permitida bajo frozen y su detección posterior por el migrador.
No se presenta el hash como sustituto del bloqueo de escritores concurrentes.

El bridge/rollout futuro deberá bloquear escrituras de progreso, proyección,
selección legacy, consentimiento y snapshots durante frozen y después de
instances; coordinar además los planes, subjects y bindings por unidad de plan.
Congelar un UID no congela a sus colaboradores. La participación archivada se
evalúa individualmente; nunca suspende por sí misma a todo el plan.

El único transporte entregado admite exactamente `127.0.0.1:8088`, proyecto
`demo-correlativas-rules`, base `(default)` y FIRESTORE_EMULATOR_HOST coincidente.
Rechaza proyectos/hosts alternativos, variables de proyecto contradictorias,
GOOGLE_APPLICATION_CREDENTIALS y FIREBASE_TOKEN. No carga .env, ADC, configuración
Firebase, aliases, tokens ni inicializadores de la app. No agrega dependencias.
HTTP tiene origen fijo, timeout y `redirect: error`; no hay fallback remoto.
`Bearer owner` es el identificador administrativo sintético del Emulator,
no una credencial real. Este bypass local de Rules es intencional: el operador
debe cumplir invariantes aunque los clientes no puedan escribir esos paths.

La API inyectable del núcleo es para código confiable: una implementación
arbitraria de adapter puede hacer cualquier cosa. Las barreras se garantizan
en el adaptador suministrado, no frente a modificaciones maliciosas del programa
ni a un proceso local que suplante/proxifique deliberadamente el puerto.
No existe CLI con flag de producción, ni adaptador remoto, ni barrido masivo.

## Módulos y API

- `scripts/multicareer-migration.cjs`: inventory, validadores y protocolo.
- `scripts/multicareer-emulator.cjs`: transacciones REST exclusivamente locales.
- `tests/migration-fixtures.cjs`: almacenamiento de fixtures con CAS y reloj fijo.

`migrator(adapter, {catalogIds, newId?})` recibe IDs explícitos del registro
aprobado; su hash se guarda y un cambio durante reanudación bloquea. El test de
compatibilidad entrega los ocho IDs del registro real. `newId` es inyección
de test; por defecto usa `crypto.randomUUID()`, independiente del catálogo.

`step(uid, phase, {dryRun?})` ejecuta un checkpoint. `run(uid)` recorre el
protocolo y retorna al primer bloqueo. COPY procesa como máximo un catálogo
por llamada; run repite ese paso hasta terminar. No hay batches multiusuario.
El dry-run evalúa un paso contra el estado persistido, sin guardar nada; no es
una simulación completa de fases futuras sin sus precondiciones.
Salida acotada: uid, phase, authority, checkpoints, conflicts y dryRun. Nunca
devuelve statusMap, escenario, nombres, emails ni contenido de subjects.

Los validadores DTO existentes se cargan desde módulos locales confiables sin
React/Firebase; no se duplican reglas académicas. La carga CJS sigue el patrón
de los harnesses actuales. No evalúa archivos suministrados por usuarios.

## Documentos administrativos

`migrationUsers/{uid}`, campos:

```text
schemaVersion: 1
generation: "multicareer-v1"
authority: "legacy" | "frozen" | "instances"
phase: "pending" | "copying" | "validated" | "complete" | "blocked"
origin: "legacy" | "new"
manifestId: uid
updatedAt: timestamp
```

El migrador crea únicamente origin=legacy, también con cero carreras o perfil
ausente. No infiere new de ausencia de datos. El valor new está reconocido por
el contrato, pero su alta requiere el bootstrap protegido de otra etapa.

`migrationManifests/{uid}` (una generación activa por UID), campos:

```text
schemaVersion: 1
generation: "multicareer-v1"
uid: string
origin: "legacy" | "new"
inventory: [{catalogId, known, strong, evidence, action, conflict}]
  evidence: [{kind, path, strength: "strong"|"weak", hash: sha256}]
  action: "resolve" | "review" | "preserve-reference"
  conflict: null | "UNKNOWN_CATALOG_REQUIRES_REVIEW"
catalogRegistryHash: sha256
initialSourceHash: sha256
frozenSourceHash: sha256 | null
assignments: map<catalogId, {instanceId, metadata}>
  metadata: schema exacto de instancia de Etapa 2
copied: catalogId[]
unresolved: filas de inventory débiles o desconocidas
conflicts: códigos estables[]
validation: null | {ok:true, sourceHash, assignmentsHash, errors:[]}
                 | {ok:false, errors:string[]}
intents: null | {selection, sharing, plans}
checkpoints: map<INVENTORY|FREEZE|REREAD|COPY|VALIDATE|CUTOVER, timestamp>
createdAt: timestamp
updatedAt: timestamp
```

Intents exactos:

```text
selection: careerInstanceId | null
sharing: {catalogId: string|null, careerInstanceId: string|null,
          enabled:false, eligibleToImport:boolean, consentVersion:1|2|null}
plans: [{path, sourceHash, catalogId:string|null,
         subjects:[{path, hash}],
         bindings:[{uid, careerInstanceId:string|null,
                    bindingState:"resolved"|"unresolved"|"catalog-unavailable"}]}]
```

No se persiste un booleano operativo de participantes como autorización.
El manifiesto guarda referencias, huellas, identidad y metadata; no copia
statusMap, escenario, nombres/emails ni el payload de los planes/subjects.
El inventario posterior reemplaza el inicial; se conserva la huella inicial
para evidenciar diferencias, además de los checkpoints y la huella congelada.

## Transiciones, errores y reanudación

| Paso | Precondición | Estado/efecto confirmado atómicamente |
|---|---|---|
| INVENTORY | Sin control/manifiesto, o rerun coherente | legacy/pending; evidencia, huella, sin IDs nuevos todavía |
| FREEZE | legacy/pending | frozen/copying; checkpoint, sin gate productivo |
| REREAD | frozen/copying con FREEZE | Relectura completa, nueva evidencia, reservas de IDs y huella estable |
| COPY | REREAD confirmado y fuente sin cambios | Un par instancia/índice y sus hijos + checkpoint de catálogo |
| VALIDATE | COPY completo, fuente/identidad/copia/intents coherentes | frozen/validated, hashes de validación |
| CUTOVER | frozen/validated y validación repetida en transacción | instances/complete + selección de cuenta; solo local |

Combinaciones legales: legacy/pending, frozen/copying, frozen/validated,
instances/complete; blocked conserva la autoridad alcanzada. Phase no equivale
a authority. Se comprueba coherencia de checkpoints y de identidad/manifiesto.
Un bloqueo no retrocede a legacy ni vuelve a ejecutar COPY automáticamente.

Errores de dominio: INVALID_INPUT, INVALID_MIGRATION_TRANSITION,
MANIFEST_INSTANCE_CONFLICT, MEMBERSHIP_INSTANCE_CONFLICT,
LEGACY_SOURCE_CONFLICT, UNKNOWN_CATALOG_REQUIRES_REVIEW, VALIDATION_FAILED.
Se persisten como blocked sin confirmar escrituras de dominio del paso fallido.
Control/manifiesto incompletos o errores de transporte pueden impedir guardar
el diagnóstico; arrojan error y **no** se presentan como éxito/ausencia.
No hay resolución automática de conflictos ni comando de desbloqueo: requieren
revisión humana de la evidencia, conservando el estado para inspección.

El adaptador usa beginTransaction → lecturas → commit; rollback ante fallo.
Conflicto concurrente retorna error explícito (MIGRATION_CONCURRENT_CONFLICT o
error de transporte), no last-write-wins de IDs. Se puede volver a invocar el
mismo paso/run. Un commit de resultado incierto se resuelve releyendo checkpoints.
No se hace retry automático opaco ni reasignación de identidad.

El instante administrativo proviene del readTime del Emulator. Las nuevas
fechas de metadata son fechas técnicas de reserva, no inicio histórico de carrera.
Fechas académicas y revisionToken originales se conservan. Firestore almacena
timestamp con precisión de microsegundos: se compara con la fuente almacenada,
no con nanosegundos descartados al sembrar un fixture.

## Inventario y copia

El adaptador lee documentos raíz exactos del UID; enumera sus careers,
careerProjections, snapshots, instancias/índices e hijos destino, incluso sin
documento users padre. Consulta planes por ownerId, memberIds e inviteeIds;
deduplica coincidencias y lee sus subjects. Para participantes relacionados
lee solo metadata/índices, no progreso ni proyecciones ajenas. No enumera Auth.
Todas esas lecturas pertenecen a la transacción del paso. El tope local de
5.000 documentos aborta, nunca trunca y declara completitud. Payloads/tipos
Firestore no soportados abortan sin convertirlos ni descartarlos.

Strong: documento privado de progreso/proyección, selección válida del registro,
consentimiento propio validado. Weak: snapshot, perfil público, ownership,
membresía/invitación. ActiveCareerId desconocido no crea instancia ni fallback.
Un catálogo desconocido con datos privados queda referenciado y bloquea; weak
desconocido queda preservado y, en planes, catalog-unavailable. No equivalencias.

Consentimiento importable exige enabled=true, catálogo conocido, progreso propio,
snapshot de versión compatible y sourceUpdatedAt coincidente, timestamps y
arrays de códigos válidos/disjuntos. Se conserva v1/v2. Un snapshot ausente,
stale o inconsistente deja eligibleToImport=false; esto es deliberadamente
conservador, no una inferencia de nueva autorización. Además exige instancia
activa y resoluble. **enabled siempre false en el intent**: no se escribe
sharing en instancia ni snapshot nuevo. En Etapa 6 será necesaria revalidación
y vigencia antes de cualquier activación; el intent no es un permiso reutilizable.

Identidad: reutilizar par índice/instancia coherente, incluso archivado; ante
índice huérfano, duplicado, otro catálogo o contradicción con manifest, bloquear.
Si falta el par, reservar UUID una vez en REREAD. COPY no sobrescribe destinos
diferentes: valida igualdad o crea. No restaura instancias archivadas.

Destinos físicos bajo `users/{uid}/careerInstances/{id}`:

- Metadata exacta de Etapa 2, sin sharing.
- `academic/progress`: schemaVersion=1, statusMap exacto, revision=1 inicial,
  updatedAt original. La revisión inicia una secuencia nueva; no inventa un
  contador histórico ni cambia en reruns. Se validan estados, no correlativas
  ni pertenencia académica de cada código. No se degrada ningún estado.
- `planning/projection`: schemaVersion=3, revisionToken, scenario y updatedAt
  originales. Se validan v1/v2 con el decoder existente; el sobre cambia, los
  finalEvents/decisiones no se recalculan ni se mezclan con progreso.
- Índice `users/{uid}/catalogMemberships/{catalogId}` exacto de Etapa 2.

Sin progreso/proyección no se crea un hijo vacío. CUTOVER agrega schemaVersion=2
y activeCareerInstanceId a users, preserva los demás campos e identifica la
actualización de cuenta con nueva fecha. Selección exclusivamente desde el
activeCareerId válido y su instancia activa; en los demás casos null.
El transporte aplica un updateMask de esos tres campos de cuenta para conservar
también la codificación Firestore original de cualquier campo legacy adicional.
Una fecha de progreso/proyección guardada como map en vez de timestamp se rechaza;
no se convierte silenciosamente en una fecha válida.

Los bindings de planes son intents versionados por el manifiesto y huella de
fuente: no se escribe el plan real ni bindings de otras personas. Solo resuelven
pares demostrables; invitado/miembro sin instancia permanece unresolved. Un
archivado conserva binding histórico. Antes de aplicar físicamente estos
intents hará falta la unidad de migración/freeze por plan de Etapa 6.

Rerun completo verifica identidad y nunca recopia datos académicos desde legacy
después de authority=instances: preserva ediciones posteriores del destino.
Con datos sin cambios M(M(data))=M(data), incluidas fechas, IDs y selección.

## Auditoría de retención y permisos

| Categoría | Después de migrar localmente |
|---|---|
| Progress/statusMap | Copia exacta al hijo académico y fuente legacy intacta |
| Projection | Nuevo sobre privado, mismo escenario/token/fecha; legacy intacto |
| Selección | activeCareerId retenido; nuevo ID exacto o null |
| Sharing | Documento legacy intacto; intent exacto, ninguna activación nueva |
| Snapshots | Legacy intacto y referencia/huella en inventory; no se declara vigencia futura |
| Perfil social | Legacy intacto, evidencia débil; no lista pública de carreras |
| Friendships/socialEmails | Sin lectura ni escritura del migrador; permanecen legacy |
| Joint Plans/subjects | Legacy intacto; referencias/huellas y bindings propuestos |
| Activity | Inbox user-scoped intacto, sin lectura, duplicación ni avisos nuevos |
| Unknown catalogs | Referencia literal conservada; strong bloquea, weak no fabrica carrera |
| Campos legacy adicionales | Permanecen en documentos fuente, no se borran por ausencia de target |

Rules: solo se agregan matches administrativos. Control: get propio permitido,
list/lecturas ajenas y toda mutación de cliente denegados. Manifest: toda lectura
y escritura de cliente denegada. No se cambian los permisos legacy ni de Etapa 2.
Los hijos académicos nuevos continúan default-deny incluso para propietario;
el futuro bridge debe implementar su contrato antes de usarlos. Weak references,
selección e intents no aparecen como condiciones de autorización nuevas.

## Rollout/recovery y límites

El generador y la matriz v1.15 prueban mantenimiento social y atomicidad Activity,
no autoridad multicarrera. Se ejecutan como regresión pero **no habilitan este
cutover en producción**. No regenerar/publicar artefactos .tools antiguos por
esta etapa. Una futura recovery debe retener controles/manifiestos y gates de
authority; no restaurar Rules legacy que reabran escrituras o sharing después
de instances ni confundir maintenance de Activity con freeze académico.
`legacyWritesAllowed` es un modelo de test de esa frontera, no un gate desplegado.

Pendiente: enforcement y matriz old/bridge/new × authority; freeze coordinado de
planes; bootstrap new; sharing físico/epoch/snapshot; permisos operativos reales,
cuotas, piloto y límites de tamaño. Un manifiesto puede alcanzar el límite de
documento Firestore con un usuario grande; se aborta, no se implementa paginado
de manifiestos sin otro contrato. No hay prueba ni inventario de datos reales.

Decisiones de implementación a revisar: revisión inicial=1; UUID opaco reservado
en REREAD; manifest por UID/generación; validación conservadora del consentimiento;
transporte REST local en lugar de instalar Admin SDK. Ninguna habilita runtime
productivo ni altera los targets académicos congelados.

## Verificación local

```powershell
node --test tests/migration.test.cjs
node scripts/test-rules.cjs --migration-only
npm.cmd test
npm.cmd run test:rules
npm.cmd run build
git diff --check
git status --short
```

El runner aislado inicia y cierra únicamente Firestore Emulator demo en 8088.
No ejecutarlo mientras ese puerto esté ocupado por un Emulator manual.
Los tests usan UIDs sintéticos; no copiar datos ni credenciales productivas.
Las fixtures en memoria no requieren red. La suite Emulator prueba REST real,
reanudación con otro runner, concurrencia, denegaciones, conflictos y atomicidad.
Este módulo se utiliza desde harness administrativo local; no se ofrece comando
para operar usuarios reales. Los comandos anteriores son verificación, no deploy.

## Evidencia de cierre local

- Unit/inventory/idempotencia/conflictos: 60/60.
- Node completo: 646/646 (586 existentes + 60 nuevos).
- Emulator consolidado: 291/291, 16 suites, cero cancelaciones en la corrida final.
  Incluye 148 históricas, 43 Activity, 41 rollout/recovery, 45 de Etapa 2
  (Rules + repositorio real) y 14 de migración/aislamiento administrativo.
- Build normal aprobado; conserva el warning de bundle mayor a 500 kB.
- Diff y whitespace de archivos nuevos revisados; no hubo git add/commit/push.

Se corrigieron dos supuestos del harness inicial: el wrapper de Rules deshabilitadas
no devuelve el resultado del callback; los timestamps sembrados se comparan con
la fuente almacenada, no con precisión descartada por Firestore. Contención real
puede abortar ambos intentos REST (ABORTED/lock timeout); el test exige error
explícito y reanudación posterior, no un ganador garantizado sin retries.
Hubo corridas intermedias canceladas por pausas/timeouts prolongados; no se
contabilizaron como aprobación ni se ampliaron los timeouts. El consolidado
final terminó normalmente, con seguimiento continuo y cierre del Emulator.

Dictamen para revisión: GO para desarrollar Etapa 4 una vez aprobada esta etapa;
NO-GO para migración/cutover productivo hasta implementar y probar los gates,
recovery, bootstrap y coordinación pendientes. No se avanzó al cliente puente.
