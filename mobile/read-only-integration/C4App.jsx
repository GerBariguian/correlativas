import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { connectAcademicLab } from './academicClient.mjs'
import { createAcademicSessionController } from './academicSessionController.mjs'
import { useAcademicRead } from './useAcademicRead.js'
import { academicViewModel } from './academicViewModel.mjs'
import { C4Subjects } from './C4Subjects.jsx'
import { C4Home } from './C4Home.jsx'
import { C4Map } from './C4Map.jsx'
import { SECTIONS, LAB_CONTEXTS, labScope, workspaceKey, academicScreenModel } from './c4-ui-model.mjs'
export function C4StaticSection({ section }) {
  if (!['Planificar', 'Proyectar', 'Comunidad'].includes(section)) return null
  return <section className="c4-state"><span className="c4-kicker">DEMOSTRACIÓN ESTÁTICA</span><h1>{section}</h1>
    <p>Vista no integrada, sin datos académicos reales ni operaciones.</p></section>
}
export default function C4App() {
  const [reads, setReads] = useState(0)
  const [session] = useState(() => createAcademicSessionController({ connect: async uid => {
    const client = await connectAcademicLab(uid)
    return { close: () => client.close(), readProgress: scope => { setReads(n => n + 1); return client.readProgress(scope) } }
  } }))
  const subscribe = useRef(listener => session.subscribe(listener)).current
  const sessionState = useSyncExternalStore(subscribe, session.getSnapshot, session.getSnapshot)
  const [uid, setUid] = useState('lab-instances'), [choice, setChoice] = useState('systems'), [epoch, setEpoch] = useState(0), [page, setPage] = useState('Materias'), [diagnostic, setDiagnostic] = useState('')
  const content = useRef(null), attempt = useRef(0)
  useEffect(() => () => { attempt.current++; void session.disconnect() }, [session])
  useEffect(() => { content.current?.focus() }, [page])
  const scope = labScope(uid, choice)
  const connection = sessionState.state === 'ready' ? sessionState.connection : null
  // The only hook consumer: remains mounted across sections and CSS breakpoints.
  const snapshot = useAcademicRead(connection, scope)
  const model = academicViewModel({ scope, connectionId: connection?.id, connectionCurrent: connection?.isCurrent() === true, snapshot })
  const screen = academicScreenModel(sessionState, model)
  async function connect(user = uid) {
    const token = ++attempt.current; setEpoch(token); setDiagnostic('')
    if (user !== uid) { setUid(user); setChoice('systems') }
    const result = await session.connect(user)
    if (attempt.current === token && result?.code) setDiagnostic(result.code)
  }
  function disconnect() { setEpoch(++attempt.current); setDiagnostic(''); void session.disconnect() }
  return <div className="c4-app"><div className="c4-banner">LABORATORIO LOCAL · Datos ficticios · Solo lectura · En memoria</div>
    <header className="c4-brand"><span>correlativas<span className="c4-brand-dot">.</span></span><small>C4.3 · Consulta académica</small></header>
    <details className="c4-lab" open><summary>Controles exclusivos del laboratorio</summary><div className="c4-lab-controls">
      <label>Usuario ficticio<select value={uid} onChange={e => void connect(e.target.value)}>{Object.keys(LAB_CONTEXTS).map(user => <option key={user}>{user}</option>)}</select></label>
      <label>Carrera o contexto ficticio<select value={choice} onChange={e => setChoice(e.target.value)}>{LAB_CONTEXTS[uid].map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <button onClick={() => void connect()}>Conectar / reconectar</button><button onClick={disconnect}>Desconectar</button></div>
      <p>Sesión: {sessionState.state} · Lecturas académicas iniciadas: {reads}</p>
      <small>{scope.uid} · {scope.model} · {scope.id} · {scope.catalogId}</small>
      {(sessionState.code || diagnostic) && <p role="alert">{sessionState.code || diagnostic}</p>}
      <p className="c4-note">La selección es local y explícita; no descubre ni modifica carreras en Firebase. Sin reintentos automáticos.</p></details>
    <div className="c4-layout"><nav className="c4-nav" aria-label="Secciones">{SECTIONS.map(section => <button key={section} aria-current={page === section ? 'page' : undefined} onClick={() => setPage(section)}>{section}</button>)}</nav>
      <main ref={content} tabIndex={-1} className="c4-content"><div hidden={page !== 'Materias'}><C4Subjects key={workspaceKey(epoch, scope)} model={screen} refresh={sessionState.state === 'error' ? () => connect() : snapshot.refresh}/></div>
        <div hidden={page !== 'Inicio'}><C4Home model={screen} scope={scope} refresh={sessionState.state === 'error' ? () => connect() : snapshot.refresh}/></div>
        <div hidden={page !== 'Mapa'}><C4Map key={workspaceKey(epoch, scope)} model={screen} scope={scope} refresh={sessionState.state === 'error' ? () => connect() : snapshot.refresh}/></div>
        {['Planificar', 'Proyectar', 'Comunidad'].includes(page) && <C4StaticSection section={page}/>}</main></div>
  </div>
}
