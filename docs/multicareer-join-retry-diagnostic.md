# Etapa 6 — diagnóstico UPDATE/JOIN, concurrencia y retry

Fecha: 2026-09-29. Base `96de41a`, working tree acumulado preservado.
Fase exclusivamente diagnóstica: no se modificaron servicios productivos,
`firestore.rules`, create E, subjectChecks, sharing ni UI.
Rules reales SHA256 `7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b`.

## 1. Servicio real y frontera de integración

`src/services/jointPlans.js:updatePlanMembership(uid,id,join)` captura la sesión,
ejecuta `runTransaction`, lee solamente `jointPlans/{id}` mediante `tx.get`,
comprueba existencia/sesión y llama a `changePlanMembership` dentro del callback.
Escribe memberIds/inviteeIds calculados desde esa lectura y updatedAt. El helper
en `src/jointPlanLogic.js` conserva el resto de miembros y deduplica el UID.
No hay batch ciego ni cálculo del conjunto fuera del callback transaccional.

**Es todavía el servicio legacy**: no recibe careerInstanceId, no lee control
ni metadata y no construye participants/bindings v2. Una llamada fresca real
contra un plan v2 unresolved se rechaza. No es una regresión nueva de retry:
es integración de Etapa 6 todavía pendiente. La prueba concurrente anterior
construía el payload v2 dentro del test, no llamaba a este servicio.

JOIN no crea/modifica Activity. Retirarse (`join=false`) elimina el notice propio
en la misma transacción que cambia membership. CREATE/INVITE conservan sus avisos
atómicos; esta fase no generaliza ningún mecanismo a esas operaciones.

## 2. SDK instalado y versionado real

Firebase 12.15.0, código local auditado:

- `node_modules/@firebase/firestore/dist/common-1409c9f9.node.cjs.js`:
  `Transaction.lookup/recordVersion/preconditionForUpdate`, `TransactionRunner`,
  `isPermanentError`.
- `node_modules/@firebase/firestore/dist/index.node.cjs.js`: maxAttempts default 5.

`tx.get` registra la versión; UPDATE lleva precondición updateTime. No se encontró
un detalle del servicio que impida registrar la lectura. El runner reintenta
FirebaseError aborted, failed-precondition, already-exists y errores no permanentes
(cancelled, unknown, deadline-exceeded, resource-exhausted, internal, unavailable,
unauthenticated), hasta el límite. **permission-denied es permanente**. Un Error
de aplicación común tampoco se convierte automáticamente en retry.

La fixture del SDK lanza aborted/failed-precondition/already-exists/unavailable
una sola vez y observa dos callbacks; permission-denied produce uno. Es un test
del clasificador, no una simulación de un conflicto real del servidor.

Separadamente, un contador bajo Rules aisladas que permiten ese UPDATE provoca
un conflicto real de versión entre read y commit: callbacks leen 0 y luego 1;
el resultado es 2. Demuestra retry real. Esa Rule de contador **no es propuesta
para JOIN** y nunca se carga en la aplicación.

## 3. Stale versus fresco, sin transiciones obsoletas aceptadas

Todos los planes de la matriz tienen owner + cuatro invitados. El tamaño indica
miembros ya aceptados, no cantidad de invitados.

| Miembros previos | JOIN fresco real | Payload stale real | Nueva invocación con relectura |
|---|---|---|---|
| 1 | ALLOW, quedan 2 | DENY tras ingreso de otro | ALLOW, quedan 3 |
| 2 | ALLOW, quedan 3 | DENY tras ingreso de otro | ALLOW, quedan 4 |
| 3 | ALLOW, quedan 4 | DENY tras ingreso de otro | ALLOW, quedan 5 |
| 4 | ALLOW, quedan 5 | DENY: mismo UID ya ingresó en otra operación | No requiere otra escritura |

En tamaño 4 queda un solo invitado sin aceptar: no se inventa un sexto usuario
contractual para simular dos ingresos distintos. Un test adicional demuestra
que un sexto participante no puede ingresar al plan lleno.

El escenario stale construye el payload desde la lectura anterior y lo envía
con updateDoc después del ganador, sin relectura. Debe seguir rechazándose.

## 4. Operaciones solapadas y causa del error

Se fuerza un interleaving determinista: A lee; antes de su commit B ejecuta y
confirma un JOIN completo; A intenta confirmar lo calculado antes. Se prueba
tanto con el servicio legacy real importado sin modificar como con un builder
v2 explícitamente aislado (sin retry manual).

Ambos casos producen:

1. A lee `[owner]`.
2. B lee `[owner]` y confirma `[owner,B]`.
3. A recibe permission-denied; su callback no se ejecuta otra vez.
4. Permanece `[owner,B]`, sin binding parcial de A.
5. Una **nueva invocación diagnóstica**, que lee `[owner,B]`, confirma `[owner,B,A]`.

La última invocación no es retry automático ni reenvío del payload stale. No se
integró en el servicio. El estado que A pretendía escribir primero perdía B y su
binding; el rechazo es correcto. Lo que falta para completar la intención válida
es recuperación segura/relectura, no permisividad en Rules. La respuesta observada
es permission-denied incluso con precondiciones transaccionales correctas; por
eso el clasificador del SDK termina la operación. Esto describe Emulator local,
no una medición del orden interno de evaluación de producción.

