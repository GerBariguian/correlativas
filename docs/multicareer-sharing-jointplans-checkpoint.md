# v1.16.0 — Etapa 6: checkpoint de bloqueo de presupuesto

## Fase posterior: diagnóstico UPDATE/JOIN completado, integración pendiente de revisión

Ver [diagnóstico focalizado](multicareer-join-retry-diagnostic.md). Rules y servicios
productivos no cambiaron durante esa fase. JOIN fresco pasa con 1–4 miembros
previos. Stale permanece rechazado; permission-denied no dispara retry SDK. La
fixture que aísla JOIN elimina el mensaje de expressions, no el rechazo stale.
El servicio real todavía es legacy y no resuelve bindings v2; se distinguió de
los builders v2 de tests. Calibraciones: JOIN +8 lookups permite, +9 deniega;
10/11 y 20/21 independientes conservados. Suite diagnóstica final: **57/57 PASS**.
No se implementó retry manual ni se modificó la expectativa del test concurrente
anterior. Resultado principal 1; resultado 5 ante pérdida legítima de elegibilidad.
Hay GO técnico para proponer la integración descrita, sujeto a aprobación; no GO
de Etapa 6/Etapa 7 ni de release. Bootstrap continúa RELEASE BLOCKER.

## Estado actual — 2026-09-29: STOP en auditoría de JOIN; Etapa 6 incompleta

Base conservada: `96de41a`. No hubo reset, commit, deploy ni acceso productivo.
El contenido histórico que sigue se conserva como evidencia; el STOP anterior
de CREATE fue superado por E. No describe el bloqueo actual.

### Estado recuperado

CREATE E ya está integrado en `firestore.rules`: el padre prueba el schema,
owner/binding y conjunto exacto de participantes; cada notice obligatorio prueba
el binding pending de su UID. El enlace atómico exige todos los notices nuevos
en sus rutas canónicas. La ejecución anterior reportó 138/138 (incluye calibración).
Ese resultado es histórico, no una nueva ejecución sobre este checkpoint.

**Cualquier modificación futura de create v2 o JOINT_PLAN_INVITATION debe revisar
conjuntamente ambas Rules: la seguridad depende de su composición atómica.**

La copia `tests/rules/fixtures/joint-create-pre-distribution.rules` preserva el
diagnóstico anterior a E. Subjects/subjectChecks conservan su protocolo aprobado.
Invite/join tiene permisos iniciales y pruebas positivas, pero no está cerrado.
Sharing tiene Rules parciales de consentimiento/snapshot/compatibilidad y
adaptación inicial del decoder y archive del repositorio. Faltan integración de
servicios/UI, cobertura adversarial/concurrente completa y migración de intents.
Los gates de UI no se retiraron. Bootstrap protegido sigue RELEASE BLOCKER.

### Nuevo resultado reproducido con Rules reales

