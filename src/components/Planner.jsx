import { useMemo } from 'react'
import { preparePlannerEvaluationContext, evaluatePreparedPlannerSelection } from '../plannerLogic'
import { summarizePlannerImpact } from '../plannerSuggestions'
import { plannerHours, plannerOfferingWarning, plannerSelectionReason } from '../plannerPresentation'
import usePlannerSuggestion from '../hooks/usePlannerSuggestion'

function Planner({ subjects, statusMap, selectedCodes, setSelectedCodes, targetPeriod, setTargetPeriod, desiredCount, setDesiredCount, scopeKey }) {
  const context = useMemo(() => preparePlannerEvaluationContext({ subjects, statusMap, targetPeriod }), [subjects, statusMap, targetPeriod])
  const evaluation = useMemo(() => evaluatePreparedPlannerSelection(context, selectedCodes), [context, selectedCodes])
  const catalog = useMemo(() => evaluatePreparedPlannerSelection(context, subjects.map(s => s.code)), [context, subjects])
  const individual = useMemo(() => Object.fromEntries(catalog.selection.filter(s => s.selectable).map(s =>
    [s.code, summarizePlannerImpact(evaluatePreparedPlannerSelection(context, [s.code]))])), [context, catalog])
  const suggestion = usePlannerSuggestion({ subjects, statusMap, selectedCodes, targetPeriod, desiredCount }, scopeKey)
  const nameOf = code => subjects.find(s => s.code === code)?.name || code
  const names = codes => codes.length ? codes.map(nameOf).join(', ') : 'Ninguna'
  const toggle = code => { suggestion.dismiss(); setSelectedCodes(current => current.includes(code) ? current.filter(c => c !== code) : [...current, code]) }
  const changePeriod = next => { suggestion.dismiss(); setTargetPeriod(next) }
  const changeCount = next => { suggestion.dismiss(); setDesiredCount(next) }
  const metrics = evaluation.valid ? summarizePlannerImpact(evaluation) : null
  const hours = evaluation.valid ? plannerHours(subjects, evaluation) : null
  const unknownDuration = evaluation.selection.filter(s => s.selectable && s.durationPeriods === null)
  const uncertainty = item => <span className="planner-uncertainty">
    {item.start === 'unknown' && <small>Inicio no confirmado</small>}
    {item.durationPeriods === null && <small>Duración no informada</small>}
  </span>
  const temporal = items => <>
    {items.some(s => s.warnings.includes('START_UNKNOWN')) && <p className="planner-note">{plannerOfferingWarning} Materias: {names(items.filter(s => s.warnings.includes('START_UNKNOWN')).map(s => s.code))}.</p>}
    {items.some(s => s.warnings.includes('DURATION_UNKNOWN')) && <p className="planner-note">Duración no informada: {names(items.filter(s => s.warnings.includes('DURATION_UNKNOWN')).map(s => s.code))}. Su impacto se analiza al completar la cursada, sin fecha; no al cierre.</p>}
  </>
  const explain = (entries, phase) => entries.length > 0 && <section><h4>{phase}</h4><ul>{entries.map(entry => <li key={entry.code}>
    <strong>{nameOf(entry.code)}</strong> — Requisitos cubiertos por regularización: {names(entry.satisfied.regularized)}.
    {entry.synergy && <span> Contribución conjunta: {names(entry.contributors)}.</span>}
    {entry.remaining.regularized.length > 0 && <span> Falta regularizar: {names(entry.remaining.regularized)}.</span>}
    {entry.remaining.approved.length > 0 && <span> Falta aprobar: {names(entry.remaining.approved)}.</span>}
  </li>)}</ul></section>
  const comparison = suggestion.comparison
  const summary = (label, result, impact) => <article><h4>{label}</h4>
    <p>{result.selection.filter(s => s.selectable).length} cursadas válidas de {result.selection.length} seleccionadas.</p>
    <p>{impact.closeCodes.length} nuevas habilitaciones al cierre, con duración conocida.</p>
    <p>{impact.completionAdditionalCodes.length} habilitaciones adicionales al completar las cursadas, sin fecha.</p>
    <p>{new Set(impact.partialPairs.map(p => p.code)).size} materias con avance parcial al completar las cursadas.</p>
  </article>
  return <section className="planner-page planner-intelligent">
    <header><h2>Planificador inteligente</h2><p>Armá tu próximo período y analizá el impacto académico de tu selección.</p></header>
    <div className="planner-controls">
      <fieldset><legend>Próximo período</legend>
        <label htmlFor="planner-year">Año</label>
        <input id="planner-year" type="number" min="1" max="9999" step="1" value={targetPeriod.year}
          onChange={event => changePeriod({ ...targetPeriod, year: event.target.value === '' ? '' : Number(event.target.value) })} />
        <label htmlFor="planner-term">Cuatrimestre</label>
        <select id="planner-term" value={targetPeriod.term} onChange={event => changePeriod({ ...targetPeriod, term: event.target.value })}>
          <option value="1C">1C</option><option value="2C">2C</option>
        </select>
      </fieldset>
      <fieldset><legend>¿Cuántas materias querés cursar?</legend><div className="planner-quantity">
        <button type="button" aria-label="Reducir cantidad sugerida" disabled={!Number.isSafeInteger(desiredCount) || desiredCount <= 1} onClick={() => changeCount(desiredCount - 1)}>−</button>
        <input aria-label="Cantidad deseada para la sugerencia" type="number" min="1" step="1" value={desiredCount}
          onChange={event => changeCount(event.target.value === '' ? '' : Number(event.target.value))} />
        <button type="button" aria-label="Aumentar cantidad sugerida" disabled={!Number.isSafeInteger(desiredCount) || desiredCount >= Number.MAX_SAFE_INTEGER} onClick={() => changeCount(desiredCount + 1)}>+</button>
      </div><small>No limita tu selección manual.</small></fieldset>
    </div>
    {(!Number.isSafeInteger(desiredCount) || desiredCount < 1) && <p role="alert">Ingresá una cantidad entera positiva para pedir una sugerencia.</p>}
    {!evaluation.valid && <p role="alert">No podemos analizar la selección. Revisá el año y el período; si el problema continúa, los datos del catálogo o del progreso requieren revisión.</p>}
    <section aria-label="Materias disponibles"><h3>Materias disponibles</h3>
      {catalog.valid && !catalog.selection.some(s => s.selectable) && <p>No hay nuevas cursadas disponibles para este período según los datos actuales.</p>}
      {catalog.selection.some(s => s.selectable && s.start === 'unknown') && <p className="planner-note">{plannerOfferingWarning} Las opciones sin inicio confirmado están identificadas.</p>}
      {catalog.selection.some(s => s.selectable && s.durationPeriods === null) && <p className="planner-note">Duración no informada: podemos analizar su impacto al completar la cursada, pero no situar su finalización al cierre del período.</p>}
      <div className="planner-grid">{catalog.selection.filter(s => s.selectable).map(item => <button type="button" key={item.code}
        className={`planner-subject ${selectedCodes.includes(item.code) ? 'selected' : ''}`} aria-pressed={selectedCodes.includes(item.code)} onClick={() => toggle(item.code)}>
        <span>{item.code}</span><strong>{nameOf(item.code)}</strong>
        {item.durationPeriods === 2 && <small>Anual · compromete dos períodos; impacto al completar la cursada.</small>}
        {uncertainty(item)}
        {individual[item.code].closeCodes.length > 0 ? <small>Puede habilitar {individual[item.code].closeCodes.length} materias al cierre si completás la cursada.</small>
          : individual[item.code].completionAdditionalCodes.length > 0 ? <small>Puede habilitar {individual[item.code].completionAdditionalCodes.length} materias al completar la cursada, sin fecha estimada.</small>
            : individual[item.code].directPendingCodes.length > 0 && <small>Es correlativa de {individual[item.code].directPendingCodes.length} materias pendientes.</small>}
      </button>)}</div>
    </section>
    <section className="planner-selection" aria-label="Mi selección"><h3>Mi selección</h3>
      {selectedCodes.length === 0 ? <p>Todavía no elegiste materias.</p> : <>
        <ul>{selectedCodes.map(code => {
          const item = evaluation.selection.find(s => s.code === code)
          return <li key={code}><div><strong>{nameOf(code)}</strong><p>{item ? plannerSelectionReason(item, nameOf) : 'Conservada; no se puede analizar hasta resolver los datos.'}</p>
            {item && uncertainty(item)}
            {item?.durationPeriods === 2 && <small>Anual: su impacto adicional requiere completar toda la cursada.</small>}
          </div><button type="button" aria-label={`Quitar ${nameOf(code)} de Mi selección`} onClick={() => toggle(code)}>Quitar</button></li>
        })}</ul>
        <button type="button" onClick={() => { suggestion.dismiss(); setSelectedCodes([]) }}>Limpiar selección</button>
      </>}
    </section>
    {evaluation.valid && <section aria-label="Impacto de tu selección"><h3>Impacto de tu selección</h3>
      <div className="planner-summary"><article><span>Elegidas válidas</span><strong>{evaluation.selection.filter(s => s.selectable).length}</strong></article>
        <article><span>Nuevas habilitaciones al cierre</span><strong>{metrics.closeCodes.length}</strong></article>
        <article><span>Al completar las cursadas</span><strong>{metrics.completionAdditionalCodes.length} adicionales</strong></article>
        <article><span>Materias con avance parcial al completar</span><strong>{new Set(metrics.partialPairs.map(p => p.code)).size}</strong></article>
      </div>
      <p className="planner-note">Las habilitaciones al cierre se calculan con la duración conocida. Las adicionales al completar las cursadas no tienen fecha estimada y no se suman al cierre.</p>
      {unknownDuration.length > 0 && <p className="planner-note">Análisis parcial: no conocemos la duración de {unknownDuration.length} materias seleccionadas. Su impacto al cierre no está incluido; sí se analiza al completar las cursadas.</p>}
      {evaluation.annualAdditional.regularizedCodes.length > 0 && <p>Incluye {evaluation.annualAdditional.regularizedCodes.length} {evaluation.annualAdditional.regularizedCodes.length === 1 ? 'materia anual: requiere' : 'materias anuales: requieren'} completar toda la cursada.</p>}
      {hours !== null && <p>{hours} horas cátedra semanales.</p>}
      <p className="planner-note">Simulación académica condicional: no confirma oferta real. Completar una cursada supone regularizarla, no aprobar su final.</p>
      <details><summary>¿Por qué?</summary>
        <p>Cursadas consideradas completadas al cierre: {names(evaluation.close.regularizedCodes)}.</p>
        <p>Fuera del cierre por duración anual o no informada: {names(evaluation.selection.filter(s => s.selectable && s.durationPeriods !== 1).map(s => s.code))}.</p>
        {explain(evaluation.close.newEligibility, 'Habilitaciones al cierre del período')}
        {explain(evaluation.completion.additionalEligibility, 'Habilitaciones adicionales al completar las cursadas (sin fecha)')}
        {explain(evaluation.completion.partialProgress, 'Avance parcial al completar las cursadas')}
        <p>Dependientes directos pendientes: {names(metrics.directPendingCodes)}. Una relación directa no implica habilitación.</p>
        <p>No se asume la finalización de materias que ya están Cursando.</p>
      </details>
    </section>}
    <section className="planner-suggestion" aria-label="Sugerencia de cursada">
      <button type="button" className="suggest-btn" disabled={!evaluation.valid || !Number.isSafeInteger(desiredCount) || desiredCount < 1 || suggestion.phase === 'loading'}
        onClick={suggestion.start}>{suggestion.phase === 'loading' ? 'Calculando sugerencia…' : 'Sugerir cursada'}</button>
      <p className="planner-note">Prioriza habilitaciones al cierre y luego el impacto al completar las cursadas sin asignar fecha, avance parcial y dependientes directos. Vos decidís si usarla.</p>
      <div role="status" aria-live="polite">
        {suggestion.phase === 'loading' && <p>Calculando. Podés seguir editando tu selección.</p>}
        {suggestion.phase === 'error' && <p>No se pudo calcular la sugerencia. Tu selección se conserva. Podés volver a intentar con “Sugerir cursada”.</p>}
        {suggestion.phase === 'unavailable' && <p>{suggestion.diagnostics.includes('NO_CANDIDATES') ? 'No hay candidatas disponibles para sugerir.' : 'No se pudo generar una sugerencia con estos datos. Revisá el período y la cantidad.'}</p>}
        {suggestion.phase === 'ready' && <p>{suggestion.result.hasAcademicImprovement === false
          ? suggestion.result.method === 'bounded' ? 'La búsqueda realizada no encontró una alternativa con mayor impacto según este criterio.' : 'No encontramos una alternativa con mayor impacto académico entre las combinaciones evaluadas.'
          : 'Sugerencia lista. Revisala antes de aplicarla.'}</p>}
      </div>
      {suggestion.phase === 'ready' && <section className="planner-comparison" aria-label="Comparación de selecciones">
        {suggestion.result.method === 'bounded' && <p className="planner-note">Sugerencia obtenida mediante una búsqueda acotada.</p>}
        {suggestion.result.requestedCount > suggestion.result.effectiveCount && <p>Pediste {suggestion.result.requestedCount} materias; hay {suggestion.result.effectiveCount} candidatas disponibles y se incluyeron todas.</p>}
        {suggestion.result.hasAcademicImprovement !== false && <>
          <div className="planner-comparison-columns">
            {selectedCodes.length > 0 && summary('Tu selección', comparison.current, comparison.currentImpact)}
            {summary('Sugerencia', comparison.proposed, comparison.proposedImpact)}
          </div>
          <p>Materias sugeridas: {names(suggestion.result.suggestedCodes)}.</p>
          {selectedCodes.length > 0 && <><p>Entran: {names(comparison.enteredCodes)}.</p><p>Salen: {names(comparison.removedCodes)}.</p>
            <p>Habilitaciones al cierre ganadas: {names(comparison.close.gained)}. Perdidas: {names(comparison.close.lost)}.</p>
            <p>Habilitaciones adicionales al completar las cursadas (sin fecha) ganadas: {names(comparison.completionAdditional.gained)}. Perdidas: {names(comparison.completionAdditional.lost)}.</p>
            <details><summary>Cambios de avance parcial</summary>{['gained', 'lost'].map(type => <p key={type}>{type === 'gained' ? 'Se cubren' : 'Dejan de cubrirse'}: {comparison.partialProgress[type].length
              ? comparison.partialProgress[type].map(p => `${nameOf(p.code)}: ${p.type === 'approved' ? 'aprobar' : 'regularizar'} ${nameOf(p.requirement)}`).join('; ') : 'ninguno'}.</p>)}</details>
            <p className="planner-note">La comparación no supone igualdad de esfuerzo.</p></>}
          {temporal(comparison.proposed.selection)}
        </>}
        <div className="planner-actions"><button type="button" onClick={suggestion.dismiss}>{selectedCodes.length ? 'Mantener mi selección' : 'Cancelar'}</button>
          {suggestion.result.hasAcademicImprovement !== false && <button type="button" onClick={() => { setSelectedCodes(suggestion.result.suggestedCodes); suggestion.dismiss() }}>Usar sugerencia</button>}
        </div>
      </section>}
    </section>
  </section>
}

export default Planner
