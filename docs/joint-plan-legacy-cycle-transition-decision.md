# Legacy → C: transición sin bypass de friendship cycles

Estado: decisión de diseño para revisión; no autoriza integración ni migración.
Fecha: 2026-10-01. Alcance exclusivo: transición de autoridad del plan.

## 1. Evidencia y amenaza

Fuentes: `joint-plan-c-expanded-review.md`, `joint-plan-discovery-decision.md`,
`joint-plan-discovery-prototype-report.md`, `joint-plan-operability-privacy-decision.md`,
`slot-prototype-report.md`, `member-edge-report.md`, `friendship-cycle-design.md`
y `multicareer-v1.16-contracts.md` (§ evidencia, controles y algoritmo contractual).
Los documentos antiguos describen alternativas descartadas: no sustituyen los
contratos posteriores de slots, edges y discovery.

Discovery D se conserva aprobado: ref privada, inmutable, solo descubrimiento;
CREATE garantiza owner ref y NEW recipient ref. Evidencia previa: 1 test Node,
20 gates, 29 negativos, una carrera y 31 probes. No reejecutada en esta fase.
Padding CREATE +7/+8 y NEW #1/#4 +9/+10 es observación de esos puntos de inyección,
no presupuesto disponible para añadir este protocolo.

Amenaza: convertir una invitación legacy pendiente en JOIN C por su mera presencia
en inviteeIds, Activity o un documento copiado. También convertir memberIds en
occupancy sin prueba suficiente. Ninguna de esas fuentes aisladas certifica C.

## 2. Recomendación única

**B: copia a un nuevo planId C, con freeze protegido y pendientes sujetos a nueva
invitación explícita.** La exigencia de reinvitación es una regla de la copia,
no una segunda ruta de migración. El origen queda histórico/no operativo.

No mantener dos fuentes escribibles ni convertir el documento original in-place.
No generar invitaciones durante la copia. Los miembros demostrados podrán tener
una vía de importación distinta de JOIN, pendiente del review de evidencia histórica.
Hasta aprobarla y probarla, ningún miembro puede importarse como current.

## 3. Comparación de alternativas

| Estrategia | Seguridad, recuperación y coste conceptual | Decisión |
|---|---|---|
| A: mismo P, upgrade | Reinterpreta enlaces y avisos antiguos; exige cambio privilegiado de schema y bloqueo de todos los hijos durante copia. Rollback puede revivir grants antiguos. | Descartar para esta transición. |
| B: nuevo P | Aísla contratos y permite validar destino no operativo. Conserva origen; necesita mapping y evita duplicación por reserva persistente. | Elegida. |
| C: wrapper | Dos estructuras para el mismo plan facilitan fallback y grants superpuestos; requiere demostrar precedencia en cada operación. | Descartar. |
| D: freeze + reinvitación | Correcta para pendientes. Aplicada a todos exigiría amistad nueva a miembros persistentes y podría expulsarlos de hecho. | Solo regla para pendientes dentro de B. |
| E: híbrido por estado | In-place para unos y copia para otros multiplica reglas de recuperación e identidades. | No adoptar múltiples protocolos. |
| F: conservar todo como archivo y crear plan vacío | Evita importación, pero pierde continuidad de miembros como resultado automático. | No sustituye migración de membership. |

Prioridad: seguridad y origen demostrado, idempotencia, recovery, claridad de Rules,
historia, UX y finalmente duplicación. Conservar P no justifica una ruta insegura.

## 4. Aislamiento de schema

La familia se decide antes de cualquier transición: legacy reconocido explícitamente
por su forma/versiones admitidas, o C con discriminador exacto e inmutable.
El prototipo usa schemaVersion 30; es un número experimental, no una reserva de
schema de release. Versiones desconocidas o formas mixtas: deny, no fallback legacy.

CREATE fija familia; UPDATE preserva familia. Ningún cliente puede añadir/quitar
discriminador para convertir legacy↔C. La copia crea otro P. Cada grant de hijos
verifica familia del padre: slots/O/index/edges C bajo legacy se rechazan; subjects
legacy y actualizaciones memberIds bajo C se rechazan. Auditar todos los matches:
un deny específico no neutraliza otro allow coincidente.

## 5. Authority de usuario y del plan

`migrationUsers/U` mantiene generación, fase y origin existentes. Operaciones nuevas
requieren control válido instances/complete de cada actor/target cuando lo exige C;
legacy o frozen no se reinterpretan como instances. Selección no autoriza.

La migración estructural requiere un control **por plan**, protegido del cliente.
Congelar al owner no congela a todos sus miembros. El operador local autorizado
coordina el plan; el owner no obtiene permiso para escribir controles ni instancias
ajenas. No se agrega backend online. Su futura ejecución exige autorización separada.

