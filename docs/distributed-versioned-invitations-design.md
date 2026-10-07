# Alternativa distribuida: CREATE E + cycle + occurrence + Activity

Fecha: 2026-09-30. Prototipo aislado sobre HEAD 96de41a y working tree acumulado.
No es un contrato integrado ni una configuración para deploy.

## Cierre de la matriz conjunta — STOP confirmado

Se inspeccionó la ejecución final ya completada en
`.tools/distributed-all-result.log`, sin reiniciar el prototipo ni cambiar tests.
Resultado: **137 entradas Node, 133 PASS / 4 FAIL**. Los fallos son tres casos hoja
(`4 direct`, `4 inverse`, `4 mixed`) y su contenedor. Las expectativas siguen
exigiendo éxito. El runner terminó con exit code 1 y apagó limpiamente el Emulator.

| Invitados | CREATE distribuido aislado (D/I/M) | Composición invitation + JOIN + friendship Activity (D/I/M) |
| --- | --- | --- |
| 1 | PASS / PASS / PASS | PASS / PASS / PASS |
| 2 | PASS / PASS / PASS | PASS / PASS / PASS |
| 3 | PASS / PASS / PASS | PASS / PASS / PASS |
| 4 | PASS / PASS / PASS | FAIL / FAIL / FAIL |

Cada fallo válido de la composición devuelve `permission-denied`, con
`Service call error. Function: [getAfter]` (ruta `friendships/four:owner` en este
registro), y mensajes de máximo de 1000 expresiones en distintas ramas. Son dos
observaciones del diagnóstico; NO se identificó experimentalmente cuál es el
primer límite desencadenante de la composición. No trasladar la calibración
aislada a esta combinación como si fuera una medición nueva.

Inspección estática: el permiso adicional `friendVersionedNotice()` declara un
`getAfter(friendships/target.id)` antes de comprobar tipo/kind. Es una hipótesis
concreta de trabajo adicional al evaluar avisos de Joint Plan, compatible con la
ausencia de margen agregado anterior. No se probó causalmente ni se modificó ese
permiso: el pedido de reanudación exige STOP ante este fallo válido.

**A — NO-GO técnico para usar la arquitectura en su composición actual.** El
principio distribuido conserva evidencia positiva aislada; no se lo declara
imposible. Falta demostrar su viabilidad dentro del conjunto requerido.

**B — NO-GO técnico para integrar friendship-cycle completo en producto.** Además
del fallo conjunto siguen pendientes convivencia legacy y navegación histórica.
No se ejecutaron nuevos controles funcionales después del STOP ni se eligió una
corrección alternativa. Los resultados previos se conservan con su alcance.

## 1. Causa del límite anterior

La extensión anterior repetía en el permiso del parent los campos del aviso para
cada invitado. Además, el permiso de cada aviso tenía que validar su propio schema
y su enlace con la fuente. La variante anterior agotaba 1000 expresiones con 3/4
invitados. Esta alternativa elimina únicamente la comprobación redundante del
payload en el parent; no elimina su validación en el commit. No existe contador
exacto para atribuir una cantidad de expresiones a cada comprobación.

## 2. Alternativas comparadas

A. **Parent + Activity distribuida, mismo commit (candidata preferida, NO-GO actual).** Mantiene
el schema de plan extendido y un aviso por occurrence. Parent valida invariantes
globales; cada permiso de aviso valida identidad, ciclo y binding propios. Misma
atomicidad, sin preparación/activación ni capabilities. Replay se impide por
freshness de la ruta y transición de fuente. Estado stale se contrasta con
getAfter; recovery consiste en releer tras fallo, nunca rehacer ciegamente una
occurrence. Almacenamiento: un aviso por invitación histórica, sin certificados
adicionales por plan. Expressions y calls se prueban abajo. Concurrencia sobre el
parent serializa la asignación de occurrences; legacy requiere gate/versionado.
Complejidad: reparto explícito de obligaciones, inseparable de sus tests.

