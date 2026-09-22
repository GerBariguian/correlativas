# Planificador inteligente — v1.14.0

Contrato final de las etapas 1, 2, 2.5, 3, 3.1 y 4. Las etapas de UI fueron
validadas manualmente en navegador. Planner prepara una selección para un período;
no es Proyectar carrera, no planifica finales ni estima graduación.

## Elegibilidad y temporalidad

`src/plannerLogic.js` reutiliza `canCourse`, `getStatus` y `missingCoursePrereqs`
de `logic.js`. Una candidata es una cursada Pendiente académicamente habilitada
con inicio no incompatible. No se corrige el progreso histórico recibido.

- `allowedStartTerms` prueba compatibilidad con metadata, nunca oferta real.
- Sin esa metadata el inicio es desconocido: se advierte sin penalizar ni bloquear.
- `durationPeriods` admite 1 o 2. `term: 'Anual'` reconoce 2 períodos legados.
  Otros valores de term no prueban duración ni oferta; year tampoco.
- Duración desconocida permanece desconocida. No se asume un período.
- Incompatibles, bloqueadas, actividades explícitas y estados ya avanzados se
  conservan en la selección, visibles/removibles, pero no contribuyen como cursadas.
- `projectionKind: 'activity'` excluye actividades de las candidatas y de N.
  No se reconocen por nombre, código ni horas.

`targetPeriod` requiere año entero 1..9999 y término 1C/2C. Estados ausentes son
Pendiente; requisitos ausentes son arrays vacíos según el contrato compartido.
Errores estructurales, metadata contradictoria, referencias desconocidas o a sí
misma y códigos duplicados devuelven `valid: false`, errores e impactos null.
Un código seleccionado inexistente se conserva con diagnóstico local.

## Dos horizontes, sin doble conteo

`evaluatePlannerSelection({ subjects, statusMap, selectedCodes, targetPeriod })`
retorna clasificación por código y estos impactos:

- `close`: regulariza únicamente seleccionadas válidas con duración conocida de
  un período. Incluye `regularizedCodes`, `newEligibility` y `partialProgress`.
- `completion`: regulariza todas las seleccionadas válidas, incluidas anuales y
  duración desconocida, sin fecha. `regularizedCodes` enumera esas cursadas.
  `newEligibility` es el total respecto del progreso real; `alreadyAtCloseCodes`
  identifica lo ya contabilizado al cierre; `additionalEligibility` es únicamente
  el incremento. `partialProgress` contiene objetivos todavía bloqueados al completar.
- `annualAdditional`: compatibilidad con las primeras etapas. Es el delta entre
  close y regularizar también anuales; no incluye duración desconocida. No es un
  tercer horizonte que deba sumarse ni un criterio independiente de ranking.
- `directDependencies`: relaciones de cursada tipadas y estado real del dependiente.
  Una relación directa no equivale a habilitación efectiva.

Cada efecto detalla `satisfied`, `remaining` y `contributors`; las habilitaciones
conjuntas tienen `synergy`. En el campo anual legado, satisfied enumera solo el
incremento, mientras contributors conserva la contribución conjunta desde progreso real.

No sumar close con el total de completion: usar additionalEligibility. UI separa
objetivos habilitados al cierre, adicionales al completar y parcialmente bloqueados.
No aprueba finales ni satisface approvedPrereqs mediante Regularizada. No completa
materias ya Cursando, no encadena consecuencias ni habilita el inicio de otra
seleccionada dentro de la hipótesis. Se excluyen de los objetivos todos los códigos
seleccionados, incluso inválidos. Inputs no se mutan y no se publica statusMap simulado.

## Evaluación preparada y sugerencias

`preparePlannerEvaluationContext` construye un snapshot congelado por búsqueda con
clasificaciones, faltantes base y dependientes. `evaluatePreparedPlannerSelection`
calcula el mismo resultado que la API pública independiente, evitando repetir
validaciones y clonar progreso por combinación. No hay caché global ni referencias
mutables compartidas con inputs/resultados. Memoria proporcional al catálogo más
resultados temporales y las claves de combinaciones limitadas por presupuesto.