## 5. Expresiones: evidencia y límites de la conclusión

JOIN fresco pasa con 1–4 miembros. En el rechazo stale real aparece el mensaje
de 1000 expresiones. Se generaron únicamente en memoria fixtures que desactivan
ramas alternativas de UPDATE, dejando intactos el schema y predicado JOIN:

| Ramas conservadas junto a JOIN | Rechaza stale | Mensaje 1000 expresiones |
|---|---|---|
| Ninguna alternativa | Sí | No |
| Close/retirement | Sí | No |
| Invite | Sí | Sí |
| Legacy | Sí | Sí |
| Close + Invite | Sí | Sí |
| Close + Legacy | Sí | Sí |
| Invite + Legacy | Sí | Sí |
| Todas (Rules reales) | Sí | Sí |

El costo de las rutas alternativas de rechazo contribuye al mensaje; no hay
evidencia de que JOIN fresco requiera cambiar de arquitectura. Quitar las otras
ramas no hace válido el stale. No se propone desactivar permisos productivos:
las fixtures son instrumentos de diagnóstico, no Rules para publicar.
No existe contador exacto de expresiones en esta evidencia: no se afirma margen
numérico ni generalización a todas las operaciones UPDATE.

## 6. Access calls, separados de expresiones

El JOIN permitido consulta dos documentos de autorización: control propio
(`proposalAuthority`, getAfter) e instancia propia del binding (getAfter).
La lectura del plan se autoriza por resource/membership sin lookup académico.
Referencias repetidas al mismo control se benefician de la caché observada.
JOIN tiene una sola escritura: no fan-out de Activity ni otro write al presupuesto
agregado de 20. Las lecturas SDK no se confunden con get/getAfter de Rules.

Fixture con Rules reales + ocho lecturas nuevas, distintas y existentes:
**ALLOW (2+8=10)**. Con nueve: **DENY (2+9=11)**. Se repite con sólo la rama JOIN.
El log Java de la denegación señala `Service call error` en diagnosticLookups/p8
(noveno probe), aun cuando el mensaje superior pueda incluir también expressions.
No se infiere la causa únicamente de permission-denied.

Calibración independiente repetida: 10 ALLOW, 11 DENY, batch 7+7+6 ALLOW,
7+7+7 DENY. Es evidencia del presupuesto y conteo auditado, no telemetría de
facturación ni permiso para aumentar el costo del protocolo.

## 7. Carreras concurrentes y Activity

| Cambio entre lectura y commit | Resultado observado | Recuperación correcta |
|---|---|---|
| Otro JOIN válido | Stale DENY; nueva lectura permite ingresar | Candidato a recuperación acotada |
| Close | DENY | Abortar; no reabrir |
| Archive del joiner | DENY | Abortar mientras archivada |
| Restore de esa instancia | ALLOW si plan sigue abierto | Revalidar identidad/catálogo/lifecycle |
| Close + restore | DENY, permanece cerrado | Abortar |
| Retiro de amistad | ALLOW con invitación vigente | No agregar una condición académica nueva |
| Retiro de invitación | DENY | Abortar |
| Authority frozen | DENY | Abortar |
| Catálogo incompatible | DENY | Abortar |
| Doble JOIN propio | Uno ALLOW; duplicado v2 DENY | Confirmar mismo binding y devolver no-op en futuro servicio |
| Dos últimos invitados | Con relectura quedan cinco | Nunca agregar sexto ni descartar miembro |

No existe API de revocación de amistad ni retiro v2 integrada; esos cambios se
simulan mediante admin **del harness local**. El catálogo es inmutable por cliente:
su alteración admin sólo es fixture defensiva, no lifecycle permitido.

Amistad es requisito de CREATE/INVITE, no de aceptación en las Rules actuales
legacy/v2. La prueba no demuestra que retirar amistad cancele invitaciones:
demuestra lo contrario. Si se desea esa semántica, requiere decisión explícita;
no se añade dentro de una corrección de retry. Membresía nunca concede sharing.

JOIN real legacy y builder v2 conservan exactamente los cuatro notices existentes,
incluidos target/readAt/createdAt. No hay duplicación ni actividad huérfana causada
por JOIN. No se cambió readAt ni el protocolo de CREATE/INVITE.

## 8. Clasificación y recomendación (diseño, no implementación)

**Resultado 1 para JOIN fresco v2**: no se reprodujo un bloqueo de disponibilidad
por expresiones/access calls; la intención concurrente falla por transición stale
y clasificación no retryable de permission-denied. **Resultado 5** para cierres,
archivados, invitaciones retiradas, authority incompatible y catálogo incompatible.
No se demostró resultado 2, 3 ni 4. La ausencia de bindings en el servicio real es
trabajo pendiente independiente, no un detalle que impida detectar versiones.

Alternativas:

- Reintento explícito por el usuario: mínimo y seguro si es una nueva operación
  completa; conserva error visible ante concurrencia y no cumple recuperación automática.