B. **Invitation child versionado.** Agrega `jointPlans/P/invitations/O`, más Activity.
Puede distribuir expressions, pero obliga a enlazar parent→child→Activity en el
mismo commit, con nuevas lecturas/escrituras (presupuesto NO medido). El child debe
probar source transition y no volverse capability reutilizable; cycle actual debe
seguir consultándose. Recovery y carreras requieren reservar occurrence y manejar
reintentos sin duplicar child/aviso. Más almacenamiento histórico y adaptación
legacy. No demuestra ventaja frente a A; no prototipada aquí.

C. **Manifest/certificate por creación.** Parent + manifest inmutable + avisos,
atómicos si se escriben juntos. El manifest tiene que certificar schema, actor,
catálogo, bindings y recipients exactos contra post-state. Evitará repetición sólo
si no concentra nuevamente el mismo coste; expressions/calls NO medidos. No puede
seguir autorizando por mera existencia ni congelar amistad vigente. Replay exige
ID/generation no reutilizables. Recovery y concurrencia deben impedir certificados
huérfanos/duplicados. Más documentos, retención y migración legacy que A.

D. **Fases con activation.** Preparación de invitations y luego activación puede
repartir evaluaciones, pero introduce estados intermedios, recovery/expiración y
carreras entre preparación, retirada y activación. Una reserva antigua no prueba
amistad vigente. Para conservar source+Activity atómicos, la activación debe
revalidar todo y emitir avisos juntos: puede volver al mismo límite. Almacenamiento
extra y cleanup; cleanup eventual no puede dar autorización. No cumple la
preferencia de un único commit observable y no está autorizada para integración.

E. **Simplificación equivalente.** Seleccionar una única invitación modificada
antes de evaluar el permiso evita repetir la misma función por cuatro posiciones.
Se usa en el prototipo UPDATE. No cambia schema, atomicidad, replay, storage ni
semántica stale; reduce evaluaciones redundantes, no requisitos. Otra posibilidad
es lookup canónico único de amistad, pero NO se usa para ocultar coste: CREATE
mantiene ambas orientaciones y rechaza duplicidad. No se propone reducir máximo,
seguridad, Activity, ni introducir backend, billing o cleanup de autorización.

## 3. Responsabilidades del parent

Conserva CREATE E completo: schema y claves exactas, owner/member inicial, catálogo,
owner con binding operativo, límites (4 invitados/5 miembros), unicidad, conjuntos
exactos de participants/invitedBy/cycles/occurrences, estado inicial abierto,
timestamps y no tombstone. CREATE exige serial=N y occurrence=index+1 para cada UID.
La ruta obligatoria es exactamente `users/UID/activityInbox/jp_PLAN_OCCURRENCE`:
no existe antes y existe después. No acepta un aviso de otra ruta aunque sus datos
sean idénticos. Las claves exactas de cada binding pendiente se validan por el aviso
de ese UID, conservando la distribución anterior de CREATE E.

## 4. Responsabilidades del aviso

SchemaVersion 2, campos exactos, timestamp servidor/readAt null, actor autenticado,
target de plan correcto, ID determinista, UID del inbox presente en inviteeIds,
invitedBy=actor, occurrence/cycle iguales al parent. Comprueba actor authority,
recipient authority, binding pendiente exacto y amistad accepted actual en una
única orientación con cycle coincidente. CREATE exige que el parent no exista antes
pero sí después. UPDATE exige incremento del serial y cambio de occurrence del UID.
La existencia de Activity nunca concede acceso académico ni autoriza por sí sola.

## 5–6. Diseño y prueba de atomicidad

Parent→ruta nueva exacta fuerza la escritura del aviso. Esa escritura tiene que
pasar su propio permiso; sólo destinatario/plan/occurrence correctos pueden hacerlo.
Aviso→transición de parent impide avisos independientes y recreación histórica.
Si cualquier permiso falla, falla todo el batch. La prueba depende de ambas Rules:
no es seguro copiar sólo una mitad. No se supone intercambiabilidad entre bindings
idénticos de distintos invitados. El corpus permuta rutas y omite avisos para probarlo.

## 7–8. CREATE y expressions

