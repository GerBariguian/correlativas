# Etapa 6: identidad de ciclo de amistad — diseño aislado

Estado: NO-GO para integrar. No modifica el contrato desplegable del repositorio.
Base de inspección: 96de41a y working tree acumulado de Etapa 6.

Último gate: [viabilidad de activación C](joint-activation-feasibility.md).
Preparación privada inerte y ocho invalidaciones actuales PASS. Activation 1–3
directa/inversa/mixta PASS; activation 4 directa FAIL con expressions/service-call
error. STOP sin probar orientaciones restantes, concurrencia, recovery ni legacy.
23 entradas Node: 21 PASS / 2 FAIL (un caso hoja y su contenedor).
NO-GO para continuar C bajo esta propuesta; no hay integración autorizada.

Última fase: [comparación arquitectónica A/B/C](invitation-architecture-comparison.md).
Children versionados (A) y certificate (B), ambos con composición completa cargada,
pasan 1–3 invitados en directa/inversa/mixta y fallan al probar cuatro en directa.
STOP por alternativa, sin microoptimización posterior. Conteos finales con ciclos
únicos: 22 entradas, 18 PASS / 4 FAIL (dos casos hoja y sus contenedores).
A/B NO-GO; C es sólo concepto sujeto a decisión contractual y presupuesto no probado.

Último cierre: [validación distribuida y matriz conjunta](distributed-versioned-invitations-design.md).
El CREATE distribuido aislado pasa 1–4 × directa/inversa/mixta, pero la composición
con invitation + JOIN + friendship Activity falla con cuatro invitados en las tres
orientaciones. Resultado final: 137 entradas, 133 PASS / 4 FAIL (tres casos y su
contenedor). STOP vigente: no se corrigió ni integró esa composición. A = NO-GO
para uso de la arquitectura en la composición actual; B = NO-GO para integración
completa. Los resultados anteriores de este documento conservan su alcance histórico.

## STOP posterior: Activity versionada / CREATE E (2026-09-30)

El prototipo aislado `tests/rules/fixtures/versioned-invitations.cjs` extiende en
memoria las Rules completas actuales, sin modificar `firestore.rules`. La primera
puerta de viabilidad conserva CREATE E, owner operativo, catalog/bindings,
authority, amistades y avisos obligatorios distribuidos por destinatario.
No constituye todavía un protocolo completo de invitaciones.

Resultados actuales de `node scripts/test-versioned-invitations.cjs`:

| Invitados | Directa | Inversa | Mixta |
| --- | --- | --- | --- |
| 1 | PASS | PASS | PASS |
| 2 | PASS | PASS | PASS |
| 3 | FAIL: 1000 expressions | FAIL: 1000 expressions | FAIL: 1000 expressions |
| 4 | FAIL: 1000 expressions | FAIL: 1000 expressions | FAIL: 1000 expressions |

12 casos hoja: 6 PASS, 6 FAIL; Node cuenta además el contenedor fallido:
13 entradas, 6 PASS / 7 FAIL. Las expectativas siguen exigiendo éxito para todos
los CREATE válidos. En los seis rechazos se comprobó que no existían ni el plan
ni avisos parcialmente escritos. No se cambiaron expectativas para obtener verde.
Un error inicial de generación de fixture (sustitución JavaScript de `$'`) se
corrigió usando una función de reemplazo; no era un resultado de autorización.

Observación: el Emulator devuelve `permission-denied` y explícitamente el límite
de 1000 expresiones en el camino válido de CREATE. No se midió el número exacto
de expresiones ni se calibraron access calls de esta extensión. No atribuir este
rechazo a access-call budget. Tampoco demuestra imposibilidad de toda alternativa;
demuestra que esta extensión no satisface el fan-out contratado. Se activa STOP
sin quitar verificaciones, reducir invitados ni seguir con una arquitectura nueva.

Cobertura y pendientes, conforme a los veinte puntos del pedido:

1. Occurrence schema: propuesta aislada `invitationSerial`, `invitationCycles` y
   `invitationOccurrences`; mapas con las mismas claves que inviteeIds.
