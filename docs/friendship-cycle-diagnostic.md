# Friendship cycle: cierre del diagnóstico aislado

Fecha: 2026-09-30. Base: 96de41a + working tree acumulado. No integración.

Actualización posterior: [cierre de la composición distribuida](distributed-versioned-invitations-design.md).
La nueva matriz conjunta terminó 137 entradas, 133 PASS / 4 FAIL: CREATE con cuatro
invitados falla en directa/inversa/mixta al cargar invitation, JOIN y friendship
Activity juntas. Los errores incluyen service-call error y 1000 expressions;
la causa primaria no se aisló experimentalmente antes del STOP. No confundirlo
con la contaminación de fixtures diagnosticada abajo, ni extrapolar el presupuesto
del núcleo a la composición. No se modificaron Rules ni servicios productivos.

## 1. Causa reproducible de los dos fallos base + 1

La fábrica `fixture()` de `tests/rules/joint-join-diagnostic.test.cjs` asignaba
el MISMO objeto `metadata` a todas las rutas de instancia y todas sus ejecuciones.
El caso negativo `archived` de `friendship-cycle-design.test.cjs` mutaba ese objeto.
Los siguientes casos, incluidos base + 1, sembraban instancias archivadas.
`clearFirestore()` limpia Firestore, no ese objeto JavaScript en memoria.

La reproducción independiente cargaba una nueva fábrica y corría antes del caso
que la contaminaba: por eso pasaba con Rules idénticas. La captura de entries del
caso original confirmó lifecycle archived para todos los UID, incluido four.
No era agotamiento de access calls, caching ni expresión del camino válido.

Corrección: `{ ...metadata }` por instancia en la fábrica. No modifica permisos.
La regresión reconstruye explícitamente la fábrica rota y demuestra contaminación
entre usuarios y entre casos; luego exige aislamiento con la fábrica corregida.
Los tests originales conservan sus expectativas. Los controles campo ok/allowed
y padding antes/después de JOIN también pasan; no eran la causa.

## 2. Requests opuestas: observación y causa acotada

Variante antigua: A escribe a:b y B escribe b:a, cada una exige existsAfter de la
ruta que está escribiendo la otra. Los fallos simultáneos observados son
permission-denied / Service call error en esas lecturas cruzadas, no un conflicto
aborted que el SDK reintente. El error no señala expressions ni límite de calls.
Cuando una escritura termina primero, la segunda observa que la inversa existe y
se rechaza. No se observó doble relación ni certificado huérfano.

Control sin certificado (SOLO diagnóstico, NO candidato): también presenta doble
rechazo. La reserva de cycle no es condición necesaria del problema. Esto localiza
el conflicto en la validación cruzada de dos rutas, no en unicidad del token.
Contención/espera circular de lecturas es una explicación compatible con los logs;
no se afirma haber instrumentado internamente locks del Emulator ni probar que el
servidor remoto use el mismo mecanismo. No hubo acceso remoto.

## 3. Solución prototipada: identidad canónica demostrada por Rules

Para dos UID restringidos al alfabeto ASCII existente, participants debe cumplir
participants[0] < participants[1]. El Emulator acepta esa comparación de strings.
relationshipId es su concatenación con ':'. Sender/recipient son campos separados
y pueden invertir sus roles en un ciclo posterior. Rules rechaza b:a para a < b,
no depende de que el cliente ordene honestamente.

Ambas solicitudes normales leen y escriben el MISMO documento canónico dentro de
una transaction. No hay lookup de orientación inversa en CREATE de esta variante.
La garantía de unicidad se obtiene de identidad + validación de orden, no de
permitir dos orientaciones y esperar que no coincidan.

El certificado sigue atómico y necesario: nunca reutilizable, no update/delete,
misma pareja/ciclo/source transition. El perdedor no deja certificado. Se probaron
certificado ausente, incorrecto, pareja incorrecta, actor falsificado, ciclo usado,
cambio de ciclo accepted y orientación inversa maliciosa.

## 4. Semántica del perdedor y retry

La función aislada transactionalRequest usa máximo 5 callbacks SDK y NO añade
retry externo de escritura. Relee estado en cada callback. Si hay pending/accepted
vigente, devuelve existing-request sin escribir. Nunca acepta automáticamente.

Si Rules produce permission-denied, una relectura del documento canónico puede
reconocer una request pending coherente de esa pareja. Devuelve recognized-request,
NO created. Valida participantes, sender/recipient distintos y cycleId estructural.
Sin esa evidencia propaga el error. No crea otro certificado, no cambia orientación
ni transforma una denegación en una escritura autorizada.

En las carreras observadas el SDK ejecutó un callback por solicitante; la operación
perdedora fue permission-denied y se reconoció mediante lectura. No se afirma que
se haya observado retry SDK en estas carreras. El test comprueba estado persistido:
una request pending, un certificado del ganador y cero autoaccept.

## 5. Calibración separada y caching

Misma base para N=0 y cada N siguiente. Se añaden rutas existentes independientes,
con igualdad booleana constante. No se convierten helpers en un contador de calls.
En JOIN la calibración elimina ramas alternativas SOLO en memoria. La fixture
funcional completa se prueba por separado. No es una propuesta de quitar permisos.

| Operación representada | Barrido | Último N PASS | Primer N DENY |
|---|---|---:|---:|
| CREATE friendship + certificado: padding en friendship | 0..11 | 9 | 10 |
| Mismo commit: padding en certificado | 0..11 | 9 | 10 |
| ACCEPT sin Activity | 0..11 | 10 | 11 |
| WITHDRAW | 0..11 | 10 | 11 |
| JOIN quinto participante, invitedBy != owner, directo | 0..8 | 6 | 7 |
| Mismo JOIN, inverso | 0..8 | 6 | 7 |