CREATE distribuido aislado: 1, 2, 3 y 4 invitados × directa/inversa/mixta PASS.
No se observó expression exhaustion en esos caminos aislados. La composición
completa falla con cuatro invitados, como registra el cierre de arriba.
No se afirma margen numérico de expresiones.
Rechazos de payloads inválidos y de calibraciones añadidas sí pueden alcanzar 1000
expresiones al evaluar otras ramas. Se registran como rechazos, no como coste del
camino válido. La primera variante UPDATE evaluaba cuatro veces una función:
falló; elegir primero el UID permitió evaluar una sola vez las mismas invariantes.
No se cambiaron expectativas para aceptar esos fallos.

## 9. Access calls

La suite conserva la base completa para cada N de padding (incluido cero). Controles
separados deshabilitan sólo permisos alternativos de rechazo; NO suprimen ninguna
condición del camino válido evaluado. Se usan documentos independientes existentes.

- Parent, un invitado: +7 PASS / +8 DENY, sin 1000 expressions en el control.
- Activity, un invitado: +5 PASS / +6 DENY, sin 1000 expressions en el control.
- Agregado, cuatro invitados: +0 PASS / +1 DENY, sin 1000 expressions en el control.

Inferencia de coste efectivo bajo este Emulator: 3 para parent con un invitado,
5 para ese aviso, 20 agregado para CREATE máximo. No sumar esos valores ingenuamente:
el motor cachea accesos entre evaluaciones. No se atribuye una cifra aislada medida
al parent de cuatro invitados ni a cada aviso en ese batch; el presupuesto agregado
no deja separarlos con padding adicional sin perturbarlo. CREATE máximo está dentro
del límite en la variante aislada: **SIN MARGEN AGREGADO MEDIDO**. El par +0/+1
no expresa margen universal, ni permite asumir futuras lecturas adicionales.
Es una restricción explícita para cualquier futura integración y exige repetir
las pruebas con todas las ramas reales presentes. No extrapolar estas cifras a INVITE,
reinvite, JOIN o fr/fa: no tienen calibración completa en esta fase.

## 10. Corpus negativo

CREATE: 36 casos incluyendo mitades, omisión, aviso extra, recipient/actor/plan/
occurrence/cycle falsos, ciclo stale también en parent, intercambio de recipients,
una occurrence usada para dos destinatarios, historia reutilizada/sobrescrita,
amistad ausente/withdrawn/duplicada, spoof invitedBy, binding inválido, owner archived,
authority frozen, catálogo, límites, serial, schema, timestamps y readAt.
Todos verifican rollback de las rutas escritas frente al pre-state.
UPDATE agrega corpus propio: INVITE emitido por miembro no owner debe tener SU
amistad con destinatario; no basta la del owner. Serial +1 exacto, cambios locales
al UID, ciclo nuevo para renovación y preservación de bindings/historia.

## 11. Concurrencia

Ocho carreras de CREATE idénticos: un ganador, un parent y cuatro avisos, nunca dos.
Dos tabs INVITE/reinvite: un incremento, un nuevo aviso, historia preservada.
Cuarto slot disputado por distintos destinatarios: sólo uno puede entrar.
INVITE vs retirada canónica y vs cierre: cuatro carreras de cada clase. Si INVITE
se serializa primero puede quedar aviso histórico; tras retirada/cierre JOIN falla.
Si se serializa después, INVITE falla. No se promete ganar siempre desde el mismo
lado. Cada operación se hace con cliente autenticado, sin escritura admin concurrente.

## 12–14. Cycle, occurrences, Activity

No se rediseña el núcleo canónico aceptado. JOIN del quinto participante prueba
amistad inviter↔invitee/cycle actuales en ambas orientaciones y rechaza stale.
CREATE empieza 1..N; INVITE incrementa serial una vez; renovación exige ciclo distinto
y mismo inviter, occurrence nueva. Reintento de escritura vieja no es una renovación.
Aún no hay servicio/UI que gestione navegación desde avisos stale: sigue pendiente
de integración y debe comparar occurrence esperada, no convertir un aviso X en Y.

