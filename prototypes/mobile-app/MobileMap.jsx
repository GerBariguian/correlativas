import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Compass, Plus } from 'lucide-react'
import CareerMap from '../../src/components/CareerMap'
import ProgressSummary from '../../src/components/ProgressSummary'
import { availableToCourse, getStatus, missingCoursePrereqs, unlocks } from '../../src/logic'

// Prototype-only controls: preserve the shared web map and its domain rules.
export default function MobileMap({ subjects, statusMap, selectedCode, setSelectedCode, selection, setSelection, navigate, openSubject }) {
  const root = useRef(null)
  const [reason, setReason] = useState('')
  const [year, setYear] = useState(0)
  const selected = subjects.find(s => s.code === selectedCode)
  const alreadySelected = selection.includes(selectedCode)
  const canAdd = selected?.projectionKind !== 'activity' && availableToCourse(subjects, statusMap).some(s => s.code === selectedCode)

  function scrollToYear(index) {
    const board = root.current?.querySelector('.career-map')
    const column = board?.children[index]
    if (!column) return
    const left = board.scrollLeft + column.getBoundingClientRect().left - board.getBoundingClientRect().left - (board.clientWidth - column.clientWidth) / 2
    board.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  useEffect(() => {
    const board = root.current.querySelector('.career-map')
    board.id = 'mobile-year-map'
    board.setAttribute('role', 'region')
    board.setAttribute('aria-label', 'Materias por año. Deslizá horizontalmente o usá los botones de año.')
    // Only center on a new selection. Scrolling, resize and touching do not re-center it.
    const track = () => {
      const center = board.getBoundingClientRect().left + board.clientWidth / 2
      const distances = [...board.children].map(column => Math.abs(column.getBoundingClientRect().left + column.clientWidth / 2 - center))
      setYear(distances.indexOf(Math.min(...distances)))
    }
    const interrupt = () => board.scrollTo({ left: board.scrollLeft, behavior: 'instant' })
    board.addEventListener('scroll', track, { passive: true })
    board.addEventListener('pointerdown', interrupt, { passive: true })
    track()
    return () => { board.removeEventListener('scroll', track); board.removeEventListener('pointerdown', interrupt) }
  }, [])
  useEffect(() => { setReason('') }, [statusMap])
  useEffect(() => {
    setReason('')
    if (!selectedCode) return
    const board = root.current.querySelector('.career-map')
    const selectedNode = board.querySelector('.map-subject.selected')
    if (selectedNode) scrollToYear([...board.children].indexOf(selectedNode.closest('.year-column')))
  }, [selectedCode])

  function add() {
    if (alreadySelected) { navigate('planificador'); return }
    if (canAdd) { setSelection(old => [...old, selectedCode]); navigate('planificador'); return }
    const status = getStatus(statusMap, selectedCode)
    if (selected.projectionKind === 'activity') setReason('Esta actividad se sigue desde Materias, no como cursada en el plan.')
    else if (status !== 'Pendiente') setReason(`Está ${status.toLowerCase()}. Al plan se agregan materias pendientes habilitadas.`)
    else {
      const missing = missingCoursePrereqs(selected, statusMap)
      const count = missing.regularized.length + missing.approved.length
      const firstCode = missing.regularized[0] ?? missing.approved[0]
      const name = subjects.find(s => s.code === firstCode)?.name ?? firstCode
      setReason(`Falta ${missing.regularized.length ? 'regularizar' : 'aprobar'} ${name}${count > 1 ? ` y completar ${count - 1} requisito(s) más` : ''}. Consultá el detalle.`)
    }
  }

  return <div className="mobile-map" ref={root}>
    <div className="map-tip compact"><Compass size={17} /><p>Deslizá entre años. Tocá una materia para ver sus conexiones.</p></div>
    <ProgressSummary subjects={subjects} statusMap={statusMap} />
    <div className="map-year-controls" aria-label="Navegar entre años">
      <button className="icon-btn bordered" aria-label="Año anterior" aria-controls="mobile-year-map" disabled={year === 0} onClick={() => scrollToYear(year - 1)}><ArrowLeft size={18} /></button>
      <span aria-live="polite">{year + 1}° año <small>de 5</small></span>
      <button className="icon-btn bordered" aria-label="Año siguiente" aria-controls="mobile-year-map" disabled={year === 4} onClick={() => scrollToYear(year + 1)}><ArrowRight size={18} /></button>
    </div>
    {selected && <section className="map-selection-bar" aria-label="Materia seleccionada">
      <div><strong>{selected.name}</strong><span>{getStatus(statusMap, selectedCode)} · Desbloquea {unlocks(subjects, selectedCode).length}</span></div>
      <button className="map-add-btn" onClick={add} aria-describedby={reason ? 'mobile-map-reason' : undefined}>{alreadySelected ? <ArrowRight size={17} /> : <Plus size={17} />}{alreadySelected ? 'Ver mi plan' : 'Agregar al plan'}</button>
      {reason && <p id="mobile-map-reason" role="status">{reason}</p>}
      <button className="text-btn map-detail-link" onClick={() => openSubject(selected)}>Ver detalle y editar <ArrowRight size={14} /></button>
    </section>}
    <CareerMap subjects={subjects} statusMap={statusMap} selectedCode={selectedCode} setSelectedCode={setSelectedCode} setActivePage={navigate} plannerSelectedCodes={selection} setPlannerSelectedCodes={setSelection} />
  </div>
}
