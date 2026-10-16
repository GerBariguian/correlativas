import React from 'react'
export function AcademicSimulation({demo}){
 return <section className="academic-simulation" aria-label="Simulación de operaciones académicas">
  <h3>Operaciones académicas ficticias</h3><p>Configurá el resultado de la próxima carga o cambio de estado. No se realizan solicitudes a servidores.</p>
  <label htmlFor="academic-result">Resultado simulado</label><select id="academic-result" value={demo.simulation.mode} onChange={e=>demo.setSimulation({...demo.simulation,mode:e.target.value})}><option value="success">Éxito</option><option value="error">Error</option><option value="conflict">Conflicto de revisión</option></select>
  <label htmlFor="academic-delay">Tiempo de respuesta</label><select id="academic-delay" value={demo.simulation.delay} onChange={e=>demo.setSimulation({...demo.simulation,delay:Number(e.target.value)})}><option value="350">Normal · 350 ms</option><option value="4000">Tardía · 4 segundos</option></select>
  <button className="secondary-btn full" disabled={!demo.context.usable || demo.presentation.busy} onClick={demo.simulateLoad}>Simular carga académica</button>
  <p>Para probar una respuesta tardía, iniciá un cambio y seleccioná otra carrera antes de cuatro segundos. Volver a la carrera anterior no recupera la operación descartada.</p>
  <AcademicFeedback demo={demo}/>
 </section>
}
export function AcademicFeedback({demo}){
 const {operation,presentation}=demo
 if(!presentation.dataError && !operation.message)return null
 const issue=presentation.dataError || ['error','conflict'].includes(operation.phase)
 return <div className={`academic-feedback ${issue?'has-issue':''}`} data-academic-phase={presentation.dataError?'invalid':operation.phase} role={issue?'alert':'status'} aria-live={issue?'assertive':'polite'}>
  <p>{presentation.dataError?'No se pudo interpretar el progreso ficticio. No se reemplazó por estados pendientes.':operation.message}</p>
  {presentation.busy && <small>Se conserva el último progreso confirmado de esta demo.</small>}
  {['error','conflict'].includes(operation.phase) && <button className="secondary-btn" onClick={demo.refresh}>Actualizar datos ficticios</button>}
 </div>
}
