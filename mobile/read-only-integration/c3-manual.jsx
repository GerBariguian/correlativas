import React, { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { connectAcademicLab } from './academicClient.mjs'
import { createAcademicSessionController } from './academicSessionController.mjs'
import { useAcademicRead } from './useAcademicRead.js'
const contexts = {
  systems: { model: 'instances', id: 'lab-systems', catalogId: 'utn-sistemas-2023' },
  industrial: { model: 'instances', id: 'lab-industrial23', catalogId: 'utn-industrial-2023' },
  archived: { model: 'instances', id: 'lab-industrial07', catalogId: 'utn-industrial-2007' },
  legacy: { model: 'legacy', id: 'utn-sistemas-2023', catalogId: 'utn-sistemas-2023' },
}
function Consumer({ connection, scope, audit }) {
  const result = useAcademicRead(connection, scope)
  // Test-only in-memory observation of each render; no React updates or I/O.
  const progress = Object.hasOwn(result, 'progress')
  const same = result.scope && ['uid', 'model', 'id', 'catalogId'].every(k => result.scope[k] === scope[k])
  let violation = progress && (result.state !== 'loaded' || !same || !connection?.isCurrent())
  if (progress) {
    const revision = scope.model === 'legacy' ? null : scope.id === 'lab-systems' ? 7 : 1
    const count = scope.model === 'legacy' || scope.id === 'lab-systems' ? 4 : 0
    violation ||= result.progress.revision !== revision || Object.keys(result.progress.statusMap).length !== count
  }
  audit.renders++; if (violation) audit.violations++
  useEffect(() => { audit.mounts++; return () => { audit.cleanups++ } }, [audit])
  return <section><h2>Consumidor montado</h2>
    <p>Estado: <strong>{result.state}</strong></p>
    <p>Contexto: {scope.uid} · {scope.model} · {scope.id} · {scope.catalogId}</p>
    <p>Revisión: {progress ? String(result.progress.revision) : 'sin progreso'}</p>
    <p>Materias: {progress ? Object.keys(result.progress.statusMap).length : 0}</p>
    {result.reason && <p>Motivo: {result.reason}</p>}{result.code && <p>Error: {result.code}</p>}
    <button onClick={() => void result.refresh()}>Actualizar lectura</button>
    <pre>{JSON.stringify(progress ? result.progress.statusMap : {}, null, 2)}</pre>
    <p>Renders: {audit.renders} · Violaciones: {audit.violations}</p>
    <p>Efectos montados: {audit.mounts} · limpiezas: {audit.cleanups} (se muestran en el siguiente render)</p>
  </section>
}
function App() {
  const [session] = useState(() => createAcademicSessionController({ connect: connectAcademicLab }))
  const subscribe = useRef(listener => session.subscribe(listener)).current
  const state = useSyncExternalStore(subscribe, session.getSnapshot, session.getSnapshot)
  const [uid, setUid] = useState('lab-instances'), [context, setContext] = useState('systems')
  const [mounted, setMounted] = useState(true), [foreign, setForeign] = useState(false), [diagnostic, setDiagnostic] = useState('')
  const audit = useRef({ renders: 0, violations: 0, mounts: 0, cleanups: 0 }).current
  useEffect(() => () => { void session.disconnect() }, [session])
  async function connect(user) {
    setUid(user); setContext(user === 'lab-legacy' ? 'legacy' : 'systems'); setForeign(false); setDiagnostic('')
    const result = await session.connect(user)
    if (result?.code) setDiagnostic(result.code)
  }
  const scope = { uid: foreign ? (uid === 'lab-legacy' ? 'lab-instances' : 'lab-legacy') : uid, ...contexts[context] }
  return <main style={{ maxWidth: 950, margin: '24px auto', fontFamily: 'sans-serif', lineHeight: 1.5 }}>
    <h1>Correlativas · Prueba aislada C3</h1>
    <p>Solo fixtures · demo-correlativas-244b · Auth 9199 · Firestore 8188 · Strict Mode de desarrollo</p>
    <p>Sesión: <strong>{state.state}</strong> · usuario seleccionado: {uid}</p>
    <button onClick={() => void connect('lab-instances')}>Conectar instances</button>{' '}
    <button onClick={() => void connect('lab-legacy')}>Conectar legacy</button>{' '}
    <button onClick={() => void session.disconnect()}>Desconectar</button>
    <p><button onClick={() => { setContext('systems'); setForeign(false) }}>Sistemas</button>{' '}
      <button onClick={() => { setContext('industrial'); setForeign(false) }}>Industrial</button>{' '}
      <button onClick={() => { setContext('archived'); setForeign(false) }}>Archivada</button>{' '}
      <button onClick={() => setForeign(true)}>Solicitar otro propietario</button></p>
    <button onClick={() => setMounted(value => !value)}>{mounted ? 'Desmontar consumidor' : 'Montar consumidor'}</button>
    {(state.code || diagnostic) && <p role="alert">{state.code || diagnostic}</p>}
    {mounted ? <Consumer connection={state.state === 'ready' ? state.connection : null} scope={scope} audit={audit}/>
      : <section><h2>Consumidor desmontado</h2><p>Sin progreso visible. Sesión compartida: {state.state}.</p><p>Violaciones: {audit.violations} · Efectos montados: {audit.mounts} · limpiezas: {audit.cleanups}</p></section>}
    <p>Auditoría de renders en memoria. No constituye auditoría de red. Cancelación lógica, sin aborto físico de Firestore.</p>
  </main>
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>)