- Recuperación acotada en el futuro servicio v2: recomendada para evaluar/integrar
  tras aprobación. No cambia Rules y nunca reenvía la mutación previa.
- Reordenar/optimizar ramas de UPDATE: posible diagnóstico adicional para reducir
  ruido/costo de rechazos, pero no hace retryable permission-denied. No es necesario
  como solución del JOIN fresco y no se integra en esta fase.

Diseño recomendado de recuperación:

1. Recibir UID, planId y careerInstanceId explícitos; capturar sesión. No selección.
2. Una transacción lee plan/control/metadata propios, valida invitación, authority,
   catálogo, lifecycle, plan abierto y binding permitido; reconstruye memberIds y
   participants desde esa lectura. No acepta reasignar otro binding.
3. Si ya está unido con exactamente ese binding y contexto válido, no escribir:
   resultado idempotente comprobado. No interpretar cualquier denial como éxito.
4. Ante permission-denied, **no retry por el código solamente**. Hacer una lectura
   nueva autorizada y coherente. Si falla, abortar. Comparar con el intento: sólo
   admisible un avance compatible de otros miembros/bindings, sin retiro, rebind,
   cambios de catálogo/owner/invitación propia/closed/deleting ni cambios de authority
   o lifecycle propios. Conservar exactamente los demás campos y participantes.
5. Si no hay prueba de esa carrera estrecha, preservar el error. No clasificar el
   mensaje de 1000 expresiones como código retryable ni ocultar fallos de seguridad.
6. Sólo ante la carrera reconocida iniciar una segunda runTransaction completa,
   que **vuelve a leer** y validar todo. Las lecturas de reconocimiento nunca
   autorizan el commit. Rules vuelve a decidir; archive/close/authority pueden
   cambiar otra vez y deben bloquearlo normalmente.
7. Máximo dos invocaciones externas (un intento adicional); mantener explícito el
   límite interno SDK de cinco. Máximo diez callbacks, sin bucle hasta éxito.
   Abort/not-available/conflict conservan diagnóstico y no producen fallback legacy.
8. No tocar Activity en JOIN ni compartir este recovery genéricamente con
   create/invite/leave. No cambios de progreso, sharing ni bindings ajenos.

Este reconocimiento no puede probar la causa interna exacta de un denial remoto:
sólo demuestra un cambio concurrente estrecho y revalida condiciones conocidas.
Si se exige certeza absoluta del motivo antes de otro intento, elegir reintento
explícito. En ambas alternativas la seguridad depende siempre de las Rules del
nuevo commit, no de la interpretación del cliente.

**GO técnico para proponer la integración de JOIN v2 + recuperación acotada, sujeto
a aprobación y pruebas adversariales del código futuro.** No hay solución integrada
ni GO de Etapa 6/Etapa 7. Bootstrap protegido sigue RELEASE BLOCKER de v1.16.

## 9. Reproducibilidad y alcance de archivos

Archivos de esta fase: este documento, `tests/rules/joint-join-diagnostic.test.cjs`,
flag opt-in `--social-join-diagnostic-only` en `scripts/test-rules.cjs`, y referencia
en el checkpoint. El runner default no incorpora fixtures diagnósticas.
El test anterior de dos JOIN queda intacto/fallando: no se rebajó su expectativa.

Ejecutar sólo contra el demo aislado, con el workaround Java local documentado
en el checkpoint si el entorno lo requiere:

```powershell
node scripts/test-rules.cjs --social-join-diagnostic-only
node scripts/test-rules.cjs --social-invite-real-only
npm.cmd test
npm.cmd run build
git diff --check
git status --short
```

No producción, publicación, migración real, commit, push, deploy ni Etapa 7.

## 10. Validación final de esta fase

| Ejecución | Resultado nuevo |
|---|---|
| Diagnóstico + calibración, después de la última modificación de tests | **57/57 PASS** |
| Invite/join original, sin modificar expectativas | **30: 28 PASS, 2 FAIL**, cero cancelados |
| Node completo | **693/693 PASS** |
| Build normal | **PASS**, advertencia de bundle >500 kB |
| git diff --check | **PASS** |

Los 57 incluyen contenedores: matrices fresh/stale 18, servicio/operaciones 14,
access padding 4, aislamiento de ramas 7, conflicto real de versión 1,
restore/close 3, clasificador SDK 6 y calibración independiente 4.
Los dos fallos originales son el caso concurrente y su contenedor, no dos fallos
académicos independientes. Su estado final es owner+two con binding two resolved
y one unresolved. Los otros 13 positivos y 15 rechazos pasan.

Una repetición intermedia de la suite original terminó tras timeout con
15 PASS, 13 FAIL y 2 cancelados, y fallos posteriores al cancelar el contenedor.
Se descartó como comparación funcional y se repitió en Emulator limpio, obteniendo
28/2 sin cancelaciones. No se oculta ni se cuenta como validación exitosa.
No se ejecutó consolidado completo: no lo requiere esta fase diagnóstica.
No se presentan resultados históricos de create E/subjects como regresiones nuevas.