Estas son fronteras efectivas observadas, con caching de las lecturas del commit.
JOIN se comporta como una base efectiva de 4 sobre el límite individual de 10;
cada write de CREATE, como 1; ACCEPT/WITHDRAW del núcleo, como 0. No son cifras de
facturación ni el número textual de get/getAfter. La verificación agregada añade
probes distintos en ambos writes y un tercer write para contrastar 20/21.

LIMITACIÓN: CREATE/ACCEPT aquí NO incluyen avisos versionados. CREATE/INVITE Joint
Plan con cycle + occurrence + Activity nueva no está representado completamente.
Su presupuesto sigue NO DETERMINADO. Los números históricos de CREATE E no lo
certifican. No aprobar todo el diseño a partir del núcleo parcial.

## 6. Expressions, stale y ataques

JOIN válido con todas las ramas pasa en ambas orientaciones, con cuatro miembros
previos y el quinto entrando, invitador miembro distinto del owner, instancia activa
y authority instances. No se observó expression exhaustion en esos caminos.

Mismatch, withdrawn, stale invitation C1 bajo C2, amistad solo con owner, payload
que pierde miembros y spoof de invitedBy: DENY y plan sin cambios. Se prueba tanto
con todas las ramas como con JOIN aislado. Las ramas completas pueden alcanzar
1000 expressions; aisladas rechazan sin ese mensaje. Esto no vuelve válidos los
ataques ni indica que el camino válido agote el presupuesto.

Riesgo: más costo de evaluación y peor diagnóstico ante peticiones inválidas;
permission-denied no identifica por sí solo la causa. No se probó DoS ni carga
remota. No se relaja una validación ni se autoriza retry ciego para evitar mensajes.

## 7. Activity, legacy y alcance de las pruebas

fr_{cycleId}/fa_{cycleId}: como máximo un evento de cada tipo por ciclo; jp_{planId}
_{occurrence}: un evento por destinatario/ocurrencia. Token global no reutilizable
y contador no reiniciable evitan colisiones históricas. El separador final es
inequívoco si occurrence es entero decimal y se usa target explícito, no se confía
en parsear el ID como autorización. Retener historia implica crecimiento del inbox
a lo largo de ciclos; paginación/retención deben contemplarlo. No hay fan-out
obligatorio de retirada. IDs únicos solos NO demuestran autorización: sigue
pendiente probar source transition + aviso, replay/readAt y presupuesto completos.

Canonicalización requiere normalizar administrativamente relaciones legacy inversas
antes de habilitar el nuevo CREATE; no habilitar una mezcla que deje dos identidades.
Resolver conflictos, mantener checkpoints y referencias históricas/Activity o alias
no autoritativos, con clientes viejos bloqueados durante transición. Se puede
asignar cycle inicial sin certificar historia antigua. Invitaciones sin cycle siguen
cerradas hasta reinvitación. No se ejecutó ni diseñó aquí el migrador completo.

## 8. Dictamen y evidencia final

Última ejecución posterior a la corrección de fixtures:

| Variante, 12 carreras cada una | Gana A | Gana B | Ambas rechazadas | Dos relaciones |
|---|---:|---:|---:|---:|
| Dos orientaciones + certificado (anterior) | 2 | 5 | 5 | 0 |
| Dos orientaciones sin certificado (control no seguro para producto) | 1 | 1 | 10 | 0 |
| Canónica transaccional + certificado | 4 | 8 | 0 | 0 |

Canónica: 24 callbacks SDK para 24 llamadas, 12 permission-denied internos,
12 reconocimientos read-only, cero errores finales y un único certificado por
pareja. No se observó retry SDK ni escritura externa adicional. Es distribución
observada en esta ejecución; los resultados anteriores no se suman como si fueran
una única prueba posterior a la última modificación.

Suite original con expectativas intactas: 41 PASS / 2 FAIL de 43 entradas
(33 casos hoja PASS / 1 FAIL, más contenedores). Falla únicamente la carrera
antigua de dos orientaciones y su contenedor; los dos base + 1 pasan. La ejecución
anterior había pasado 43/43: esa observación no probaba disponibilidad estable.
La expectativa de exactamente un ganador permanece sin cambios. Nueva suite:
49/49 PASS (41 casos hoja, 8 contenedores).
Contiene 36 carreras y los barridos, no 49 ejecuciones independientes del producto.
CREATE agregado: base + 8 + 8 + 2 = 20 efectivos ALLOW; +3 = 21 DENY, sin mensaje
de expressions. Ambos límites individuales siguen respetados en esa comparación.

Rules productivas conservan SHA-256
`7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.
Solo scripts/tests/fixtures/documentación de diagnóstico. Logs bajo .tools y el
log del Emulator están ignorados por Git. Ninguna ejecución remota ni despliegue.

Los dos obstáculos concretos tienen explicación/prototipo: contaminación de fixtures
y dos rutas de relación con validaciones cruzadas. El modelo canónico mantiene
certificado y no-autoaccept sin retry indiscriminado. La matriz es evidencia local,
no probabilidad teórica ni prueba universal de disponibilidad.

NO-GO para integrar friendship-cycle COMPLETO: falta demostrar CREATE/INVITE con
cycle/occurrence y Activity versionada, incluyendo su presupuesto atómico. Es una
frontera pendiente de validación, no un límite nuevo demostrado en un camino válido.
No se integró este diseño en Rules, servicios o UI. Etapa 7 no iniciada. Bootstrap
protegido sigue siendo release blocker separado.