Cada binding se valida individualmente contra instancia propia, catálogo e identidad
ya legítimos. Authority del owner no certifica B. No es necesario que un pendiente
histórico haya migrado para conservarlo como historia; sí lo será cuando opere bajo C.

## 6. Owner

ownerId legacy prueba ownership histórico, no instancia actual ni operatividad.
Conservar el mismo owner en el mapping; no transferir propiedad para destrabar copia.
Si no se resuelve su binding, el destino no se activa: C exige ownerInstanceId.
Una instancia archivada puede ser binding histórico válido; no se finge activa.
El archivo del owner no suspende automáticamente a otros miembros operativos.

## 7. Joined members y occupancy

Separar tres afirmaciones: presencia histórica, membership/occupancy actual demostrada
y binding académico. memberIds aislado no completa las tres.

Un miembro con evidencia suficiente de JOIN persistente puede conservar membership
sin amistad actual: withdrawal posterior a JOIN no expulsa. No se inventa cycle ni
se simula una invitación/aceptación para importarlo. Binding unresolved impide uso
académico aunque la historia se conserve.

La vía futura de importación debe diferenciar **origen importado protegido** de
**origen JOIN por occurrence C**. No basta agregar un booleano enviado por cliente.
El certificado/origen, su identidad de occupancy estable y sus verificaciones se
definirán junto con la evidencia histórica. No escribir slots member sin esa vía.
Tampoco usar una O de invitación ficticia como identificador de importación.

El próximo blocker decide qué prueba clasifica a alguien como current, y cómo se
representa/verifica esa procedencia sin abrir un constructor alternativo al cliente.
Esta decisión solo fija el tratamiento de cada clasificación. Un resultado
unresolved nunca puede promocionarse mediante UI, refs o subjects.

## 8. Pending, invitedBy y ciclos

Pendiente legacy → historia/unresolved, nunca invitación C actionable. Requiere
**NEW C real** desde slot vacío, emisor actualmente autorizado, amistad accepted
con cycle actual, nueva O, Activity contractual y recipient ref atómicos.
REINVITE solo aplica después de existir una invitación C bajo su propio contrato;
no es un atajo para convertir el pendiente legacy.

invitedBy legacy se preserva como atribución histórica, no como certificado del
emisor actual. La amistad pre-cycle tampoco permite inventar un certificado para
una invitación pasada. Si la relación actual aún no tiene representación válida
de cycles, la nueva invitación permanece bloqueada; su transición social es una
dependencia separada, no se certifica por copiar el plan.

O ligada a C1 no revive en C2. Withdrawal antes de JOIN invalida la invitación;
withdrawal después de JOIN no expulsa al miembro ni concede sharing. El protocolo
de copia no altera estas reglas.

## 9. Bindings, catálogos y Subjects

Solo fuentes fuertes ya aprobadas: progreso privado, proyección privada,
activeCareerId legacy válido y consentimiento propio validado, con el alcance de
los contratos existentes. Esto no convierte la selección en autorización C.
Snapshot aislado, socialProfile, ownership, membership e invitaciones son insuficientes.
No crear una instancia para completar un roster. Resolver solo identidades legítimas.

Catálogo desconocido: preservar ID exacto y reportar catalog-unavailable, sin
similitud ni selección por defecto. No activar destino académico bajo otro catálogo.
Subjects legacy no prueban membership/cycle. Su futura conversión a edges depende
de membership y binding previamente probados; nunca al revés. No se diseña esa copia aquí.

## 10. Activity, discovery e historia

Conservar Activity antigua apuntando al P antiguo: no reescribir target ni readAt,
no convertirla en invitación C ni emitir avisos duplicados por miembros importados.
La navegación podrá mostrar historia o acceso no disponible según autorización;
un mapping no concede acceso al destino. Nueva invitación C genera su nuevo aviso.

Owner y miembros current demostrados necesitan refs privadas del nuevo P antes de
activación. El importador protegido comprueba/reutiliza su contenido exacto: conflicto
bloquea, no sobrescribe. No se amplía el constructor de refs del cliente.
Pending legacy no recibe ref nueva durante copia; la recibe mediante NEW genuino.
Refs residuales nunca autorizan. No añadir sourceKind ni metadata al payload D aprobado.

La historia se preserva en origen/manifiesto protegido. Preservación no significa
otorgar lectura a todo antiguo participante ni publicar evidencia privada del manifiesto.
Lecturas históricas concretas siguen necesitando su contrato; no resolver retención/borrado.

## 11. Identidad: mismo P frente a nuevo P

