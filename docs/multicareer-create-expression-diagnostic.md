# Etapa 6: diagnóstico aislado de expresiones de create v2

## Alcance y preservación

Diagnóstico local posterior al STOP. No se modificaron firestore.rules, servicios,
UI, schema, protocolo ni los cuatro tests funcionales fallidos. Se preservaron
saveJointSubject validado, baseline 10/11, prototipo y suites integradas.
SHA-256 de Rules antes/después:
`64e9275713f108ebb93320ec591d5b663edb5da80c9268534d71df32a54659a1`.

Fixtures inline en `tests/rules/joint-create-expressions.test.cjs`. Las variantes
`no*` ELIMINAN garantías exclusivamente para medir y nunca son candidatas a deploy.
Runner aislado: `node scripts/test-rules.cjs --social-expressions-only`.
Proyecto demo-correlativas-rules, localhost 127.0.0.1:8088, shutdown limpio.

## Causa localizada y límite de certeza

El fallo se localiza en la evaluación del permiso del documento padre: acumulación
de schema completo + bindings pendientes por invitado + comprobaciones de avisos
obligatorios desde el padre. Es un exceso de **expresiones**, no evidencia de
exceso de access calls. Quitar individualmente cualquiera de esos tres grupos
permite cuatro invitados. Quitar authority, friendship, schema o transición del
aviso NO permite tres invitados. Quitar sólo el acceso a la instancia owner tampoco.

Esto identifica una combinación costosa, no una validación única defectuosa.
No se obtuvo contador exacto de expresiones; no se inventa un costo por helper
ni se equipara latencia con expresiones. El mensaje de Emulator también menciona
otras ramas al denegar: eso por sí solo no prueba que esas ramas causen el exceso.
Los errores de permisos se registran; errores de transporte/configuración hacen
fallar el harness, no se convierten en una denegación diagnóstica aceptada.

## Frontera 0–4 y matriz de aislamiento

Cada fila se ensayó en directa, inversa y mixta, con idénticos resultados.
A = escritura válida aceptada; D = denegada. Cero está prohibido por el contrato
(`inviteeIds.size() >= 1`); no es un fallo de disponibilidad que resolver.

| Variante aislada | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Rules completas | D | A | A | D | D |
| Sin schema del plan | D | A | A | A | A |
| Sin bindings pendientes | D | A | A | A | A |
| Sin instancia owner | D | A | A | D | D |
| Sin authority en avisos | D | A | A | D | D |
| Sin friendship | D | A | A | D | D |
| Sin schema del aviso | D | A | A | D | D |
| Sin exigir aviso desde padre | D | A | A | A | A |
| Sin transición del aviso | D | A | A | D | D |
| Rama legacy create desactivada | D | A | A | D | D |
| Sin invariantes de arrays/mapas del plan | D | A | A | A | D |
| Binding obtenido con get/default | D | A | A | D | D |
| Binding extraído a helper | D | A | A | A | D |
| Invitee extraído a helper | D | A | A | D | D |
| Schema específico de creación | D | A | A | A | D |
| Combinación de los tres anteriores | D | A | A | A | D |
| Datos de create pasados como parámetro | D | A | A | D | D |
| Combinación + parámetro local | D | A | A | A | D |

En Rules completas el primer fallo válido es **3 invitados**, en las tres
orientaciones. Los casos de 3/4 emiten `maximum of 1000 expressions to evaluate
has been reached`. Los cuatro FAIL históricos permanecen intactos.

## Auditoría de helpers y crecimiento

- `validInstancePlanShape`: se invoca una vez en el permiso del padre. Coste
  estructural fijo más operaciones sobre listas/maps: keys, toSet, difference,
  union, hasAll/hasOnly. No se vuelve a llamar desde cada aviso. Compara members
  genéricamente aunque create luego exige exactamente `[request.auth.uid]`.
- `pendingBindingAt`: cuatro llamadas, con cortocircuito en slots ausentes.
  Cada slot ocupado repite cuatro veces la ruta participants[ids[index]] y dos
  veces keys. Crece por invitado; pasar el binding una vez a otro helper mejora
  la frontera observada, sin quitar comprobaciones.
- `validInvitee`: cuatro llamadas, repite ids[index], valida string/gramática,
  aviso obligatorio y autor de invitación. Su extracción sola no mueve frontera.
- `invitationRequired` -> `noticeRequired`: por invitado comprueba ausencia previa,
  aviso posterior y campos type/actor/target/time/readAt. Es el costo de Activity
  en la validación del padre. Mantener estas comprobaciones es obligatorio.
- `operationalBinding`: una instancia de owner en create, lifecycle activo y
  catalog coincidente, binding resolved. Coste aproximadamente constante respecto
  de cantidad de invitados; éstos comienzan unresolved y no fabrican instancias.
- `planInvitation`: una evaluación por aviso, con authority actor/destinatario,
  transición fuente, invitación e identidad del actor, y amistad directa/inversa.
  Repite authority del actor en distintos permisos. No revalida schema completo,
  no recorre todos los bindings y no llama validInstancePlanShape.
