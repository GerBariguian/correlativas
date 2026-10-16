import React, { useEffect, useRef, useState } from 'react'
import { GraduationCap, Check, Plus, Archive, RotateCcw, ChevronDown } from 'lucide-react'
import { compareCatalogs } from './catalogSearch.mjs'
export function CareerCards({ demo, startAdd, reveal, onConfigure }) {
  const { bridge, careers } = demo
  const [confirm, setConfirm] = useState(null), [error, setError] = useState('')
  const [working, setWorking] = useState(false), [archivedOpen, setArchivedOpen] = useState(false)
  const lock = useRef(false), trigger = useRef(null)
  const allowed = bridge.authority === 'instances' && bridge.phase === 'complete' && bridge.capabilities.academicWrite
  const catalog = i => careers.find(c => c.id === i.catalogId)
  const active = bridge.instances.filter(i => i.lifecycle === 'active').sort((a,b) => Number(b.careerInstanceId === bridge.activeCareerInstanceId)-Number(a.careerInstanceId === bridge.activeCareerInstanceId) || compareCatalogs(catalog(a),catalog(b)))
  const archived = bridge.instances.filter(i => i.lifecycle === 'archived').sort((a,b) => compareCatalogs(catalog(a),catalog(b)))
  useEffect(() => {
    if ((!active.length && archived.length) || archived.some(i => i.catalogId === reveal)) setArchivedOpen(true)
    if (reveal) requestAnimationFrame(() => document.querySelector('[data-revealed="true"]')?.focus())
  }, [reveal, active.length, archived.length])
  useEffect(() => { if (confirm) document.querySelector('.archive-confirm button')?.focus() }, [confirm])
  async function act(op, id) {
    if (!allowed || lock.current) return
    lock.current = true; setWorking(true); setError('')
    try { await demo.act(op,id); setConfirm(null); requestAnimationFrame(() => document.querySelector('#navigation-content')?.focus({preventScroll:true})) }
    catch { setError('No se pudo completar la acción. Tus datos se conservan; revisá tus carreras antes de reintentar.') }
    finally { lock.current=false; setWorking(false) }
  }
  function cancel() { setConfirm(null); requestAnimationFrame(() => trigger.current?.focus()) }
  if (!allowed) return <section className="career-state" role="status"><h2>Administración no disponible</h2><p>{bridge.authority === 'frozen' ? 'Estamos actualizando tu cuenta. La administración de carreras está suspendida.' : 'La edición está suspendida. No se reemplazan ni migran tus datos.'}</p></section>
  function card(instance) {
    const c = catalog(instance), selected = instance.careerInstanceId === bridge.activeCareerInstanceId, isArchived = instance.lifecycle === 'archived'
    return <li key={instance.careerInstanceId} className={`career-tile ${selected ? 'is-selected' : ''} ${isArchived ? 'is-archived' : ''}`} data-catalog={instance.catalogId} data-revealed={instance.catalogId === reveal} tabIndex={instance.catalogId === reveal ? -1 : undefined}>
      <div className="career-tile-top"><span className="career-tile-icon" aria-hidden="true"><GraduationCap size={23}/></span><div>{selected && <span className="selected-badge"><Check size={14} aria-hidden="true"/>Seleccionada</span>}<h3>{c?.name ?? 'Catálogo no disponible'}</h3><p>{c ? `${c.university}${c.faculty ? ` · ${c.faculty}` : ''}` : 'Tus datos se conservan.'}</p>{c && <span className="career-plan">Plan {c.plan}</span>}</div></div>
      {!c && <p>No se pueden consultar materias de este catálogo.</p>}
      <div className="career-tile-actions">{isArchived ? <button className="secondary-btn" disabled={working} onClick={() => act('restore',instance.careerInstanceId)}><RotateCcw size={16} aria-hidden="true"/>Restaurar</button> : <>{!selected && <button className="primary-btn" disabled={working || !c} onClick={() => act('select',instance.careerInstanceId)}>Seleccionar</button>}<button className="career-archive" disabled={working} onClick={e => { trigger.current=e.currentTarget; setConfirm(instance.careerInstanceId) }}><Archive size={16} aria-hidden="true"/>Archivar</button></>}</div>
      {onConfigure && !isArchived && c && <button className="secondary-btn full career-configure" disabled={working || (selected && demo.presentation.busy)} onClick={()=>onConfigure(instance.careerInstanceId)}>{selected && demo.onboarding ? 'Retomar carga de materias' : 'Configurar mis materias'}</button>}
      {confirm === instance.careerInstanceId && <section className="archive-confirm" aria-label="Confirmar archivo de carrera"><h4>¿Archivar esta carrera?</h4><p>Se conservan tu progreso, planificación e historial. Compartir se desactiva.{selected ? ' Quedarás sin carrera seleccionada; no se elegirá otra.' : ''}</p><div className="career-tile-actions"><button className="secondary-btn" onClick={cancel} disabled={working}>Cancelar</button><button className="primary-btn" disabled={working} onClick={() => act('archive',instance.careerInstanceId)}>Confirmar archivo</button></div></section>}
    </li>
  }
  return <section className="career-manager" aria-label="Tus trayectorias" aria-busy={working}>
    <p className="career-lead">Cada carrera, su propio recorrido. Elegí cuál querés consultar.</p>
    <button className="primary-btn full" onClick={startAdd} disabled={working}><Plus size={19} aria-hidden="true"/>{bridge.instances.length ? 'Agregar carrera' : 'Agregar mi primera carrera'}</button>
    {error && <p role="alert">{error}</p>}
    {working && <p role="status">Guardando cambios de la demo…</p>}
    {!bridge.instances.length ? <div className="career-state"><GraduationCap size={32} aria-hidden="true"/><h2>Tu recorrido empieza acá</h2><p>Agregá tu primera carrera. Quedará seleccionada para comenzar a explorarla.</p></div> : <>
      {!bridge.activeCareerInstanceId && <p className="context-notice" role="status">{active.length ? 'Elegí una carrera para consultar tu progreso.' : 'No tenés carreras activas. Podés restaurar una archivada o agregar otra.'}</p>}
      {active.length > 0 && <section aria-label="Carreras activas"><h2 className="career-section-heading">Tus carreras <span>{active.length}</span></h2><ul className="career-tiles">{active.map(card)}</ul></section>}
      {archived.length > 0 && <details className="archived-careers" open={archivedOpen} onToggle={e => setArchivedOpen(e.currentTarget.open)}><summary><Archive size={17} aria-hidden="true"/>Archivadas · {archived.length}<ChevronDown size={18} aria-hidden="true"/></summary><p>Tu progreso y planificación se conservan. Restaurar no selecciona la carrera ni reactiva compartir.</p><ul className="career-tiles">{archived.map(card)}</ul></details>}
    </>}
  </section>
}