2. Generation: CREATE asigna 1..N y serial=N. Incrementos, retiro y no-reuse todavía
   no implementados/validados para UPDATE; no presentar el schema como terminado.
3. Activity IDs: `jp_{planId}_{occurrence}`; notice schemaVersion=2 agrega cycle y
   occurrence. `fr_{cycleId}`/`fa_{cycleId}` no implementados en esta extensión.
4. CREATE: conserva E, prueba fan-out 1..4; falla desde tres invitados.
5. INVITE: pendiente por STOP; el nuevo permiso de avisos sólo admite CREATE.
6. Reinvite: pendiente, incluida renovación C1/O1 a C2/O2.
7. JOIN: evidencia anterior del núcleo aceptada, no valida ocurrencias nuevas.
8. Withdrawal/re-friend: núcleo anterior aceptado, Activity nueva pendiente.
9. Stale Activity: vínculo cycle/occurrence modelado en CREATE; navegación y
   rechazo de ocurrencias históricas en JOIN pendientes.
10. readAt: se conservan Rules privadas existentes; no hay nueva matriz versionada.
11. Atomicity: source exige aviso nuevo y aviso exige creación de source; ausencia
    de escrituras parciales observada. Corpus de mitades/omisión pendiente.
12. Concurrency: evidencia canónica anterior no se extrapola a INVITE/readAt nuevos.
13. Access-call budgets: no medidos para esta extensión; cifras del núcleo anterior
    siguen limitadas a sus operaciones originales, sin Activity completa.
14. Expression behavior: límite explícito observado en CREATE válido 3/4 invitados.
15. CREATE E compatibility: estructura preservada; viabilidad completa NO aprobada.
16. Legacy: no se modifican Rules/servicios reales ni se migra historia; compatibilidad
    del futuro protocolo completo todavía no certificada por esta suite.
17. Security corpus: incompleto por STOP; seis rechazos atómicos no sustituyen corpus.
18. Tests: conteos de arriba; syntax y whitespace se verifican aparte. No se usa
    Node/build global como evidencia de integración inexistente.
19. Archivos de esta fase: este documento, `scripts/test-versioned-invitations.cjs`,
    `tests/rules/versioned-invitations.test.cjs` y la fixture indicada arriba.
20. NO-GO técnico para integrar friendship-cycle completo. Requiere revisión antes
    de cualquier alternativa. Bootstrap protegido sigue siendo blocker separado.