| Aspecto | In-place | Nuevo P elegido |
|---|---|---|
| Links | URL estable pero cambia significado/autorización | URL original histórica; enlace nuevo requiere autorización propia |
| Activity | Riesgo de interpretar aviso antiguo como operación nueva | Target original intacto; aviso C solo por operación C |
| Refs | Colisión semántica con el mismo ID | Ref nueva privada; antigua nunca redirige permisos |
| Historia | Versiones coexistiendo bajo un padre | Fuente preservada separadamente |
| Rules | Switch privilegiado con hijos heterogéneos | Familia inmutable y sin grants cruzados |
| Parciales | Documento activo puede quedar híbrido | Destino staged no operativo |
| Rollback | Tentación de regresar schema | No invertir schema ni reabrir origen |

## 12. Freeze con enforcement y publicación

Propuesta contractual **no implementada ni medida**: control protegido por plan,
con estados monotónicos legacy-open → frozen → retired y destino staged → active.
Reserva sourceP→targetP única en manifiesto protegido. Los nombres físicos finales
del control y su schema requieren prototipo, no son colecciones ya existentes.

1. Inventariar, reservar targetP una sola vez y registrar huellas/versiones.
2. Antes de copiar, desplegar en una etapa futura Rules capaces de bloquear TODAS
   las mutaciones del plan origen cuando frozen: padre, JOIN/invite, subjects y
   auxiliares. No basta control administrativo ni frozen del owner.
3. Activar freeze y releer fuentes. Escritura concurrente anterior queda incluida;
   posterior debe ser denegada. Una divergencia con inventario se reclasifica.
4. Clasificar separadamente ownership, membership, binding y pendientes. Copiar a
   destino staged con controles de origen protegidos; ningún cliente puede activarlo.
5. Validar integridad, correspondencias, refs y resolución completa requerida.
6. En un commit protegido publicar target active y source retired; revalidar controles
   y precondiciones. No hay ventana con ambas fuentes escribibles.

Todo grant C, incluidas lecturas y creación de hijos, debe negar el destino staged.
**closed no sustituye staging**: C cerrado puede conservar lecturas/release.
El gate de publicación agrega una obligación de autorización nueva. Su presupuesto
de access calls/expresiones NO está probado; no se atribuye margen de Discovery.
Si no cabe en composición, STOP y rediseño explícito, nunca quitarlo silenciosamente.

Los manifiestos no son API de cliente. Admin SDK elude Rules: seguridad administrativa
requiere herramienta acotada, precondiciones y auditoría; Rules solo prueban denegación
a clientes. No afirmar que protegen de un administrador arbitrario.

## 13. Parciales y disponibilidad

Ejemplo owner resolved, B resolved, C unresolved, D pending: preparar destino
staged; preservar C y D en historia, sin inventar occupancy ni liberar el lugar de C
para llenarlo con D. No activar automáticamente un roster que omite a un joined
cuya continuidad no pudo determinarse.

La política conservadora elegida es **publicación por plan una vez resuelta la
clasificación de sus joined**, aunque la copia y resolución sean incrementales.
No exige que todos estén académicamente activos: archive individual sigue permitido.
Un modelo operativo con C unresolved dentro de un slot requeriría otra representación
no existente en C; no lo damos por seguro. Si C sigue indeterminado, el plan sigue
congelado, con historia preservada y limitación visible. D no bloquea clasificación
de joined; después de publicación puede recibir NEW si existe lugar y cumple C.

## 14. Idempotencia y recovery

Manifiesto: sourceP, targetP reservado, versión de contrato, huellas de fuente,
clasificaciones y referencias a pruebas protegidas, asignación de slots/identidades
importadas cuando se aprueben, refs esperadas, checkpoints copied/verified/published.
Mapping/identidades inmutables; checkpoints monotónicos con CAS. No incluir tokens
ni datos académicos completos en logs. Índice sourceP único impide segundo destino.

Rerun lee manifiesto: coincide → verifica/reanuda; diverge → bloquea. Nunca regenera
P, occupancy, O, membership o cycle. No se emiten invitaciones como efecto de rerun.
Las NEW futuras se someten a sus controles de replay normales.

Antes de freeze, fallo no cambia autoridad. Después de freeze, fallo conserva el
origen autoritativo histórico pero NO escribible y destino staged denegado. No
descongelar automáticamente para recuperar disponibilidad. Tras cutover, recovery
solo hacia adelante o suspensión del destino; jamás reabrir JOIN legacy inseguro.
Rollback web debe ser a cliente compatible/read-only, no a Rules antiguas permisivas.
No borrar destinos parciales ni controles para reintentar: retención queda pendiente.

