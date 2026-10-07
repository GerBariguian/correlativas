# Joint Plan C — decisión de privacidad y operatividad visible

2026-10-01. DESIGN / SECURITY REVIEW ONLY. Recomendación para aprobación, no integración.
Único punto tratado del [Expanded Review](joint-plan-c-expanded-review.md): visibilidad
de operatividad ajena. Discovery, transición legacy, retención y migración histórica
siguen pendientes sin decisiones nuevas. Bootstrap sigue siendo release blocker separado.

## Problema y recomendación

**Elegir E — híbrido:** el cliente muestra estructura del plan que ya puede leer;
la operatividad académica privada de terceros se comprueba exclusivamente al autorizar
la operación. Si no hay evidencia visible suficiente, muestra **no verificada**, nunca
un positivo supuesto ni una causa privada inferida.

No crear participantStatus ni ampliar catalogMemberships. No agregar fanout, backend,
Cloud Functions, billing o lecturas al hot path. No imponer un preflight de escritura
para consultar disponibilidad. Esta política conserva el núcleo probado y reconoce
una limitación de UX: no ofrece un indicador anticipado exacto de operatividad ajena.

La pregunta de producto mínima se resuelve en favor de privacidad: otro miembro
necesita saber si el vínculo sigue perteneciendo al plan y qué ocurrió con su intento,
no si el otro archivó una carrera ni su estado administrativo. La precisión privada
permanece en Rules; no se simula precisión en UI.

## Authorization-time vs client-visible

| Aspecto | Authorization-time | Client-visible recomendado |
|---|---|---|
| Membresía | Slot member/owner actual | Pending/joined/historical según datos autorizados |
| Ocupación | UID/O/slot/revision/binding exactos | Current estructural o histórico si puede contrastarse |
| Instancia | Schema/lifecycle active/catalogId y binding | No leer documento ajeno ni mostrar causa de lifecycle |
| Authority | Control válido instances/complete/generation | No exponer frozen, phase, manifestId ni timestamps administrativos |
| Plan | Abierto/no deleting | Cerrado si parent autorizado lo demuestra |
| Resultado | Permite/deniega commit concreto | Confirmado, rechazado genérico o resultado todavía no confirmado |

`joined` no significa OPERATIONAL. `assigned` persistido tampoco. Un commit exitoso
demuestra que esa operación pasó sus condiciones al confirmarse; no otorga una licencia
duradera ni permite etiquetar al target como operativo para la próxima operación.
Unassign histórico tiene condiciones diferentes de assign, por lo que su éxito ni
siquiera demuestra operatividad del target en ese instante.

## Firestore Rules vs permiso de lectura del cliente

