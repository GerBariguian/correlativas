# Segunda invitación independiente: control transaction/batch

Fecha: 2026-09-30. STOP para revisión. No integración ni optimización.

## Control reproducible

`node scripts/test-independent-invitations.cjs --second-control`

Runner exclusivamente demo-correlativas-rules / 127.0.0.1:8088. Rules compuestas idénticas en los seis casos. En cada preparación independiente: limpiar Emulator, misma fábrica inputs(orientación), CREATE base y primera activación mediante activate/runTransaction. Se comprueban parent serial 1, invitado one, Activity jp_p_1 occurrence 1 y ausencia de jp_p_2. Las preparaciones A/B se comparan excluyendo únicamente timestamps generados por el servidor; la fixture también se verifica inalterada tras preparación.

Ambas escrituras usan los mismos transition y notice. A lee dentro de la transacción parent, ambas orientaciones de friendship, migrationUsers del actor y su instancia. B lee parent antes del batch. Ambas escriben parent completo + users/two/activityInbox/jp_p_2 con timestamps de servidor. No cambia el payload académico ni los ciclos. No se intentan invitaciones 3/4.

## Resultado actual

| Orientación | Segunda transaction | Segunda batch |
| --- | --- | --- |
| Directa | FAIL | FAIL |
| Inversa | FAIL | FAIL |
| Mixta | FAIL | FAIL |

6 tests, 0 PASS, 6 FAIL: se conserva la expectativa de éxito del camino válido, no se invierte para obtener verde. Todas las aserciones de preparación, equivalencia y preservación pasan antes de esa expectativa final.

Error en ambos: `permission-denied`, `7 PERMISSION_DENIED`, `Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached.`

Los mensajes transaction incluyen update L726/L780 y create L928; batch también enumera create L713. Son líneas del artefacto compuesto, no posiciones de firestore.rules productivas. Transaction añade entradas false for get por sus lecturas. En los seis errores devueltos no aparece texto `Service call error`, `getAfter` ni un mensaje explícito de exceso de access calls. Esto no mide presupuesto ni demuestra ausencia de uso de getAfter: las Rules sí lo usan.

Después de cada rechazo: parent idéntico (incluidos timestamps), invitationSerial=1, inviteeIds=[one], occurrence de one=1; occurrence two ausente; Activity 2 inexistente; Activity 1 íntegra e idéntica. Sin rollback de lo confirmado ni escritura parcial.

Evidencia local: `.tools/independent-second-control.log`. El control pendiente previo también había rechazado batch 2; aquella ejecución tuvo 6 entradas, 1 PASS y 5 FAIL incluyendo el contenedor de tres orientaciones. No sumar esos resultados como casos independientes de este control.

## Alcance causal

Demostrado: cambiar transaction por batch NO explica ni elimina el rechazo. El mismo compuesto acepta transición 0→1 y rechaza 1→2 en esta fixture. No se detectó mutación de la fixture durante preparación; se reconstruye en cada caso.

Inspección estática sin modificar helpers: inviteInstanceMember selecciona el destinatario comparando occurrences por posición. Para el primero toma ids[0]; para el segundo evalúa una comparación adicional antes de invitationFor. El parent crece en inviteeIds, participants, invitedBy, invitationCycles e invitationOccurrences; validInstancePlanShape vuelve a verificar sus relaciones de conjuntos. invitationFor evalúa una sola vez el destinatario elegido. versionedNoticeRequired apunta al nuevo aviso; no recorre Activities anteriores. La Activity nueva valida la transición del parent y el ciclo actual. Permanecen cargadas las ramas compuestas legacy, JOIN y friendship Activity.

Esto identifica diferencias reales entre 0→1 y 1→2, pero NO aísla cuál consume el límite o si existe un rechazo lógico previo que obliga a evaluar otras ramas. No se atribuye causalidad exclusiva al tamaño del parent, al despacho, a Activity previa, al caché ni a una rama concreta. El texto de exhaustion no constituye una calibración de access calls. No se ha demostrado contaminación compartida como causa del rechazo.

El primer intento del NUEVO control tuvo un error de instrumentación: withSecurityRulesDisabled no retorna el resultado del callback. snapshot devolvía undefined antes de intentar la segunda invitación. Se corrigió guardando el resultado local del callback; sin cambiar fixtures, Rules o condiciones de producto. Los seis resultados arriba son posteriores a esa corrección. No explica los rechazos anteriores.

## STOP y siguiente pregunta

¿Qué rama del compuesto alcanza el límite al pasar de una a dos invitaciones, y hay algún rechazo lógico anterior al agotamiento? Proponer primero observación de trazas/cobertura de evaluación, sin quitar checks ni cambiar arquitectura. No reemplazar el servicio por batch.

Archivos de esta reanudación: nuevo tests/rules/independent-second-control.test.cjs, selector --second-control en scripts/test-independent-invitations.cjs y este documento. No se modificaron Rules, servicios, UI o migración; todo el diff previo se conserva. SHA256 de firestore.rules: 7603410d26a3fa519f69e6d71153b98b3b28faf6e9bbe72ad09efc8234696c6b.

NO-GO del prototipo actual. No es una demostración de imposibilidad universal del contrato de invitaciones independientes. Protected new-account bootstrap sigue como release blocker separado. Sin producción, publicación, deploy, commit, push ni Etapa 7.