## 15. Clientes y coexistencia

v1.15 debe quedar bloqueado en origen frozen/retired y no reconocer ni mutar C.
`authority=legacy` de un invitado no exime el gate por plan. Schema flip y recreación
del origen están denegados; controles no desaparecen mediante cliente.

Cliente nuevo decide contrato por discriminador, muestra legacy como histórico o
migración pendiente, sin fallback de escritura. No dual-write. No resolver permisos
mediante ref, Activity o selección. E mantiene operatividad ajena no verificada.

Antes de habilitar withdrawal/re-friend con cycles no puede quedar una ruta de JOIN
legacy que permita revivir pendientes. El rollout debe congelar esas mutaciones de
invitación/JOIN legacy también en planes aún no copiados, o mantener deshabilitado
ese rollout social. No basta migrar solo algunos owners. Esta suspensión temporal
es requisito de seguridad y su alcance debe probarse con las Rules integradas.

## 16. Matriz de ataques

| Ataque | Bloqueo contractual |
|---|---|
| Pending legacy → JOIN C | No slot/O/cycle C; exige NEW real |
| Amistad histórica/stale → JOIN | Accepted actual y cycle exacto, sin puente legacy |
| Invitación C1 bajo C2 | Igualdad de cycle y reserva irreversible |
| memberIds fabrica occupancy | Importación protegida con prueba pendiente; cliente sin constructor |
| Owner fabrica binding ajeno | Validación individual de instancia legítima; owner no escribe control |
| Schema flip ambas direcciones | Discriminador inmutable; destino nuevo |
| Hijos C bajo legacy o writes legacy bajo C | Guards exclusivos del padre en todos los grants |
| Cliente viejo tras cutover | Origen retired, destino C; ambos rechazan su escritura |
| Rollback reabre legacy | Estados monotónicos y Rules compatibles; no reversión insegura |
| Activity como autoridad | Aviso no entra en predicado de JOIN/membership |
| Ref como autoridad | Solo descubrimiento; acceso al plan se evalúa aparte |
| Edge como membership | Edge depende de occupancy, nunca la crea |

## 17. Experimento mínimo para refutar la decisión — NO ejecutado

Prototipo aislado futuro, sin editar Rules productivas. Componer legacy+C+Discovery
con controles de freeze/publicación reales. Para la rama importada usar evidencia
establecida por harness protegido **solo tras definir su contrato**; no alegar que
el harness prueba por sí mismo la suficiencia de fuentes históricas.

Gates: pendiente legacy no JOIN; miembro importado demostrado conserva membership
sin ciclo ficticio aun sin amistad actual; NEW requiere cycle actual; C1 no revive;
v1.15 no escribe después de freeze/cutover; schema flip y mezcla de hijos rechazan;
destino parcial no admite lecturas/mutaciones de cliente; rerun tras cada checkpoint
no duplica identidades; rollback no reabre origen. Probar freeze contra JOIN/invite
concurrentes, divergencia manifest/index, owner spoof de binding, C unresolved,
catálogo desconocido, refs omitidas y ausencia de writes parciales.

Medir por separado access calls y expressions en CREATE, NEW #1..4, REINVITE, JOIN,
Subjects/edges, release y publicación; directa/inversa/no-owner donde corresponda.
Los probes anteriores no validan estas ramas. Un camino válido rechazado es STOP.

## 18. Fronteras, decisiones de producto y cierre

Pendiente de seguridad delegado: qué evidencia permite clasificar legacy joined como
membership actual persistente y cómo certifica una occupancy importada sin ciclo
ficticio. Hasta entonces importación current no implementable. No resolverlo mediante
invitación forzada, memberIds aislado ni privilegio implícito del owner.

Producto puede decidir textos de migración, presentación de links históricos y cómo
comunicar suspensión; no puede decidir saltar pruebas, descongelar JOIN inseguro o
presentar unresolved como current. La disponibilidad limitada del plan indeterminado
queda explícita para revisión, no oculta como migración completa.

Retención/delete y navegación histórica exhaustiva siguen pendientes separados.
Protected new-account bootstrap continúa RELEASE BLOCKER de v1.16.
Este diseño está listo para revisión de la estrategia; NO constituye GO de
integración, migración, Etapa 7 ni release. Nuevos gates de Rules e importación
requieren diseño de evidencia y prototipo posterior autorizado.

Solo se agrega este documento. Sin ejecución de tests, build ni Emulator en esta
fase de diseño; sin cambios de Rules, servicios, UI o datos. Working tree acumulado
preservado. STOP para revisión.

LEGACY CYCLE TRANSITION DECISION READY