`get()/exists()` en Rules acceden a documentos para evaluar una solicitud; no ejecutan
un get del SDK bajo los permisos de lectura del usuario. El ejemplo oficial autoriza
operaciones en cities consultando users sin declarar lectura pública de users. `getAfter()`
permite contrastar el estado posterior del commit antes de confirmarlo. Estas consultas
internas no entregan al cliente el documento consultado. Tienen límites/coste de acceso,
incluso si la solicitud termina rechazada. [Documentación oficial: condiciones y acceso
a otros documentos](https://firebase.google.com/docs/firestore/security/rules-conditions#access_other_documents).

Por tanto **sí**, careerInstance puede seguir privada y Rules puede consultar su
lifecycle/catalog para autorizar un edge ajeno. No es necesario agregar `allow get`
al documento privado. Rules tampoco funciona como una API que devuelva un campo calculado
o una razón de negocio de la denegación. No diseñar lecturas parciales de un documento
privado suponiendo que Rules ocultará el resto.

Corroboración local existente, sin volver a ejecutar Emulator:

- `tests/rules/fixtures/slot-prototype.fragment.rules`: `slotBinding` consulta por
  getAfter la instancia privada (schema1/active/catalog); `slotAuthority` consulta
  migrationUsers y valida control real instances/complete.
- `tests/rules/fixtures/member-edge.fragment.rules`: `edgeOperational`, `edgeSlot`,
  `edgeWrite` comparan actor/target, slot/binding/O/revision y fuentes privadas.
- `tests/rules/member-edge.test.cjs` y [evidencia](member-edge-evidence.json):
  asignaciones non-owner→otro miembro pasan, archive/frozen bloquean nuevas asignaciones,
  restore permite; lecturas cross-user de `academic/progress`, instancia privada,
  statusMap legacy y sharing no consentido se deniegan.
- `firestore.rules`: lectura propia de careerInstances/authority y lectura de snapshot
  ajeno bajo fórmula independiente. El prototipo no necesita ampliar esos permisos.

Esto acredita la separación en el alcance ensayado; no certifica todas las futuras
ramas de Rules integradas ni elimina la necesidad de regresiones de composición.

## Privacidad y estados mínimos

Un miembro NO obtiene por membership acceso a careerInstances ajenas, statusMap,
progreso, proyecciones, otras carreras ni consentimiento. Compartir snapshot bajo un
contrato independiente no convierte ese snapshot en un permiso operativo del plan.

Estados conceptuales visibles (no nuevo enum persistido):

- **Invitación pendiente:** slot autorizado pending; no puede recibir assign todavía.
- **Miembro actual — disponibilidad no verificada:** slot member/owner estructural.
  No afirmar que está habilitado académicamente ni deshabilitarlo por una suposición.
- **Histórico:** evidencia autorizada de que la referencia U/O ya no es current.
- **Estado no disponible/no verificado:** no hay lectura autorizada, está incompleta,
  proviene de caché sin confirmación o hubo fallo de red. No inferir released de un error.
- **Plan cerrado:** sólo si lo acredita parent autorizado; distinto de archive personal.

No mostrar OPERATIONAL anticipado para terceros. TEMPORARILY_UNAVAILABLE tampoco se
deduce del simple joined ni de permission-denied: “temporal” supone una causa que puede
ser permanente. Tras un rechazo confirmado: “No se pudo confirmar esta asignación.
El estado del plan o los permisos pueden haber cambiado.” Texto conceptual, no UI final.
No decir “No está disponible por haber archivado su carrera”.

## Alternativas A–F

### A. Derivar sólo de plan state

Sin documentos nuevos. Slot y parent autorizados muestran membership, ocupación y
cierre; no contienen lifecycle privado ni authority actual ajena. Archive y restore
no cambian slot, por lo que **no puede distinguir joined operativo de joined archivado**.
Válida para estructura, inválida si presenta esa estructura como operatividad completa.
Su límite epistemológico es precisamente lo que E explicita.

### B. Proyección plan-scoped

Ejemplo no adoptado: `jointPlans/{P}/participantStatus/{U}` con disponibilidad mínima.
Una escritura del dueño/actor sólo puede certificar coincidencia con fuentes en ese
commit; después queda stale si archive/freeze no la actualiza. No es autoridad.

Archive/restore podrían exigir una actualización atómica conocida, pero una instancia
puede intervenir en muchos planes: mantener TODAS esas proyecciones exigiría inventario
completo y fanout, presupuestos y barrera de concurrencia. Rules no enumera libremente
todos los planes para obligar a actualizar su copia. Un cliente offline/antiguo no es
un sincronizador confiable. Frozen/cutover también deberían participar del protocolo.
TTL/timestamp no prueban freshness: sólo antigüedad. Se rechaza para este alcance.

### C. Metadata por usuario+catalogId

Estado real del repositorio: `users/{U}/catalogMemberships/{catalogId}` contiene
schemaVersion/careerInstanceId y es índice protegido de identidad, no booleano operativo.
`compatibleFriend()` permite get exacto a un amigo con authority y carrera compatible,
contrastando la instancia active actual; terceros no tienen list. La condición dinámica
puede negar una lectura sin modificar el índice al archivar. No depende de selección.

No confundir compatibilidad con el binding concreto del plan: requiere cotejar el I
exacto y todavía faltan slot/ocupación/parent. Después de withdrawal puede seguir siendo
miembro pero dejar de poder consultar compatibilidad. Ausencia/denegación de lookup
no demuestra archive ni explica cuál condición falló.

Una nueva proyección por U+catalog podría actualizarse una vez con lifecycle, evitando
fanout por plan, si cada transición (incluidos clientes viejos y administración) mantuviera
reciprocidad y no se pudiera escribir sola. Pero incluir authority/frozen introduce
actualizaciones por todas las instancias o validación dinámica en cada read. Una lectura
autorizada en un instante tampoco garantiza escrituras futuras.

Ampliar lectores de amigos a miembros sería una NUEVA política de privacidad que debe
probar vínculo con plan y catálogo específicos; no un cambio técnico inocuo. No adoptarla.
Las Rules del edge deben seguir consultando fuente privada, no confiar en la copia.

### D. No mostrar operatividad exacta

Ninguna proyección adicional. Se intenta sólo la acción real del usuario y se informa
su resultado. Conserva seguridad, aunque desaprovecha información estructural visible
si se implementa de forma demasiado genérica. No atribuir todo rechazo al target: puede
ser actor, CAS, close, permisos, formato o límites. Error de transporte no acredita que
el commit fracasó: resolver resultado por lectura autorizada del edge/revisión.

### E. Híbrido — recomendado

A para estado estructural; D para operatividad privada. Joined/historical y no-verificado
son dimensiones diferentes. No copia de lifecycle/authority, ningún write nuevo,
ningún campo nuevo, ninguna ampliación de lectura. La autorización vigente ya ensayada
decide al confirmar. Relecturas de estructura autorizada sirven para contexto, no para
prometer éxito. Multi-assign conserva resultados individuales, sin rollback ficticio.

### F. Lectura de indicador protegido dinámicamente

Concepto no adoptado: documento fijo mínimo cuyo get sólo se permite si Rules prueba
operatividad actual y relación con el plan. Evita mantener booleano mediante fanout,
pero agrega una superficie de consulta/oráculo y lecturas de evaluación; denegación
no devuelve false con causa inequívoca. Hay carrera entre preflight y write; una copia
cacheada tampoco basta. No mejora lo suficiente sobre E para justificar permisos nuevos.
No se propone endpoint server-side ni usar un write de prueba con efectos reales.

## Archive/restore por alternativa

En TODAS las alternativas evaluadas como seguras, la write académica sigue leyendo
careerInstance/authority/slot actuales; nunca autoriza por un indicador visible.
Tras commit de archive, una nueva asignación que requiera ese target active se deniega.
Si assignment confirmó ANTES del archive concurrente, queda como historia válida.

| Alternativa | Documento extra al archive/restore | Fanout | Qué puede ver otro | Qué verifica Rules / stale UI |
|---|---|---|---|---|
| A | Ninguno; lifecycle y consentimiento existentes | No | Slot joined sin distinción privada | Fuente privada; engañosa si muestra operativo |
| B | participantStatus por cada plan | Sí para exactitud persistida | Un booleano posiblemente viejo | Fuente privada imprescindible; copia queda stale si omiten planes |
| C | Índice existente: ninguno; copia nueva: una por instancia/catalog | No por plan; autoridad puede afectar varias | Compatibilidad permitida o consulta denegada; no causa | Fuente privada; copia/cache puede quedar stale |
| D | Ninguno | No | Resultado de acción, no estado anticipado | Fuente privada al commit; resultado pasado no es estado actual |
| E | Ninguno | No | Estructura + no verificado | Igual prueba existente, sin falso positivo UI |
| F | Indicador fijo no necesita update | No | Get permitido o denegado, sin motivo seguro | Evaluación privada al read y otra vez al write; ventana temporal |

Archive actual revoca sharing conforme al lifecycle; restore misma instancia conserva
OFF. Ninguna alternativa puede usar restore para reactivar consentimiento ni reabrir
closed. Restore no cambia O: A1 liberada no revive porque la instancia volvió a active.
Para E la UI no muestra transición archive/restore ajena, porque no tiene esa evidencia.

## Release/reassign y autoridad frozen

Release modifica slot/índice, no career lifecycle. Si el lector tiene el slot current
autorizado puede contrastar U/O/revision y mostrar el edge previo histórico. Reassignment
no traslada el estado viejo al nuevo ocupante; mismo UID bajo O2 sigue siendo otra relación.
Si el lector perdió acceso o sólo posee caché, debe mostrar estado desconocido en lugar
de asegurar release. No ampliar readers para hacer esta comprobación.

Frozen se mantiene **sólo authorization-time para terceros**. Propietario puede usar
su lectura propia de control para explicar su sesión, no publicarla al plan. E no expone
phase, generation, freeze time ni causa administrativa. Después de cutover se reevalúan
fuentes actuales, no se persiste un availability=true. Clientes stale no saltean Rules.
En B/C una copia no actualizada podría mentir sobre frozen: otra razón para no elegirla.

## Disclosure y enumeración

| Diseño | Inferencias posibles / límites |
|---|---|
| A/E | Catálogo/universidad del plan y pertenencia/binding que el plan ya expone; no agrega carreras, archivo ni fechas de archivo/restauración |
| B | Cambios de disponibilidad por plan permiten inferir transiciones/tiempos; no garantizan distinguir archive de frozen; timestamps agravan exposición |
| C | Gets exactos pueden revelar instancia compatible/catalog y cambios de acceso; un catálogo identifica carrera/universidad; list permitiría enumeración directa |
| D | Éxito/rechazo permite inferencia limitada sobre condiciones del commit; sin causa exacta |
| F | Polling del permiso de get permite inferir cambios de elegibilidad; nueva superficie de sondeo |

Ninguna debe revelar progreso, proyecciones ni otros planes. No se promete cero
inferencia: incluso una asignación legítima aceptada informa algo sobre condiciones
vigentes. E evita agregar un mecanismo dedicado para sondearlas; no realiza polling
de writes, requests ficticias ni cambia datos para diagnosticar.

Exact lookup no equivale a lista, pero **muchos gets de IDs adivinables también pueden
enumerar por sondeo**. El índice actual acota por amistad/compatibilidad propia; no
autoriza todos los catálogos por conocer U. No ampliar esa política a members en esta
decisión. Cualquier extensión necesitaría scope de catálogo demostrado y prevención
de grants generales; Rules no es rate limiter. No devolver causas privadas en errores.

Las consultas no usan Rules como filtro: deben satisfacer restricciones de la consulta
completa; get puntual y list/query son permisos distintos. [Documentación oficial sobre
queries](https://firebase.google.com/docs/firestore/security/rules-query#rules_are_not_filters).

## Source of truth y coste

Lifecycle/catalog: careerInstance privada. Authority: migrationUsers protegido.
Membership/ocupación/binding: slot/owner según C. Relación: edge local. Consentimiento:
fuente sharing separada. E no agrega fuente académica ni permiso derivado client-writable.

Conservar `edgeOperational`/`edgeSlot`/`slotBinding`/`slotAuthority` existentes. **Cero
lecturas adicionales de autorización propuestas**, cero writes/proyecciones extra.
Relectura cliente autorizada consume lecturas normales, no es gratis; no forma parte de
un certificado de write. No declarar nuevo presupuesto medido.

Márgenes congelados Member Edge: owner #1/#5 +3 PASS/+4 FAIL; non-owner +2 PASS/+3 FAIL.
No universales. B/C/F agregarían mantenimiento o comprobaciones de lectura que necesitan
medición propia; no usar esos márgenes para justificar automáticamente su coste.

## Comparación de decisión

| Alternativa | Seguridad/privacy | Freshness/consistencia | Sin fanout / coste Rules | Multicliente | UX | Migración/complejidad |
|---|---|---|---|---|---|---|
| A | Privacidad conservada si no afirma operatividad | Sólo estructura | Sí / sin cambios | Sí | Incompleta/ambigua sola | Sin schema; baja |
| B | Copia nunca debe autorizar; exposición nueva | Difícil sin escritor confiable completo | No / mantenimiento nuevo | Consistencia no garantizada | Informativa si correcta | Backfill/protocolo de invalidez; alta |
| C | Menor dato que instancia, pero amplía posible exposición | Índice+read condicionado útil, no operatividad completa | Evita planes / nuevos grants si se amplía | Sí con protocolo completo | No cubre miembro ya no amigo | Nueva política/backfill si copia; media/alta |
| D | Mantiene privacidad; error genérico | Exactitud del commit, no estado anticipado | Sí / prueba actual | Sí | Menos anticipación | Sin schema; baja |
| E | Mantiene privacidad y no confunde estructura con permiso | Estructura conocida + incertidumbre explícita | Sí / prueba actual | Sí | Contexto y resultado honestos | Sin schema; baja |
| F | Nuevo oráculo mínimo | Instante del read, no futuro | Sí / evaluación extra | Sí, con cautela de caché | Denegación ambigua | Nuevos reads/schema; media |

E es recomendación por seguridad, consistencia y costo, no por máxima información UI.
No depende de localStorage ni de memoria de una pestaña. Web/Android/iOS aplican el
mismo contrato sobre Firebase. Offline o datos pendientes no acreditan confirmación
servidor; cada cliente debe distinguir resultado local de commit confirmado.

## Contrato normativo propuesto

1. Membership DEBE permitir sólo las lecturas de plan ya autorizadas; NO DEBE otorgar
   acceso general a careerInstance, progreso, otras carreras, proyección ni sharing ajenos.
2. careerInstance y migrationUsers DEBEN seguir siendo fuentes de lifecycle/authority.
   Rules DEBE contrastarlas en cada mutación que lo requiera, independientemente de UI.
3. El cliente DEBE distinguir estado estructural, decisión persistida y operatividad
   académica. NO DEBE equiparar joined/assigned/compatible con operativo.
4. Para otro usuario, disponibilidad privada anticipada DEBE representarse como no
   verificada. NO DEBE inferirse archive/frozen de un rechazo ni exponerse esas causas.
5. HISTORICAL DEBE basarse en una incompatibilidad estructural demostrada por lectura
   autorizada; fallo/caché/ausencia de permiso NO DEBE presentarse como release probado.
6. La operación real DEBE conservar prueba actor/target, occupancy, binding, catálogo,
   lifecycle, authority y parent pertinentes. No hay preflight que reserve autorización.
7. Un rechazo confirmado DEBE informarse genéricamente; timeout/offline/ack desconocido
   DEBE conservar resultado no confirmado hasta reconciliación autorizada, sin falso fallo.
8. Multi-assign DEBE informar cada resultado y preservar éxitos; no rollback global
   ni reintento indiscriminado de permission-denied. Reintento legítimo requiere contexto
   actualizado y nueva intención, según el contrato de orquestación aprobado.
9. NO DEBE existir proyección client-writable de operatividad usada como permiso, ni
   fanout de archive/restore a planes para esta política.
10. Restore NO DEBE reactivar sharing ni ocupaciones viejas. Authority ajena DEBE
    permanecer interna a autorización; selection y Activity NO DEBEN autorizar.
11. Los clientes NO DEBEN generar mutaciones de prueba para detectar el estado privado.
    Un éxito pasado NO DEBE reutilizarse como badge operativo permanente.

## Impacto sobre C y evidencia/test requerido

| Dominio | Cambio propuesto en esta decisión |
|---|---|
| Slot / member edge | Ninguno en schema/Rules; futura presentación separa estructura/unknown |
| careerInstance / authority | Ninguno; fuente privada actual |
| compatibility metadata | Ninguno; no ampliar lectores ni usar como prueba de plan |
| Sharing / Activity | Ninguno |
| Migración | Ninguno nuevo; no backfill de disponibilidad |
| Servicios/UI | Ninguno implementado; contrato de resultados para futura integración |

No requiere nuevo prototipo de almacenamiento. Evidencia suficiente para factibilidad:
consultas internas de Rules con lecturas privadas denegadas, archive/restore/frozen,
A1→A2, asignaciones owner/non-owner e independientes ya documentadas en Member Edge.

Pruebas de composición futuras, **no ejecutadas ahora**:

- Misma sesión autenticada: assign permitido y get privado del target denegado;
  archive confirmado bloquea nuevo assign, slot sigue joined y UI no afirma operativo.
- Restore mantiene sharing OFF y no resucita A1; reassign no hereda estado visual A1.
- Frozen/close/CAS/target archive generan rechazo sin filtrar causa privada; errores
  de red mantienen resultado indeterminado hasta lectura autorizada del edge/revisión.
- Actor pierde acceso a slot: no mostrar released por denegación; caché/ack pendientes
  no se presentan como datos confirmados. No field privado en logs/mensajes.
- Non-owner sin amistad actual pero todavía joined: puede operar según C sin exigir
  lookup de compatibilidad; no recibe snapshot privado por membership.
- Multi-assign parcial y dos clientes concurrentes: estados independientes, sin falso
  rollback ni status global calculado desde una pestaña. Misma política web/mobile.
- Todas las Rules integradas conservan privacy/coste y no heredan un grant permisivo.

La evidencia no acredita ya esos tests UI/multicliente ni composición final. Tampoco
resuelve discovery ni exige elegir ahora migración/retención/rollout legacy.

## Cierre

Único archivo creado: este documento. Se consultó documentación pública oficial y
archivos/evidencia locales; no proyectos Firebase, Console ni datos productivos.
Sin Emulator, tests de ejecución, implementación, modificación de Rules/prototipos,
services/UI, migración, publicación, deploy, commit/push, Etapa 7 ni bootstrap.
Recomendación lista para revisión; no es autorización de integración.

OPERABILITY PRIVACY DECISION READY