Rules reales conservan SHA256
`7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.
El diff previo acumulado se preservó. Sólo Emulator local/demo; sin producción,
migración, publicación, integración, commit, push ni Etapa 7.

Actualización: [diagnóstico posterior](friendship-cycle-diagnostic.md) explica y
corrige la contaminación de metadata que invalidaba la calibración, y prueba una
identidad canónica. Los resultados de abajo se conservan como evidencia histórica,
no como estado de la nueva variante. La integración completa sigue sin autorizarse.

## Revalidación final del diagnóstico (2026-09-30)

No hubo cambios de Rules ni servicios productivos. Se repitieron ambas suites:

* Original: 41 PASS / 2 FAIL de 43 entradas. El único caso hoja fallido es la
  carrera del diseño anterior de dos orientaciones; el otro fallo es su contenedor.
  Los antiguos base + 1 pasan. No se modificó ninguna expectativa para obtener verde.
* Diagnóstico canónico: 49/49 PASS (41 casos hoja y 8 contenedores).
* Regresión de contaminación: reproduce metadata compartida entre instancias/casos
  y exige aislamiento con una copia por instancia. El caso archived ya no contamina
  las calibraciones posteriores. La causa era lifecycle, no access-call budget.
* Canónica, 12 carreras: A gana 4, B gana 8, ambas rechazadas 0, dos relaciones 0.
  Cada carrera conserva una request pending y un certificado. Los 12 perdedores
  reconocen la solicitud mediante lectura tras permission-denied, sin escritura
  adicional ni autoaccept. Se observaron 24 callbacks SDK, sin retry SDK en esa matriz.
* Variante anterior, 12 carreras: A gana 2, B gana 5, ambas rechazadas 5. El control
  sin certificado también falla disponibilidad (10 de 12 ambas rechazadas). La
  reserva de cycle no es causa necesaria del doble rechazo.

Calibración válida, misma base para todo N, rutas adicionales independientes:

| Operación del prototipo | Último N adicional permitido | Primer N rechazado |
|---|---:|---:|
| CREATE request + certificado, padding sobre request | 9 | 10 |
| Mismo commit, padding sobre certificado | 9 | 10 |
| ACCEPT sin Activity | 10 | 11 |
| WITHDRAW | 10 | 11 |
| JOIN quinto participante, invitedBy distinto del owner, directa/inversa | 6 | 7 |

CREATE agregado: base efectiva 2 + probes independientes 8 + 8 + 2 = 20 ALLOW;
con 3 en el tercer write = 21 DENY. Ningún write individual cruza 10 en esa
comparación. Son fronteras efectivas de esta fixture con caching, no facturación.
Los rechazos de frontera no muestran expression exhaustion.

JOIN válido pasa con todas las ramas. Mismatch, withdrawn, invitación vieja bajo
nuevo ciclo, owner-only, stale memberIds y spoof de invitador se rechazan sin
escrituras parciales. Algunas ramas completas de rechazo muestran 1000 expressions;
JOIN aislado rechaza esos mismos casos sin agotamiento. No se debilitó validación.

CREATE/INVITE Joint Plan con cycle + occurrence + Activity versionada NO está
representado completamente. Tampoco se atribuye el presupuesto de CREATE/ACCEPT
del núcleo a sus futuras operaciones con avisos. Activity tiene diseño de IDs
viable, pero falta probar sus transiciones atómicas, replay/readAt y presupuesto.

NO-GO para integrar friendship-cycle completo: los dos pendientes originales tienen
explicación/variante probada, pero esa validación parcial no certifica el protocolo
completo de invitaciones y Activity. Bootstrap sigue como blocker separado. STOP
para revisión, sin Etapa 7 ni producción.

## Decisión y alcance

La relación relevante es invitedBy ↔ invitee. Retirar amistad invalida para siempre
las invitaciones pendientes del ciclo retirado. Re-friend no las revive. No expulsa
miembros que ya ingresaron ni borra bindings históricos. Activity no autoriza.
La invalidación física exhaustiva por fan-out quedó descartada.

Se propone una identidad opaca no reutilizable. La seguridad no depende de que el
cliente genere aleatoriedad honesta: Rules debe demostrar que nunca se utilizó.
Un UUID aleatorio por sí solo, comparado únicamente con el último cycleId, permite
volver a C1 después de C2 y NO satisface el contrato.

## Variante recomendada para continuar el diseño: registro de IDs consumidos

Schema objetivo (todavía no integrado):

* friendships/{relationshipId}: schemaVersion nuevo, participants, senderId,
  recipientId, status, cycleId, createdAt, updatedAt. createdAt identifica el
  documento; cycleId no deriva de ninguna fecha.
* usedFriendshipCycles/{cycleId}: relationshipId, participants, createdAt.
  Registro inmutable y no eliminable por cliente; sin list ni lectura pública.
  No se consulta en JOIN. Retención indefinida para impedir reutilización.

El cliente propone un token opaco de 16–64 caracteres seguros (en producto,
aleatoriedad criptográfica). Una transacción crea la solicitud y el certificado.
Rules exige certificado inexistente antes, presente después y ligado exactamente
a la relación, participantes y nuevo estado pending. El certificado exige la
transición recíproca. Ninguna mitad es válida sola. La aplicación no necesita leer
certificados ajenos: una colisión deniega la escritura; no es autorización.

Lifecycle:

* ausente → pending: actor es sender, otro UID es recipient, dos UID distintos;
* pending → accepted/rejected: solo recipient, cycleId inmutable;
* pending/accepted → withdrawn: cualquiera de los dos (incluye cancelación de
  solicitud pendiente; propuesta explícita de esta fase, aún no integración);
* withdrawn/rejected → pending: cualquiera puede ser nuevo sender, nuevo
  certificado nunca usado, mismos participants/relationshipId;
* no delete del documento de relación, ni accepted → pending, ni actualización
  libre del cycleId. Un retry de retirada que observa withdrawn devuelve no-op.

Esto usa dos escrituras al iniciar cada ciclo, además del aviso obligatorio. El
registro crece con ciclos, no con planes. Requiere política de abuso/retención;
no se promete que Rules proporcione rate limiting.

## Variante alternativa: contador protegido + nonce

Mismo documento retenido, con generation entero monotónico y nonce opaco.
La identidad completa es la tupla (relationshipId, generation, nonce), tratada
por clientes como valor de igualdad, jamás como orden o selección académica.
Rules exige generation anterior + 1, no permite delete/reset y falla cerrado al
agotar el entero seguro. Cambiar solo nonce no permite reutilizar la identidad.

Ventajas: sin certificado ni escritura adicional; JOIN compara campos ya leídos.
Desventajas: la identidad completa no es estrictamente opaca (revela un contador),
exige un schema compuesto y no es correcto comparar solo nonce. Admin/restore no
puede resetear generation. No prototipada. Se prefiere registro para respetar la
opacidad literal solicitada; no se sustituye por contador sin revisión.

Un certificado auxiliar como única ubicación de la identidad agregaría lectura
a JOIN; no aporta ventaja aquí frente a guardar el cycleId también en friendship.

## Orientación

Retener la orientación del documento existente durante toda su vida. Un nuevo
sender no cambia relationshipId. Para relación ausente, el cliente propone el ID
ordenado existente; Rules exige ausencia de la inversa también al final del commit.
JOIN consulta ambas orientaciones y requiere exactamente una relación aceptada
con ciclo coincidente; anomalía de dos documentos falla cerrada.

La fixture demuestra exclusión de orientación inversa tras una creación, pero dos
batches iniciales opuestos concurrentes se rechazaron AMBOS con Service call error
en existsAfter. No hubo dos relaciones aceptadas; no se demostró disponibilidad.
Falta probar el servicio transaccional con lectura previa de ambas rutas y definir
su resultado concurrente. No se autoriza retry indiscriminado de permission-denied.

## Invitaciones y X → Y

Propuesta de metadatos por plan: conservar invitedBy y añadir invitationCycles,
invitationOccurrences (ambos mapas exactos por invitee) e invitationSerial global
monotónico. El serial nunca se reinicia al retirar un slot. CREATE asigna ocurrencias
distintas y acotadas a sus hasta cuatro invitados; cada nueva emisión incrementa
serial. Se falla cerrado al agotar el entero seguro. No crecer un mapa por cada
participante histórico: el contador conserva unicidad al reciclar slots.

CREATE/INVITE exige amistad actual accepted del actor y el destinatario, cycleId
exacto y aviso nuevo en el mismo commit. No se permite editar cycles/occurrences
fuera de estas transiciones.

Renovar X bajo C2 es una NUEVA operación de invitación: actor todavía es miembro
operativo, plan abierto, destinatario no miembro, invitador original igual al actor,
ciclo anterior distinto del actual, nueva ocurrencia, aviso nuevo. Cambia solo su
slot y contador, preservando terceros; el binding pendiente no se inventa. X queda
como evento histórico con C1/ocurrencia vieja y nunca se interpreta como Y.

Si otro invitador pretende ocupar el slot, exigir primero el retiro explícito del
slot por su destinatario; no apropiarse silenciosamente de una invitación ajena.
Estas son transiciones PROPUESTAS, todavía no probadas en CREATE E/INVITE.

## JOIN, retirada, membership y sharing

JOIN conserva todos los requisitos existentes: invitation, plan abierto, authority,
catálogo, instance propia activa, binding compatible, capacidad y preservación de
terceros. Añade current accepted friendship entre invitedBy e invitee y coincidencia
de ciclo. Una Activity antigua o amistad con owner no sustituye ninguna condición.
Cambios de ciclo, invitador u ocurrencia son cambios de autorización: jamás
concurrencia compatible para la recuperación externa. La segunda transacción debe
releer la relación además de authority, plan, instance e índice; no hereda permiso.

Retirada cambia un documento: todas las pendientes C1 fallan por estado, y después
de C2 fallan por identidad. No requiere buscar planes. Cleanup físico es opcional.
Los miembros ya aceptados conservan membresía/binding; sus operaciones no requieren
que siga viva la amistad original, aunque sí su operatividad académica y plan abierto.

Sharing sigue exigiendo amistad accepted actual, consentimiento por instancia y
vigencia. Retirada corta futuras lecturas remotas autorizadas, no borra datos ya
descargados. Un snapshot propio puede actualizarse sin tener amigos; no confundir
su escritura con otorgar acceso. Re-friend podría restaurar lectura si el consentimiento
sigue ON: esta fase no cambia ese contrato ni activa sharing automáticamente.

## Activity: alternativas y recomendación

1. IDs por ciclo/ocurrencia (recomendado): fr_{cycleId}, fa_{cycleId},
   jp_{planId}_{occurrence}. Avisos schema nuevo con referencia exacta a relación/ciclo
   o plan/ocurrencia. Eventos inmutables salvo readAt propio y borrado autorizado.
   La retención histórica aumenta almacenamiento/paginación, pero no bloquea Y.
2. Reutilización protegida de slots: requiere reemplazo atómico certificado por la
   nueva transición, reinicio de readAt y CAS de ocurrencia. Menos almacenamiento,
   pierde historia y puede confundir clientes viejos. No recomendada.
3. Evento histórico + slot accionable separado: preserva historia y facilita UI,
   pero agrega escrituras, lecturas y otra consistencia atómica. No necesaria aquí.

Un aviso nuevo se valida contra cambio de fuente EN EL MISMO commit. Eliminar un
aviso no permite recrearlo sin una nueva transición. readAt solo pasa de null a
request.time por destinatario; no puede tocar source ni ciclo. Navegación comprueba
ocurrencia/ciclo actuales y estado: X es stale aunque exista Y. Aceptación histórica
puede mostrarse como historia, pero no reactivar una acción. ID de Activity jamás
es prueba de amistad ni índice exhaustivo.

La fixture de lifecycle NO incluye Activity; no demuestra todavía este presupuesto
completo ni reemplaza sus garantías productivas.

## Concurrencia: contrato de validación pendiente

* JOIN primero y luego retirada: miembro permanece. Retirada primero: JOIN denegado.
* INVITE primero: X inmediatamente inválida tras retirada. Retirada primero: INVITE
  denegado. Comprobar también cambio de amistad y JOIN/INVITE en un mismo batch usando
  estado posterior, para no aceptar una autorización retirada en ese commit.
* accept vs withdrawal: si withdrawal gana, accept no puede sobrescribirlo. Si accept
  gana, withdrawal puede retirar accepted. Lecturas transaccionales + reglas de transición.
* re-friend simultáneo: el estado pending del ganador bloquea el segundo nuevo ciclo;
  no reconvertirlo ni modificar sender unilateralmente.
* Y vs X: occurrence cambia; comando X falla aunque Y sea válida.
* dos withdrawals: no-op verificado después de releer; no nuevo aviso/duplicación.
* recovery JOIN con C1→withdrawn/C2: error definitivo de contexto, no retry-success.

La prueba ejecutada cubre re-friend concurrente y primera orientación concurrente.
Los demás cruces y el servicio recovery real no están validados en esta fase.

## Legacy, migración y rollout propuestos

Antes de habilitar withdrawal, bloquear JOIN sin cycle/occurrence verificables,
incluido legacy: de otro modo queda bypass. No inferir un ciclo histórico para una
invitación sin información. Miembros existentes se conservan. Requerir reinvitación
explícita para pendientes viejas. No dual-write ni cambio de authority por este paso.

Backfill administrativo local e idempotente bajo maintenance de transiciones sociales:
inventariar ambas orientaciones, rechazar conflictos/dobles relaciones, conservar
participants/sender/recipient/status, asignar una identidad INICIAL DE TRANSICIÓN,
crear certificado en la misma transacción y guardar checkpoint. Releer antes de
escribir; si ya tiene ciclo/certificado coherente, no-op. Si difiere, conflicto,
nunca sobrescribir. Esa identidad no certifica cuándo nació la amistad ni valida
invitaciones históricas. Tratar pending y rejected explícitamente sin autoaceptar.
Desconocidos/malformados quedan bloqueados para revisión. No fabricar instances.

Activity v1 se puede mostrar como historia; no convertir slots fr/fa/jp viejos en
autorización del nuevo ciclo. Nuevos IDs no colisionan. Clientes viejos necesitan
actualización o bloqueo explícito de las escrituras que omitan el protocolo. Rollback
no puede volver a Rules que permitan JOIN sin ciclo después de habilitar withdrawal;
usar maintenance/fail-closed. El migrador solo es diseño, no se ejecutó.

## Evidencia y presupuestos

Runner aislado: scripts/test-friendship-cycle-design.cjs, solo demo local 127.0.0.1:8088.
No carga la fixture como Rules del repo: el test la envía al Emulator. JOIN se prueba
con copia EN MEMORIA del firestore.rules actual, añadiendo la coincidencia de ciclo
y campo del plan. No es todavía schema completo de invitaciones/Activity.

En JOIN se consultan control, instance y las dos orientaciones de amistad. La
estimación inicial de cuatro llamadas NO predijo el límite observado con padding:
seis lecturas extra fueron denegadas. No equiparar rutas distintas con calls medidos.
La calibración posterior desactiva solo en memoria ramas alternativas de UPDATE
para separar access calls de expresiones. Esa fixture no es candidate de deploy.

JOIN sin padding: directo/inverso, quinto participante y miembro invitador distinto
del owner pasan. Ciclo distinto, withdrawn, missing, amistad solo con owner, closed,
archived, frozen y doble orientación se deniegan. Varias denegaciones con todas las
ramas activas muestran 1000 expressions; no implica que el camino válido exceda el
límite ni proporciona margen exacto. Diagnósticos anteriores ya mostraban presión
en rechazos. Falta presupuesto de CREATE E, INVITE y Activity con schema final.

La fixture lifecycle verifica certificado atómico, no reutilización, inmutabilidad,
rechazo a tercero, no delete y nuevos ciclos tras rejected/withdrawn. No demuestra
fechas/product schema completo, perfiles sociales, Activity ni todas las carreras.

### Resultado de la última ejecución

2026-09-30: 43 entradas del runner, 38 PASS / 5 FAIL (incluye contenedores).
Son 34 casos hoja: 31 pasan y 3 fallan; los otros dos fallos son sus contenedores.
Nueve casos lifecycle: ocho pasan y falla la carrera de solicitudes iniciales
opuestas, ambas denegadas. Once casos JOIN sin padding pasan sus expectativas.
Catorce probes de calibración: doce completan la observación esperada, dos fallan
porque hasta una lectura extra fue denegada en la fixture con ramas desactivadas.
Los probes observacionales NO son doce éxitos de autorización: registran rechazos.

No se ha aislado la causa de esa diferencia entre fixture completa y calibración;
NO se afirma que JOIN agote diez calls ni que el límite sea 4, 5 o 6. Hace falta
una calibración con control idéntico sin padding antes de interpretar el margen.
La hipótesis de presupuesto numérico queda no determinada. En las primeras dos
ejecuciones la carrera inicial también falló; en otra pasó: es no determinista.
La prueba permanece exigente y roja, no se cambia para aceptar cero ganadores.

Las denegaciones por expresiones con todas las ramas y ciclo inválido son evidencia
distinta de los errores de calibración sin mensaje de expressions. No se atribuye
todo permission-denied a una causa única. No se ejecutó suite global/build: solo
fixtures/documentación/runner aislados, sin integración productiva.

## Dictamen

Registro de IDs: recomendación de diseño, NO aprobación para integrar. Prototipo
parcial deja un fallo de disponibilidad concurrente y no valida aún emisión/Activity
completas. No cambiar tests para ocultar que ambas solicitudes iniciales fallaron.
Cerrar estos puntos antes de integrar y luego repetir CREATE E, INVITE, JOIN,
saveJointSubject, Activity y regresiones reales. Etapa 6 sigue abierta, Etapa 7 no
iniciada. Protected new-account bootstrap sigue siendo RELEASE BLOCKER separado.