`src/plannerSuggestions.js` exporta `suggestPlannerSelection`,
`summarizePlannerImpact` y `comparePlannerSelections`. No redefine reglas académicas.
Ranking lexicográfico:

1. Nuevas habilitaciones al cierre.
2. Habilitaciones adicionales al completar todas las seleccionadas.
3. Pares únicos dependiente/tipo/requisito satisfecho de completion.partialProgress.
4. Dependientes directos pendientes únicos fuera de la combinación.

El tercer criterio excluye objetivos completamente habilitados. El cuarto puede
incluir actividades dependientes como relación estructural, nunca como candidatas.
No se usan horas, dificultad ni duración desconocida como penalización.

En empate se conserva más de la selección actual si tiene tamaño efectivo N;
luego se comparan vectores de años curriculares solo si todas las candidatas tienen
años enteros positivos comparables; finalmente códigos ordenados sin locale.
Year no es requisito académico ni medida de esfuerzo; term no es desempate.

N es entero seguro positivo, solo para sugerencias. N efectivo es min(N, candidatas).
No limita selección manual. `hasAcademicImprovement` compara los cuatro criterios:
true/false con selección actual válida del mismo tamaño efectivo, null si no hay
base comparable. No se aplica una propuesta automáticamente.

### Búsqueda

C(M,N) se calcula exactamente con BigInt (salida decimal string si excede entero
seguro). Hasta 20000 combinaciones inclusive se usa exhaustive, sin truncar por
budget. Por encima se usa bounded, presupuesto predeterminado 20000.

Bounded evalúa primero la selección actual cuando corresponde; luego semilla canónica,
grupos de requisitos de regularización sin aprobaciones pendientes y semillas por
candidata, completadas a N por código. Explora swaps de una y dos materias desde la
mejor combinación; repite si mejora. Deduplica combinaciones y termina al agotar
presupuesto o vecindario sin mejora. No garantiza óptimo global.

El ranking D+E puede cambiar el centro de vecindarios respecto del ranking histórico;
no cambiaron semillas, swaps, presupuesto ni política determinista de recorrido.
`evaluatedCount` cuenta combinaciones únicas, incluida la actual si corresponde;
las evaluaciones de preparación no cuentan como combinaciones de búsqueda.

El resultado incluye evaluación, impacto, requestedCount/effectiveCount, candidatas,
método, evaluatedCount, totalCombinationCount, isExhaustive, warnings y diagnostics.
Entradas inválidas o ausencia de candidatas retornan method none y diagnóstico.

La comparación conserva entradas/salidas, close y completionAdditional con
`gained/lost/delta`, pares de avance parcial, cantidades válidas, warnings y resultados
completos. Conserva annualAdditional por compatibilidad, sin sumarlo en la UI.
No supone igualdad de esfuerzo ni afirma fechas para ganancias atemporales.

## UI y sesión

`Planner.jsx` consume exclusivamente los resultados del motor. Muestra selección
manual, período, N, resumen de cuatro métricas, detalle ¿Por qué? y comparación antes
de aplicar. Agrupa advertencias de cobertura parcial y usa etiquetas compactas de
inicio/duración. Una anual conserva su compromiso completo sin línea redundante +0.

Las horas solo se suman si todas las cursadas válidas tienen valor finito no negativo
y unidad explícita `horas cátedra semanales`. No se mezclan unidades ni se muestra
un agregado parcial; no se usan para ranking.

`usePlannerSession` reside en App: selectedCodes, targetPeriod y desiredCount para
uid/careerId. Navegar conserva decisiones; progreso nuevo reclasifica sin borrar.
Cambio de identidad/carrera ajusta estado antes de renderizar hijos y descarta
callbacks de otro contexto. Recargar pierde la sesión: no hay almacenamiento nuevo.
N inicia en 4. Período inicial según fecha local: enero–junio → 2C del mismo año;
julio–diciembre → 1C siguiente. Esto no confirma oferta.