Prototipo adicional fr_C/fa_C enlaza request+reserva+aviso y acceptance+aviso. C1 y
C2 mantienen avisos separados; readAt viejo permanece intacto. Tests rechazan source,
certificate o Activity faltantes, spoof/standalone y lecturas cross-user. El nuevo
permiso de Activity sólo agrega create; siguen vigentes read/update privados.
La copia canónica de amistad es una fixture: NO certifica coexistencia legacy completa.

La optimización de INVITE conserva openMember, authority, binding operativo,
diff permitido, un único cambio de occurrence, exclusión de miembros ya incorporados,
serial exactamente +1, occurrence igual al serial, restricciones por UID en maps,
invitedBy autenticado, reglas distintas de agregado/renovación y aviso nuevo
obligatorio. La Activity mantiene sus verificaciones de ciclo/amistad/schema.
El despacho toma un candidato del payload, pero NO lo considera una prueba: el
predicado posterior y la Activity vuelven a verificar todas esas condiciones
contra pre/post-state. Sólo se evita reevaluar la misma lógica para posiciones
que no corresponden al destinatario; no se confía en una declaración del cliente.

Los tests verdes cubren readAt del destinatario y rechazo de reset/mutación del
ciclo, replay/mitades, stale cycle en JOIN, occurrence antigua en INVITE, historia
preservada y retirada/re-friend C1→C2. No cubren todavía la navegación desde un aviso
de occurrence X cuando existe Y: no se presenta como resuelta por esas pruebas.

## 15–16. Legacy, límites y riesgos

Nada de esto cambia Rules, servicios o UI productivos. El working tree anterior se
preserva. Los permisos legacy del plan siguen en la copia CREATE; no hay migración
real ni invención de cycle/occurrence para historia. Una invitación sin prueba del
ciclo no debe volverse operativa por su Activity antigua. Gate y rollout completo
siguen pendientes; las suites globales legacy no se presentan como ejecutadas aquí.

El éxito aislado de CREATE distribuido no equivale a GO de Etapa 6 ni de release:
falta integración autorizada, regresiones de coexistencia y el contrato operativo
completo (navegación stale, retirada/cleanup de plan e historial, recovery y servicios).
El máximo agregado de calls no tiene margen: cualquier acceso nuevo exige recalibrar.
Protected new-account bootstrap sigue siendo RELEASE BLOCKER separado.

## 17–20. Validación, archivos, dictamen e impacto

Runner conjunto: `node scripts/test-distributed-invitations-all.cjs` (sólo proyecto
`demo-correlativas-rules`, loopback 8088, runner existente aislado; nunca remoto).
Conteos finales de la ejecución conjunta conservada:

| Suite | Entradas | PASS | FAIL |
| --- | ---: | ---: | ---: |
| distributed-versioned-invitations | 67 | 67 | 0 |
| distributed-invitation-updates (incluye matriz conjunta) | 54 | 50 | 4 |
| distributed-friend-activity | 16 | 16 | 0 |
| Total | 137 | 133 | 4 |

Node incluye contenedores; los tres casos hoja fallidos son los CREATE máximos de
la composición. El resultado previo 124/124 no incluía esa última matriz y no se
usa como dictamen final. No se ejecutó Node/build global ni se afirma integración.

Archivos nuevos: cuatro runners `scripts/test-distributed-*.cjs`, tres suites
`tests/rules/distributed-*.test.cjs`, tres fixtures `tests/rules/fixtures/distributed-*.cjs`
y este informe. El documento índice friendship-cycle-design.md enlaza este resultado.
No se modificó el prototipo fallido anterior: queda reproducible como evidencia.

Las alternativas B/C siguen sin prototipar ni medir: no se descartan por inviables,
pero no hay evidencia para elegirlas. D no conserva el único commit solicitado
sin revisión contractual. E es una optimización equivalente demostrada para el
despacho INVITE, no una solución demostrada al fallo conjunto de CREATE.

Dictamen final: A = NO-GO para uso en la composición actual; B = NO-GO para integrar
friendship-cycle completo. Etapa 6 sigue detenida para revisión. No se redujeron
garantías, expectativas ni máximo de invitados. Ninguna integración se realizó.