SHA256 de `firestore.rules`:
`7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.

Runner `--social-invite-real-only`: **30 tests, 28 PASS, 2 FAIL** en dos
ejecuciones. Incluye 29 subtests y su contenedor: fallan el caso concurrente y
el contenedor. Los 13 casos positivos secuenciales y los 15 rechazos pasan.
No son 28 operaciones válidas aprobadas: 15 son denegaciones esperadas.

Emulator emite en UPDATE (líneas 682/684/714 de este hash):
`Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached`.
También muestra `false` en la evaluación de las ramas. No entrega contador ni
margen exacto. No se observó aquí evidencia de once access calls; no confundir
el límite de expresiones con ese presupuesto.

La prueba concurrente registra:

- `one` y `two` leen ambos `memberIds: [owner]`.
- `two` confirma; `one` recibe `permission-denied`, sin segundo callback de tx.
- Persistido: `memberIds: [owner, two]`; binding `two` resolved/i_two y `one`
  unresolved/null. La comprobación de coherencia member/binding pasa: no quedó
  una mitad del JOIN rechazada persistida.
- El test no acepta esa falta de finalización como éxito ni se cambió para que
  quede verde. Conserva el fallo y el diagnóstico.

El payload perdedor intenta reemplazar un conjunto leído antes del otro commit.
La regla que exige conservar los miembros actuales debe rechazar esa escritura.
**No está demostrado que el agotamiento sea la causa única del rechazo**: hay
una transición obsoleta concurrente y no hubo retry automático del SDK. Por
separado, sí se observó expression exhaustion en las rutas rechazadas. Los JOIN
secuenciales válidos, incluso con cuatro invitados, siguen pasando.

Conforme a la condición explícita de STOP, no se optimizaron Rules, no se redujo
seguridad y no se eligió un protocolo de recovery alternativo. Se requiere
revisión del diagnóstico antes de continuar. No se declara Etapa 6 finalizada
ni se reutilizan resultados históricos como validación global actual.

### Entorno del runner

Java falló inicialmente antes de ejecutar tests con `Unable to establish loopback
connection` / `UnixDomainSockets.connect0: Invalid argument`. Cambiar el selector
no lo resolvió. Para estas dos ejecuciones se usó sólo en el proceso:

```powershell
$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=C:\Users\Bariguian\Downloads\GB\PROYECTOS\correlativas\.tools\java-tcp-only-no-socket-directory'
node scripts/test-rules.cjs --social-invite-real-only
```

Ese directorio no existe: el bind Unix falla y Java utiliza su fallback TCP
local. No se creó el directorio ni se persistió la variable/configuración.
El runner mantuvo proyecto demo, loopback y guards; Emulator cerró limpiamente.
Esto es una incidencia del entorno de pruebas, distinta del STOP de Rules.

**NO-GO Etapa 7. NO-GO release v1.16.**

### Verificaciones de esta reanudación, posteriores al test diagnóstico

- `npm.cmd test`: **693/693 PASS**.
- `npm.cmd run build`: **PASS**, advertencia de bundle superior a 500 kB.
- `git diff --check`: **PASS** (avisos LF/CRLF de Git no son errores de whitespace).
- Whitespace de los **19 archivos nuevos**: **PASS**.
- Working tree: **6 tracked modificados y 19 nuevos**, preservados sin staging.
- No se ejecutó el Emulator consolidado de cierre porque Etapa 6 permanece en
  STOP. Tampoco se presenta create 138/138 o subjects 70/70 históricos como una
  nueva regresión ejecutada sobre este hash. La única suite Rules nueva de esta
  reanudación fue invite/join, con el resultado fallido detallado arriba.
- Cambios de esta reanudación: ampliación de `tests/rules/joint-invite-real.test.cjs`
  y este checkpoint. No se modificaron las Rules para evitar el fallo.

## Evidencia histórica: subjects y STOP original de creación directa

Se retomó el diff existente, sin reset ni reversión. Al retomar había cuatro
tracked modificados (firestore.rules, runner, jointPlanLogic y servicio jointPlans)
y el quinto archivo de integración nuevo: joint-subject-integration.test.cjs.
Se conservaron además todos los artefactos del diagnóstico/prototipo previo.

La alternativa E aprobada está integrada para subjects de planes schemaVersion=2.
Legacy conserva su servicio de una escritura; v2 lee subject/check en transacción,
detecta unchanged, conserva atribución y escribe ambas mitades con revisión siguiente.
No usa selección ni accede al statusMap de otro usuario. El esquema de check sigue
siendo exclusivamente revision, actorUid, updatedAt. No hubo campos adicionales.

### Reglas y presupuesto integrado de saveJointSubject

| Escritura | Accesos razonados en el peor camino permitido |
|---|---:|
| subject | 1 plan previo para descartar legacy + 1 plan posterior + 2 check antes/después + 5 instancias = **9** |
| subjectCheck | 1 plan posterior + 2 subject antes/después + 5 controles = **8** |
| Commit | Cota conservadora sin descuento de caché entre predicados = **17** |

No se afirma telemetría de accesos facturados. Esta cuenta corresponde al código,
y Emulator demuestra ALLOW para actor+4 y cuatro destinatarios con actor quinto.
La integración no reutiliza 8+8 como si la coexistencia legacy fuera gratuita.
La autoridad se valida con el contrato real; metadata, índice y perfil de las
fixtures siguen Etapas 1–5. Archive/restore se ejecuta con timestamps y coherencia
de metadata reales, no con las Rules reducidas del prototipo.

### Cleanup y seguridad independiente del borrado físico

- Retirar subject conserva check y revisión. Recrear exige revisión siguiente;
  la eliminación libre/reset del check está prohibida.
- Plan cerrado/deleting: dueño autorizado puede drenar subjects y luego checks,
  con paginación de 100, conservando el flujo reanudable existente.
- Finalización conserva tombstone y retiro atómico de cuatro slots de Activity.
- Se probó drain de 105 pares, un subject ya eliminado y slots ausentes.
- Un cliente puede finalizar prematuramente el padre sin drenar toda subcolección:
  Rules no enumera exhaustivamente hijos. El servicio sí drena ambos conjuntos.
  Se probó expresamente que el check residual NO permite mutar ni leer después
  de retirar el padre. Tombstone impide reutilizar el ID. No se presenta cleanup
  físico como condición única de seguridad ni como garantía de clientes hostiles.

Historia: asignaciones existentes de archivados pueden conservarse; quitar y
volver a asignar requiere operatividad actual. Otros miembros siguen trabajando
con dueño archivado. Restore no reabre un plan cerrado. Sharing continúa cerrado
para instancias por las barreras preexistentes; no se declara implementado el
consentimiento multicarrera definitivo todavía.

### Nuevo conflicto reproducido: creación v2 con validación completa

Tras validar save, se exploró create sin subjectChecks ni otro protocolo nuevo:
padre + avisos obligatorios, como antes. El schema v2 verifica catálogo explícito,
owner binding activo, arrays/mapas coherentes, campos permitidos, nombre/fechas,
invitados unresolved y ambas orientaciones de amistad en los avisos.

| Prueba contra firestore.rules completo | Resultado |
|---|---|
| Un invitado, directa/inversa | 2 PASS |
| Tres invitados, directa/inversa | 2 FAIL |
| Cuatro invitados, directa/inversa | 2 FAIL |

Error real: `permission-denied`, `maximum of 1000 expressions to evaluate has
been reached`. **No se confunde este límite de expresiones con once access calls.**
La variante diagnóstica sin validación completa del sobre pasa 6/6; no constituye
una solución aceptable ni se usa para dar por validada la creación.

Accesos de la candidata: padre hasta 10 (instancia owner 1, tombstone 1, cuatro
avisos antes/después 8); cada aviso hasta 6 (plan antes/después 2, control actor 1,
control destinatario 1, dos orientaciones de amistad 2). La suma textual 34 para
cinco escrituras no es el contador del evaluador: incluye recursos compartidos
y documentos de la propia operación. No se afirma holgura agregada ni una causa
de access calls no observada; el presupuesto de expresiones falla de forma real.

Se aplica STOP solicitado antes de optimizar/reorganizar ese protocolo. No se
eliminaron condiciones, redujeron invitados ni convirtió el error en denegación
esperada del test funcional. Los cuatro casos quedan ROJOS en el consolidado.
La creación v2 está parcial en las Rules locales y NO está lista para publicar.
No se agregaron UI ni servicio de creación v2 y no se avanzó a invite/join/sharing.

### Validación final de esta integración

- Node completo: **693/693 PASS**.
- Emulator consolidado con Rules reales: **411 tests, 407 PASS, 4 FAIL**,
  sin cancelados ni omitidos. Desglose: históricas **335/335**, integración de
  subjects **70/70**, creación completa **2/6**. Los cuatro fallos son los
  casos de tres/cuatro invitados en ambas orientaciones descritos arriba.
- Diagnóstico original + prototipo: **71/71 PASS** (8 + 63). No sustituye
  la integración. Diagnóstico reducido de creación: **6/6 PASS**, tampoco
  sustituye el contrato completo ni elimina el STOP.
- Build normal: PASS; conserva advertencia de chunk mayor a 500 kB.
- SHA-256 de firestore.rules validado:
  `64e9275713f108ebb93320ec591d5b663edb5da80c9268534d71df32a54659a1`.
- Sin acceso a producción, publicación, commit, staging ni deploy.

### Estado de alcance, privacidad y deudas

Implementado/validado: guardado atómico v2, preservación histórica, revisión,
idempotencia, rechazo de mitades/spoof/replay, lifecycle, cleanup y coexistencia
legacy para ese flujo. Corpus real de 70 pruebas, no el prototipo aislado como
sustituto. Los tests adicionales ejecutan servicios reales y Rules completas.

Pendientes: creación v2 completa, aceptación/bindings operativos, sharing y
snapshots por instancia, compatibilidad mínima cross-user, UI, Activity de ese
nuevo flujo, materialización migratoria e idempotencia de planes. No se declara
resuelto ninguno por pasar las regresiones históricas.

No hay dual-write: save elige exactamente una rama por schema del plan. Los
checks no autorizan lecturas académicas, no se usan para certificados persistentes
ni crean careerInstances. Los gates generales de UI/bridge siguen sin retirarse.
Las Rules de creación en desarrollo no usan activeCareerId/activeCareerInstanceId.

**Protected new-account bootstrap — RELEASE BLOCKER** continúa sin cambios.
**NO-GO Etapa 7 / NO-GO release v1.16**: etapa incompleta, fallo de creación y
bootstrap pendiente. Hace falta revisión del nuevo límite antes de continuar.

Archivos de integración: firestore.rules, src/jointPlanLogic.js,
src/services/jointPlans.js, scripts/test-rules.cjs,
tests/rules/joint-subject-integration.test.cjs,
tests/rules/joint-create-budget.test.cjs, tests/rules/joint-create-integration.test.cjs
y este checkpoint. Diseño y baseline anteriores se conservan como evidencia.

---

Actualización posterior autorizada: se completó el [diseño y prototipo aislado
de guardado atómico](multicareer-joint-subject-protocol-design.md), con 63 pruebas
nuevas y las 8 originales preservadas. El bloqueo de la adaptación directa sigue
reproducible; existe una alternativa demostrada para saveJointSubject, pendiente
de revisión antes de integrar. El relato siguiente conserva el checkpoint original.
Etapa 6 completa continúa pendiente y no hay autorización de release.

Base comprobada: `96de41a`. Working tree limpio al retomar. Etapas 0–5 intactas.
**Etapa 6 NO implementada ni cerrada.** Se aplica la condición de STOP del pedido:
aislar un conflicto de presupuesto antes de cambiar el contrato/producto.

## Reproducción local

`node scripts/test-rules.cjs --social-budget-only`

Utiliza únicamente el runner demo existente, `demo-correlativas-rules`,
`127.0.0.1:8088`. La suite instala Rules diagnósticas en memoria en Emulator.
No cambia `firestore.rules`, servicios, UI, schemas persistidos o datos remotos.
Las fixtures con controles reducidos NO son políticas utilizables en producto.

El servicio actual `src/services/jointPlans.js`, `saveJointSubject`, escribe
únicamente el documento subject. Adaptar directamente su autorización para
validar la operatividad actual de cinco personas exige estos recursos distintos:

| Recurso | Cantidad |
|---|---:|
| jointPlans/{planId}: membership, binding, catálogo, cierre | 1 |
| migrationUsers/{uid}: instances/complete válido | 5 |
| users/{uid}/careerInstances/{boundId}: catálogo y lifecycle | 5 |
| Total por escritura de subject | 11 |

El actor debe ser operativo aunque no esté entre los destinatarios. Cuatro
destinatarios distintos del actor también requieren once recursos. No incluye
amistades, índices, Activity ni snapshots. Repetir la lectura de un mismo recurso
no elimina la necesidad de estos once documentos diferentes.

La fixture reutiliza los validadores de authority reales. Omite intencionalmente
otras validaciones de payload para aislar el presupuesto; por eso NO acredita
seguridad funcional completa de Etapa 6. Evita reevaluar al actor en la lista.

Resultados focalizados: **8/8 PASS**, cero omitidos/cancelados. PASS significa
que se reprodujo el resultado esperado del diagnóstico, NO que la operación
funcional máxima esté habilitada:

- Cuatro personas incluyendo actor: permitido (nueve recursos distintos).
- Cinco personas: denegado; subject no creado.
- Cuatro destinatarios excluyendo actor: denegado (once recursos).
- Control experimental que omite una authority: permitido (diez recursos).
- Archivado o frozen: denegado por debajo del presupuesto.
- Authority reducida a una sola comparación, únicamente para diagnóstico:
  once recursos denegados, diez permitidos. Descarta que simplificar solamente
  las expresiones del validador resuelva este límite.

SDK devuelve `permission-denied`. Con validadores completos Emulator informa
también límite de 1000 expresiones; con la fixture mínima informa `Service call
error` en `get(migrationUsers/four)`, el undécimo recurso. No hay contador de
lecturas facturadas: las cantidades de la tabla son rutas distintas del código.
El primer intento tuvo un cierre faltante en el harness; fue corregido y las
ejecuciones finales completas pasaron. No fue un fallo de producto.

## Frontera y decisión necesaria

Esto demuestra un bloqueo para la adaptación directa de una escritura de subject,
NO la imposibilidad de implementar el contrato con otro protocolo atómico.
No se eligió ni implementó una alternativa, conforme a la condición de STOP.

Una línea de investigación es repartir comprobaciones entre escrituras atómicas
estrictamente vinculadas. Exigiría demostrar que no se puede omitir la escritura
complementaria, reutilizar una autorización anterior ni cambiar los participantes
entre comprobaciones, además del límite por escritura y por operación atómica.
No se propone un booleano operativo persistido como autorización ni eliminar
checks de authority, reducir participantes, ampliar acceso o depender de selección.

Pendiente de autorización: diseñar y probar ese protocolo (y cualquier cambio
necesario de schema/API) antes de integrar sharing, bindings, servicios y UI.
Tampoco está validado aún el presupuesto multicarrera de creación con cuatro
avisos, join, snapshots y archive; las regresiones legacy no lo sustituyen.

## Estado del alcance y auditoría

Sharing por instancia, snapshots, compatibilidad cross-user, perfiles v2,
bindings operativos, materialización migratoria y UX: pendientes; ningún gate
transitorio retirado. No hay nuevo consentimiento ni nuevos permisos. No hay
dual-write nuevo ni modificación de motores, catálogos o datos académicos.
Las garantías implementadas de Etapas 0–5 permanecen; no se declara que las
garantías funcionales de Etapa 6 estén terminadas por pasar el diagnóstico.

**Protected new-account bootstrap — RELEASE BLOCKER** permanece sin resolver.
NO-GO para Etapa 7: Etapa 6 incompleta y protocolo pendiente de revisión.
NO-GO para release v1.16: Etapa 6 incompleta más bootstrap protegido bloqueado.

Cambios de esta investigación: este checkpoint, suite diagnóstica y una opción
focalizada del runner. La suite diagnóstica es explícita, separada del consolidado
funcional para no presentar su denegación esperada como cumplimiento del producto.
No hubo producción, migración real, Console, publicación, commit, push ni deploy.

## Regresiones ejecutadas sobre este checkpoint

| Validación | Resultado |
|---|---|
| Diagnóstico focalizado de presupuesto | 8/8 PASS |
| Node completo | 693/693 PASS |
| Emulator consolidado existente | 335/335 PASS, 16 suites |
| Build normal | PASS, 2753 módulos; warning existente de chunk >500 kB |
| git diff --check | PASS (aviso de normalización LF/CRLF, sin error) |
| Whitespace de ambos archivos nuevos | PASS |

Node y Emulator: cero fallos, cancelados u omitidos. El consolidado incluye
regresiones históricas, Activity, rollout/recovery, instancias, migración, bridge
y lifecycle; no acredita funcionalidades multicarrera sociales aún pendientes.
Los ocho diagnósticos se ejecutaron separadamente, no están incluidos en 335.
Emulator terminó con cierre limpio. Rules fuente conserva SHA256
`d25c2ca2bdc71bb448afd5d39c65dc1cbdff9ffd04dffbf1584c25075cf8f4fc`.

Git final: un archivo modificado (`scripts/test-rules.cjs`) y dos nuevos
(este checkpoint y `tests/rules/multicareer-social-budget.test.cjs`), ninguno staged.