Inputs, selects, botones y details/summary son nativos, con labels, aria-pressed,
aria-live, foco visible y layout adaptable. La selección incompatible sigue removible.

### Worker

Vite empaqueta `workers/planner.worker.js` como Worker module. Cada solicitud recibe
solo catálogo, progreso y decisiones locales serializables, ejecuta sugerencia y
comparación puras y devuelve requestId. No envía esos datos a servicios externos.

`plannerWorkerController` admite una solicitud activa; termina al finalizar, cancelar
o fallar. requestId y referencia de Worker descartan callbacks viejos.
`usePlannerSuggestion` añade clave de input completo y usuario/carrera: cambios
invalidan resultados, cancelan trabajo y no resucitan propuestas al volver al input
anterior. Desmontar cancela. Los errores permiten reintentar y conservar selección.
No hay fallback de búsqueda pesada en el hilo principal.

### Mapa → Mi selección

CareerMap usa availableToCourse y missingCoursePrereqs para nuevas incorporaciones;
no calcula impacto, ranking ni sugerencias. App le pasa la misma selección de sesión.
Agregar navega a PlannerPage, cuya vista inicial es Mi selección. Una ya seleccionada
permite volver a verla sin duplicarla, aunque luego se haya invalidado.

Mapa no clasifica temporalidad: anuales, inicio/duración desconocidos e incompatibles
académicamente habilitadas pueden agregarse. Planner conserva y diagnostica según su
contrato, sin borrar otras selecciones ni limitar por N.

Las activities explícitas no se agregan como cursadas; el mensaje remite su seguimiento
a Materias. Si ya estaban seleccionadas se conservan y permiten navegar para quitarlas.
PPS06 de UADE Informática no se modifica: no hay evidencia suficiente para declararla
activity. Su metadata queda pendiente de verificación oficial, sin heurísticas por nombre.

## Alcance, límites y validación

Diferencia deliberada: Planner mantiene cierre conservador más impacto sin fecha.
Proyectar carrera conserva simulación operativa y defaults históricos, que no son
evidencia académica oficial. No se modificaron ese motor, finales ni persistencia.
Tampoco catálogos, Rules, servicios Firebase, sharing o privacidad remota.

No se valida historial académico ni ciclos completos del catálogo; no se inventan
requisitos o metadata. Los smoke tests de ocho catálogos prueban compatibilidad técnica,
no oferta ni integridad académica oficial. Bounded no garantiza óptimo global.

Tests: planner.test.cjs, planner-suggestions.test.cjs, planner-equivalence.test.cjs,
planner-ui.test.cjs y academic-ui.test.cjs, incluidos en npm.cmd test. Cubren regularización
vs aprobación, sinergias, dos horizontes, invariancia, ocho catálogos, equivalencia
público/preparado, búsqueda, comparación, Worker (incluido hilo Node real), sesión y Mapa.
El harness JSX/VM no sustituye pruebas visuales de navegador; estas fueron realizadas
manualmente para las etapas 3, 3.1 y 4. No se incorpora framework E2E.

Benchmark local reproducible, sin servicios ni archivos generados:

```text
node scripts/benchmark-planner.cjs
node scripts/benchmark-planner.cjs --reference
node scripts/benchmark-planner.cjs --profile
```

Usa N=5, calentamiento y mediana de tres ejecuciones. reference compara evaluación
pública bajo la misma búsqueda; profile imprime muestras de CPU en memoria. Los tiempos
son observaciones locales, nunca umbrales de tests ni garantías para otros dispositivos.
La ruta preparada redujo el costo inicial y D+E añadió cálculo adicional, especialmente
en UCA. El Worker evita bloquear la interacción durante la búsqueda.

Deudas no bloqueantes: metadata temporal oficial incompleta, verificación PPS06,
bundle principal grande, README histórico, automatización CI/lint/typecheck y E2E.
No forman parte de esta versión. El versionado observado usa mensajes de commit;
package.json no contiene version y no hay tags locales al revisar v1.14.0.
