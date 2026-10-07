# Dispatch de invitaciones independientes — optimización aislada

Fecha: 2026-09-30. NO-GO para integración. STOP por reinvite válido con 1000 expressions.

## Mecanismo y alcance

Antes: inviteInstanceMember recorre posiciones de inviteeIds comparando invitationOccurrences[id] con invitationSerial; al encontrar coincidencia llama invitationFor. El diagnóstico previo localizó el cruce de umbral en la segunda posición dentro del compuesto acumulado.

Candidato aislado: campo invitationRecipient (null en CREATE base, UID en activation), despacho directo invitationFor(request.resource.data.invitationRecipient). No se reordena el array. El selector no autoriza: changed = after.invitationOccurrences.diff(before.invitationOccurrences).affectedKeys() debe tener size()==1 y hasOnly([uid]). Se conservan serial+1, occurrence==serial, todas las restricciones de diff de invitedBy/cycles/participants, pre/post de invitees, actor, authority, instancia activa/catalog/binding, ciclo y Activity en ambas direcciones. Se permite el campo sólo en shape y diff de invitación. Otros flujos conservan sus listas de campos permitidos; JOIN no lo modifica.

Equivalencia pretendida: el único cambio de occurrence identifica necesariamente uid; no basta declararlo. La nueva representación agrega un selector verificable, no un permiso. No se retira ningún chequeo anterior de invitationFor. Esto es argumento estructural y evidencia parcial, NO equivalencia integral demostrada: el camino de reinvite sigue fallando y todos los rechazos negativos observados incluyen exhaustion.

## Composición usada

optimized deriva de independent(original firestore.rules), que carga invitation activation + Activity + friendship-cycle canónico + authority/careerInstances/catalog/bindings + JOIN + friendship Activity. No usa una fixture reducida ni constantes true. Rules productivas permanecen intactas en esta fase.

## Resultados vigentes

- Matriz posicional: cuatro ubicaciones del NUEVO cuarto invitado PASS 4/4. Pre-state idéntico de tres invitados, serial3, mismos mapas, cycles, bindings y avisos; después serial4. La preparación de esta matriz es administrativa, no evidencia de transición 0→4.
- Flujo real: CREATE base y cuatro commits independientes PASS en directa, inversa y mixta. Serial4, cuatro avisos exactos. JOIN secuenciales hasta quinto miembro PASS en las tres orientaciones.
- Member invitando: directa/inversa PASS con invitedBy=one distinto del owner, eliminando la friendship owner↔two y usando one↔two. La relación de ese control se prepara administrativamente.
- Corpus comparativo: 29 ataques × old/optimized = 58 rechazos. Parent no cambia en cada rechazo. Incluye selector/occurrence falsificados, invitedBy, friendship pending/withdrawn, cycle erróneo, occurrence saltada/reutilizada, serial incorrecto, duplicado, dos occurrences cambiadas, binding ajeno, catalog/instance, archived/frozen/closed, capacidad excedida, Activity tipo/ausencia/recipient/actor/occurrence/cycle incorrectos, replay, cross-plan, source ausente, eliminación de invitado previo, cambio de cycle histórico.
- Importante: los 58 mensajes negativos incluyen 1000 expressions. Se acredita rechazo y preservación del parent, NO que cada check lógico haya causado el rechazo. Spoof-selector usa un ataque sobre occurrences para old (sin ese campo); no es payload idéntico entre representaciones. No presentar este corpus como equivalencia lógica exhaustivamente demostrada.
- Source→Activity y Activity→source: omitir cada mitad rechaza; las activaciones válidas nuevas pasan con ambas presentes. El rechazo negativo por exhaustion limita la atribución de causa.

## STOP exacto: reinvite

Secuencia real en orientación inversa canónica one:owner:

1. CREATE y primera invitación C1 PASS.
2. Withdrawal autenticado PASS.
3. JOIN con invitación vieja rechazado (mensaje con exhaustion).
4. Request C2 + usedFriendshipCycles + fr_C2 atómicos PASS.
5. Accept C2 + fa_C2 atómicos PASS.
6. JOIN viejo tras re-friend rechazado (exhaustion).
7. activateOptimized(owner,one), occurrence2 y C2: FAIL permission-denied, maximum of 1000 expressions.

Mensaje relevante: `Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached.` En artefacto optimizado: update L726/L776 y create L924, además de evaluation error y false for get. No se observa en ese error una demostración de exceso de access calls.

El fallo aparece en la activación de reinvite, no en request/accept C2. No se ejecutaron las aserciones posteriores de conservación histórica, stale occurrence y JOIN actual de ese test; no atribuirles PASS. No se aisló causalmente qué rama extra del reinvite cruza el límite. No hubo segunda ronda de optimización.

## Conteos y evidencia

Última ejecución completa de este gate: 63 tests, 62 PASS, 1 FAIL, 0 skipped. Son cinco tests superiores (incluido el contenedor del corpus) más 58 subtests. La matriz de posiciones vive dentro de un test; los tres flujos y JOIN dentro de otro. No sumar ejecuciones anteriores a este conteo.

Log ignorado: .tools/invitation-dispatch-member.log. Ejecución reproducible: node scripts/test-invitation-dispatch.cjs. Runner demo-correlativas-rules, loopback8088, configuración aislada existente. El runner terminó y Emulator se cerró. La suite ya programada continuó sus regresiones tras el test rojo; al inspeccionar el resultado se declaró STOP, sin nuevas rondas.

## Pendientes deliberados por STOP

- Concurrencia misma invitee/dos tabs, último cupo, withdrawal, close, archive, reinvite.
- Calibración de access calls: NO realizada; sin presupuesto ni margen atribuido.
- Conservación completa de Activity histórica/readAt C1/C2 bajo candidato, replay exhaustivo y navegación histórica.
- Reinvite exitoso y JOIN posterior vigente.
- Corpus lógico sin exhaustion y demostración integral de equivalencia.
- Compatibilidad legacy completa, integración productiva, UX y migración.

Capacity estructural y rechazo de over-capacity sí se probaron; capacidad concurrente NO. Friendship Activity C2 request/accept sí pasó; suite histórica completa de friendship Activity NO ejecutada. JOIN máximo de nuevas invitaciones sí pasó; JOIN después del reinvite fallido NO alcanzado. Ninguna afirmación de margen de expressions: sólo resultados observados.

## Archivos y decisión

Nuevos únicamente: tests/rules/fixtures/invitation-dispatch.cjs, tests/rules/invitation-dispatch.test.cjs, scripts/test-invitation-dispatch.cjs, docs/invitation-dispatch-optimization.md. Todo el diff previo conservado. firestore.rules SHA256 inalterado: 7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b.

NO-GO para integración. El dispatch explícito elimina la dependencia posicional en los controles 1–4, pero no satisface todos los caminos válidos del contrato. Recomendación: revisión del nuevo STOP de reinvite antes de autorizar cualquier diagnóstico adicional; no cambiar más código automáticamente.

Protected new-account bootstrap sigue como release blocker separado. Sin producción, Console, publicación de Rules, migración real, deploy, commit, push ni Etapa7.