- `acceptedPlanningFriend`: corto circuito directa/inversa; la inversa puede
  requerir otra consulta, pero no cambia la frontera en esta matriz.
- `validAuthority`: valida contrato completo en cada permiso que lo requiere.
  Cachear documentos no equivale a cachear el resultado de todas las expresiones.
- `get/getAfter`: padre y avisos se enlazan en ambas direcciones. Son comprobaciones
  distintas (estado anterior/posterior), no duplicados eliminables por semejanza.
- Coexistencia legacy: `validPlan` rechaza el sobre v2 por sus claves. Desactivar
  sólo ese allow no mueve la frontera. Un guard explícito podría ahorrar trabajo
  en algunos rechazos, pero no se demostró solución ni se eliminó compatibilidad.

No hay bucle de validación de todos los participantes dentro de otro bucle de
participantes en estos helpers. El grafo fuente tiene expansión por slot O(n),
con operaciones internas sobre colecciones acotadas. **No se demostró O(n²)**
ni se conoce aquí la complejidad interna/cómputo de expresiones de toSet/keys.
No se presenta la repetición de authority entre avisos como crecimiento cuadrático.

## Refactorizaciones candidatas ensayadas, sin integración

1. Extraer el binding a un helper conserva keys exactas, null y unresolved,
   evita repetir la ruta. Mejora hasta tres, no cuatro.
2. Extraer id del invitado conserva gramática, aviso y atribución. No basta.
3. Schema especializado para create omite sólo consecuencias ya implicadas por
   owner=self, members=[self], owner fuera de invitees y closed=deleting=false:
   tipo/tamaño/unicidad/pertenencia de members y deleting=>closed. Mantiene todas
   las condiciones independientes. Sólo sería equivalente dentro de ESTE create,
   nunca como reemplazo general para update. Mejora hasta tres, no cuatro.
4. Pasar request.resource.data como parámetro conserva el mismo predicado;
   no mejora la frontera por sí solo.
5. Combinación: sigue sin aceptar cuatro. No es una solución validada.

## Casos válidos y ataques idénticos

Se corrieron 18 variantes × 3 orientaciones × 5 cantidades = **270 commits de
matriz**. Los tests comprueban la frontera observada; su verde NO convierte en
éxito funcional los DENY válidos de tres/cuatro invitados.

Rules actuales y fixture combinada recibieron los mismos **31 ataques**, cada
uno con uno y cuatro invitados: **124 denegaciones comprobadas**. Incluyen owner
e invitedBy spoof, duplicados/owner invitado, friendship ausente, authority owner
legacy/frozen/blocked/invalid, destinatario frozen/blocked/invalid, instancia ajena
o archivada, catálogo incorrecto, binding falsificado/faltante/extra, Activity
ausente/parcial/spoof/target/timestamp, schema extra/faltante, miembros incorrectos,
nombre de control, closed y deleting. Hay además **2 aceptaciones** del caso de
destinatario legacy pending con owner instances: compatibilidad social no es
acceso académico. La authority legacy del owner sigue rechazada.

Las denegaciones con cuatro pueden quedar enmascaradas por el presupuesto; por
eso se repite cada ataque con uno, donde el control válido sí pasa. Aun así una
lista de ataques no constituye una prueba formal de equivalencia para todo input.

Última ejecución: **146 tests PASS, 0 FAIL, 0 skipped/cancelled**:
18 tests de matriz + 2 contenedores + 126 subtests (124 ataques, 2 positivos).
Total de commits ensayados: **396**. No se repitieron Node/build porque no se
cambió código de aplicación. Los resultados anteriores no se presentan como
una nueva ejecución; save y las Rules reales permanecen byte por byte intactos.

## Alternativas descartadas, riesgos y decisión

Descartadas como soluciones: fixtures debilitadas, quitar Activity, friendship,
authority, bindings o schema; bajar participantes; fases/documentos auxiliares;
backend/Functions; usar selección como autorización. No se implementó ninguna.

Riesgos: no conocemos margen exacto; mejorar a tres no satisface máximo cuatro;
un refactor contextual no debe reutilizarse en update; fixtures debilitadas deben
permanecer fuera del runner consolidado y fuera de deploy. No se alteró el
bootstrap protegido, que sigue siendo release blocker.

**NO-GO para integrar una refactorización equivalente en este estado.**
Se localizó el crecimiento acumulado, pero ninguna variante equivalente ensayada
resuelve el máximo. No se afirma que sea matemáticamente imposible optimizar más.
Antes de otra ronda o un cambio de contrato corresponde revisar este diagnóstico.

Archivos de esta fase: nuevo test/fixtures inline y este informe; runner con
flag opt-in. Nada se integró en firestore.rules, servicios o UI. Sin producción,
migración real, publicación, commit, push, deploy ni Etapa 7.
