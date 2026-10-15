import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Dialog } from '@mui/material'
import { ArrowRight, Bell, BookOpen, Check, CheckCheck, ChevronRight, Clock3, Compass, GraduationCap, Home, Map, Plus, RotateCcw, Search, Sparkles, Users, X } from 'lucide-react'
import ProgressSummary from '../../src/components/ProgressSummary'
import SubjectCard from '../../src/components/SubjectCard'
import MobileMap from './MobileMap'
import { useAndroidBack } from './androidRuntime'
import { availableFinals, availableToCourse, getStatus, summary } from '../../src/logic'
import logo from '../../public/logo.png'
import { catalog, friends, groups, makeGrades, makeJoined, makeStatus, notifications, subjectCode } from './data'
import '../../src/styles.css'
import './mobile.css'

const pages = [{ id: 'inicio', label: 'Inicio', icon: Home }, { id: 'materias', label: 'Materias', icon: BookOpen }, { id: 'mapa', label: 'Mapa', icon: Map }, { id: 'comunidad', label: 'Comunidad', icon: Users }]
const titles = { inicio: 'Tu próximo paso empieza acá.', materias: 'Cada materia, un paso más.', mapa: 'Encontrá tu camino.', comunidad: 'La carrera se hace en equipo.', planificador: 'Tu próxima selección.' }
const stateClass = s => ({ Aprobada: 'approved', Regularizada: 'regularized', Cursando: 'taking', Pendiente: 'pending' })[s]

function Sheet({ title, children, close }) {
  const [viewport, setViewport] = useState(() => ({ height: window.visualViewport?.height ?? innerHeight, top: window.visualViewport?.offsetTop ?? 0 }))
  useEffect(() => {
    const view = window.visualViewport
    let frame
    const update = () => {
      setViewport({ height: view?.height ?? innerHeight, top: view?.offsetTop ?? 0 })
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (document.activeElement?.id === 'grade') document.activeElement.scrollIntoView({ block: 'center', behavior: 'instant' })
      })
    }
    view?.addEventListener('resize', update)
    view?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => { cancelAnimationFrame(frame); view?.removeEventListener('resize', update); view?.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [])
  return <Dialog open onClose={close} className="demo-sheet-root" aria-labelledby="sheet-title" style={{ '--sheet-viewport-height': `${viewport.height}px`, '--sheet-viewport-top': `${viewport.top}px` }} slotProps={{ paper: { className: 'demo-sheet' } }}>
    <div className="sheet-handle" aria-hidden="true" /><header><h2 id="sheet-title">{title}</h2><button className="icon-btn" onClick={close} aria-label="Cerrar"><X size={21} /></button></header>{children}
  </Dialog>
}

function App() {
  const [page, setPage] = useState('inicio')
  const [status, setStatus] = useState(makeStatus)
  const [grades, setGrades] = useState(makeGrades)
  const [filter, setFilter] = useState('Todas')
  const [search, setSearch] = useState('')
  const [communityTab, setCommunityTab] = useState('Amistades')
  const [sheet, setSheet] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [selectedCode, setSelectedCode] = useState(null)
  const [selection, setSelection] = useState([])
  const [read, setRead] = useState([])
  const [joined, setJoined] = useState(makeJoined)
  const [requested, setRequested] = useState(false)
  const [notice, setNotice] = useState('')
  const [gradeDraft, setGradeDraft] = useState('')
  const [gradeError, setGradeError] = useState('')
  useAndroidBack(exit => {
    if (expanded) setExpanded(null)
    else if (sheet) setSheet(null)
    else if (page !== 'inicio') navigate('inicio')
    else exit()
  })
  const main = useRef(null)
  const stats = summary(catalog, status)
  const finals = availableFinals(catalog, status)
  const toCourse = availableToCourse(catalog, status)
  const graded = catalog.filter(s => getStatus(status, s.code) === 'Aprobada' && Number.isFinite(grades[s.code]))
  const average = graded.length ? (graded.reduce((n, s) => n + grades[s.code], 0) / graded.length).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
  const unread = notifications.filter(n => !read.includes(n.id)).length
  const visible = catalog.filter(s => {
    const match = filter === 'Todas' || (filter === 'Finales' ? finals.some(f => f.code === s.code) : getStatus(status, s.code) === filter)
    return match && `${s.name} ${s.code}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
  })
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(id) }, [notice])
  function navigate(next, destinationSheet = null) {
    setPage(next)
    setSheet(destinationSheet); setExpanded(null)
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (!destinationSheet) requestAnimationFrame(() => main.current?.focus())
  }
  function changeStatus(code, value) {
    setStatus(old => ({ ...old, [code]: value }))
    if (value !== 'Aprobada') { setGradeDraft(''); setGrades(old => { const next = { ...old }; delete next[code]; return next }) }
    setNotice('Estado actualizado en la demo')
  }
  function openSubject(subject) { setGradeDraft(grades[subject.code] ?? ''); setGradeError(''); setSheet({ type: 'subject', subject }) }
  function showFinals() { setFilter('Finales'); setSearch(''); navigate('materias') }
  function reset() {
    setStatus(makeStatus()); setGrades(makeGrades()); setSelection([]); setRead([]); setJoined(makeJoined()); setRequested(false); setSearch(''); setFilter('Todas'); setCommunityTab('Amistades'); setSelectedCode(null); navigate('inicio'); setNotice('Demo reiniciada con los datos de ejemplo')
  }
  function saveGrade(e) {
    e.preventDefault()
    if (gradeDraft !== '' && (!Number.isInteger(Number(gradeDraft)) || Number(gradeDraft) < 1 || Number(gradeDraft) > 10)) { setGradeError('Ingresá una nota entera entre 1 y 10, o dejá el campo vacío.'); return }
    const code = sheet.subject.code
    setGrades(old => { const next = { ...old }; if (gradeDraft === '') delete next[code]; else next[code] = Number(gradeDraft); return next })
    setNotice('Nota ficticia guardada; promedio actualizado'); setSheet(null)
  }
  const subject = sheet?.type === 'subject' ? sheet.subject : null
  const memberCount = g => g.members + (joined.includes(g.id) && g.membership !== 'member' ? 1 : 0)
  function activateNotification(item) {
    setRead(old => [...new Set([...old, item.id])])
    if (item.target === 'finals') showFinals()
    else if (item.target === 'group') { setCommunityTab('Grupos'); navigate('comunidad', { type: 'group', id: item.group }) }
    else { setCommunityTab('Amistades'); navigate('comunidad', { type: 'friend', friend: friends.find(f => f.id === item.friend) }) }
  }
  const group = sheet?.type === 'group' ? groups.find(g => g.id === sheet.id) : null

  return <div className="demo-stage">
    <aside className="demo-intro"><div className="intro-brand"><img src={logo} alt="" />Correlativas</div><span className="intro-kicker">EXPLORACIÓN MOBILE · 02</span><h1>Tu carrera.<br />A tu ritmo.</h1><p>Un lugar para ver lo que lograste y descubrir todo lo que viene.</p><div className="intro-points"><span><Check size={17} /> Tu progreso, a primera vista</span><span><Check size={17} /> Correlativas más claras</span><span><Check size={17} /> Mejor, con compañía</span></div><div className="intro-note"><span className="demo-dot" /> Prototipo interactivo<p>Probá las pantallas, cambiá estados y explorá el mapa. Todos los datos son ficticios y se reinician al recargar.</p><small>Notas y promedio: propuesta visual independiente del PR #4.</small></div><span className="intro-footer">HECHO PARA TU PRÓXIMO PASO <ArrowRight size={15} /></span></aside>
    <div className="demo-device">
      <div className="demo-ribbon"><span><span className="demo-dot" /> DEMO · DATOS FICTICIOS</span><button onClick={() => setSheet({ type: 'reset' })} aria-label="Reiniciar demo"><RotateCcw size={14} /> Reiniciar</button></div>
      <header className="mobile-brand"><button className="brand-home" aria-label="Correlativas, ir al inicio" onClick={() => navigate('inicio')}><img src={logo} alt="" /><span>correlativas<span className="brand-period">.</span></span></button><div className="header-actions"><button className="icon-btn notification-button" onClick={() => setSheet({ type: 'notifications' })} aria-label={`Notificaciones, ${unread} sin leer`}><Bell size={21} />{unread > 0 && <span className="notification-dot" aria-hidden="true">{unread}</span>}</button><button className="avatar lavender" onClick={() => setSheet({ type: 'profile' })} aria-label="Ver perfil ficticio de Alex">A</button></div></header>
      <main className="mobile-content" ref={main} tabIndex={-1}>
        {page === 'inicio' ? <>
          <div className="greeting"><p className="section-kicker">HOLA, ALEX <span aria-hidden="true">✦</span></p><h1>Vas construyendo<br />tu futuro.</h1><p>Un paso a la vez. Cada materia cuenta.</p></div>
          <section className="career-chip"><span className="career-icon"><GraduationCap size={21} /></span><div><strong>Ingeniería en Sistemas</strong><span>UTN Buenos Aires · Plan 2023</span></div><span className="tiny-tag">Tu carrera</span></section>
          <section className="journey-card" aria-label="Progreso académico"><div className="journey-top"><div><span className="white-kicker">TU RECORRIDO</span><h2>Todo lo que<br />ya lograste.</h2><p>{stats.approved} de {stats.total} actividades aprobadas</p></div><div className="progress-ring" style={{ '--progress': `${stats.progress * 3.6}deg` }}><div><strong>{stats.progress}<small>%</small></strong><span>completado</span></div></div></div><div className="journey-footer"><span><span className="light-dot" /> Seguí sumando a tu historia</span><ArrowRight size={18} /></div></section>
          <div className="overview-grid"><button className="overview-card" onClick={() => { setFilter('Aprobada'); navigate('materias') }}><span className="stat-symbol mint"><CheckCheck size={20} /></span><strong>{stats.approved}</strong><span>Aprobadas</span><small>¡Un gran camino!</small></button><button className="overview-card" onClick={() => { setFilter('Cursando'); navigate('materias') }}><span className="stat-symbol peach"><BookOpen size={20} /></span><strong>{stats.taking}</strong><span>En curso</span><small>Tu esfuerzo de hoy</small></button><button className="overview-card" onClick={() => setSheet({ type: 'average' })}><span className="stat-symbol lavender"><GraduationCap size={20} /></span><strong>{average}</strong><span>Promedio</span><small>Con {graded.length} notas ficticias</small></button></div>
          <div className="section-heading"><h2>Tu próximo paso</h2><span className="soft-label">SIN APURO, CON RUMBO</span></div>
          <button className="next-step-card" onClick={showFinals}><span className="next-icon"><Sparkles size={23} /></span><div><span className="section-kicker">YA ESTÁS MÁS CERCA</span><h3>{finals.length} finales para preparar</h3><p>Tus correlativas están listas. ¿Vamos?</p></div><ChevronRight size={21} /></button>
          <div className="section-heading"><h2>En lo que estás hoy</h2><button className="text-btn" onClick={() => { setFilter('Cursando'); navigate('materias') }}>Ver todas <ArrowRight size={14} /></button></div>
          <div className="subject-list">{catalog.filter(s => getStatus(status, s.code) === 'Cursando').slice(0, 2).map(s => <SubjectRow key={s.code} subject={s} status={status} grades={grades} open={openSubject} />)}</div>
          <button className="plan-shortcut" onClick={() => navigate('planificador')}><Compass size={19} /><span>Armá tu próxima selección<span>{toCourse.length} materias habilitadas para cursar</span></span><ArrowRight size={19} /></button>
        </> : <><div className="page-heading"><span className="section-kicker">{page === 'comunidad' ? 'CONECTÁ Y COMPARTÍ' : 'INGENIERÍA EN SISTEMAS · UTN'}</span><h1>{page === 'planificador' ? 'Mi selección' : pages.find(p => p.id === page)?.label}</h1><p>{titles[page]}</p></div>
          {page === 'materias' && <><label className="search-field"><Search size={19} /><input aria-label="Buscar materia" placeholder="Buscá una materia…" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="filter-scroller" role="group" aria-label="Filtrar materias" onFocusCapture={e => e.target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })}>{['Todas', 'Cursando', 'Regularizada', 'Aprobada', 'Pendiente', 'Finales'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'Aprobada' ? 'Aprobadas' : f === 'Regularizada' ? 'Regularizadas' : f === 'Pendiente' ? 'Pendientes' : f}</button>)}</div><div className="list-caption"><span>{visible.length} {visible.length === 1 ? 'materia' : 'materias'}</span><span>Plan 2023</span></div><div className="subject-list">{visible.map(s => <SubjectRow key={s.code} subject={s} status={status} grades={grades} open={openSubject} />)}</div>{!visible.length && <div className="empty-state"><Search size={30} /><h2>No encontramos materias</h2><p>Probá otro nombre o cambiá el filtro.</p><button className="primary-btn" onClick={() => { setFilter('Todas'); setSearch('') }}>Ver todas</button></div>}</>}
          {page === 'mapa' && <MobileMap subjects={catalog} statusMap={status} selectedCode={selectedCode} setSelectedCode={setSelectedCode} selection={selection} setSelection={setSelection} navigate={navigate} openSubject={openSubject} />}
          {page === 'comunidad' && <><div className="community-cover"><Users size={27} /><div><strong>Compartir también es avanzar.</strong><p>Tu gente, tu carrera, tu próximo final.</p></div></div><div className="segmented">{['Amistades', 'Grupos'].map(t => <button key={t} aria-pressed={communityTab === t} onClick={() => setCommunityTab(t)}>{t}</button>)}</div>{communityTab === 'Amistades' ? <><div className="section-heading"><h2>Tu comunidad <span className="count">3</span></h2><button className="icon-btn bordered" aria-label="Agregar amistad" onClick={() => setSheet({ type: 'add-friend' })}><Plus size={19} /></button></div>{friends.map(f => <button className="friend-card" key={f.id} onClick={() => setSheet({ type: 'friend', friend: f })}><span className={`avatar ${f.color}`}>{f.initials}</span><span><strong>{f.name}</strong><small>{f.detail}</small></span><ChevronRight size={19} /></button>)}<p className="privacy-note">Cada persona elige qué compartir. Los perfiles de esta demo son ficticios.</p></> : <>{[true, false].map(member => <section className="group-section" key={String(member)} aria-label={member ? 'Mis grupos' : 'Invitaciones pendientes'}><div className="section-heading"><h2>{member ? 'Mis grupos' : 'Invitaciones pendientes'}</h2><span className="count">{groups.filter(g => joined.includes(g.id) === member).length}</span></div>{groups.filter(g => joined.includes(g.id) === member).map(g => <GroupCard key={g.id} group={g} member={member} members={memberCount(g)} open={() => setSheet({ type: 'group', id: g.id })} />)}{!groups.some(g => joined.includes(g.id) === member) && <p className="privacy-note">{member ? 'Todavía no te sumaste a un grupo.' : 'No tenés invitaciones pendientes.'}</p>}</section>)}</>}</>}
          {page === 'planificador' && <><div className="map-tip"><Compass size={20} /><p>Seleccioná materias desde el mapa. Esta lista es una exploración, no una inscripción.</p></div>{selection.length ? selection.map(code => <div className="selection-item" key={code}><SubjectRow subject={catalog.find(s => s.code === code)} status={status} grades={grades} open={openSubject} /><button className="text-btn" onClick={() => setSelection(old => old.filter(c => c !== code))}>Quitar de mi selección</button></div>) : <div className="empty-state"><Compass size={36} /><h2>Un nuevo recorrido por armar</h2><p>En el mapa podés elegir materias habilitadas y reunirlas acá.</p></div>}<button className="primary-btn full" onClick={() => navigate('mapa')}>Explorar el mapa <ArrowRight size={18} /></button></>}
        </>}
        <footer className="mobile-footer"><img src={logo} alt="" /><span>Tu carrera, a tu ritmo.<small>Demo visual · Sin conexión a Firebase</small></span></footer>
      </main>
      <nav className="bottom-nav" aria-label="Navegación principal">{pages.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} aria-current={page === id ? 'page' : undefined}><span><Icon size={22} strokeWidth={page === id ? 2.3 : 1.8} /></span>{label}</button>)}</nav>
      <div className="demo-toast" role="status">{notice && !sheet && <span><Check size={17} />{notice}</span>}</div>
    </div>
    {sheet && <Sheet title={subject ? 'Tu materia' : group ? 'Estudiar en equipo' : ({ notifications: 'Tu actividad', profile: 'Tu perfil', average: 'Tu promedio', friend: 'Compañeros de camino', 'add-friend': 'Sumá a tu gente', reset: '¿Volvemos a empezar?' })[sheet.type]} close={() => { setSheet(null); setExpanded(null) }}>
      {subject && <><SubjectCard subject={subject} subjects={catalog} statusMap={status} onChange={changeStatus} expanded={expanded} setExpanded={setExpanded} setActivePage={navigate} setSelectedMapCode={setSelectedCode} /><p className="sheet-hint">Podés cambiar el estado: solo se modifica esta demo.</p>{getStatus(status, subject.code) === 'Aprobada' ? <form className="grade-form" onSubmit={saveGrade}><label htmlFor="grade">Nota final ficticia <span>Propuesta visual · PR #4 pendiente</span></label><input id="grade" type="number" inputMode="numeric" min="1" max="10" step="1" placeholder="Sin nota" enterKeyHint="done" autoComplete="off" value={gradeDraft} onFocus={e => e.target.scrollIntoView({ block: 'center', behavior: 'instant' })} aria-describedby="grade-help grade-error" onChange={e => { setGradeDraft(e.target.value); setGradeError('') }} /><p id="grade-help">De 1 a 10. Vacío significa «sin nota» y no entra en el promedio de la demo.</p><p id="grade-error" role="alert">{gradeError}</p><div className="grade-submit-bar"><button className="primary-btn full" type="submit">Guardar nota de ejemplo <Check size={17} /></button></div></form> : <div className="sheet-info">Las notas se muestran al marcar una materia como aprobada. La política académica definitiva se integrará desde el PR #4.</div>}<button className="secondary-btn full" onClick={() => { setSelectedCode(subject.code); navigate('mapa') }}>Ver en el mapa <Map size={17} /></button></>}
      {sheet.type === 'average' && <><div className="average-feature"><GraduationCap size={30} /><strong>{average}</strong><p>Tu promedio con {graded.length} notas de ejemplo</p></div><p className="sheet-info">Media simple de materias aprobadas con nota en esta demo; excluye las que no tienen nota. No representa todavía la implementación ni todos los criterios del PR #4.</p>{graded.map(s => <div className="grade-line" key={s.code}><span>{s.name}</span><strong>{grades[s.code]}</strong></div>)}<button className="primary-btn full" onClick={() => { setFilter('Aprobada'); navigate('materias') }}>Explorar mis notas <ArrowRight size={17} /></button></>}
      {sheet.type === 'notifications' && <><div className="notification-tools"><span>{unread} sin leer</span><button className="text-btn" onClick={() => setRead(notifications.map(n => n.id))}>Marcar todas leídas</button></div>{notifications.map(n => <button data-notification-id={n.id} className={`notification-item ${read.includes(n.id) ? 'read' : ''}`} key={n.id} onClick={() => activateNotification(n)}><span className="notification-mark"><Bell size={18} /></span><span><strong>{n.title}</strong><p>{n.detail}</p><small>{n.time}</small></span><ChevronRight size={17} /></button>)}</>}
      {sheet.type === 'profile' && <><div className="profile-feature"><span className="avatar lavender">A</span><h3>Alex Martínez</h3><p>Estudiante ficticio · Ingeniería en Sistemas</p></div><ProgressSummary subjects={catalog} statusMap={status} /><div className="sheet-info">Sin login, sin cuentas reales y sin persistencia. Los cambios viven en memoria y se pierden al recargar.</div><button className="secondary-btn full" onClick={() => setSheet({ type: 'reset' })}><RotateCcw size={17} /> Reiniciar el recorrido de ejemplo</button></>}
      {sheet.type === 'friend' && <><div className="profile-feature"><span className={`avatar ${sheet.friend.color}`}>{sheet.friend.initials}</span><h3>{sheet.friend.name}</h3><p>{sheet.friend.detail}</p></div><div className="friend-progress"><strong>{sheet.friend.progress}%</strong><span>de avance ficticio compartido</span><div style={{ '--width': `${sheet.friend.progress}%` }} /></div><button className="primary-btn full" onClick={() => { setCommunityTab('Grupos'); navigate('comunidad') }}>Ver grupos de estudio <Users size={17} /></button></>}
      {sheet.type === 'add-friend' && <><p className="sheet-info">Solicitud simulada a una persona ficticia. No se envía ningún mensaje.</p><div className="friend-card"><span className="avatar peach">SN</span><span><strong>Sofía Núñez</strong><small>Sistemas · UTN · Perfil de ejemplo</small></span></div><button className="primary-btn full" disabled={requested} onClick={() => { setRequested(true); setNotice('Solicitud ficticia registrada en la demo') }}>{requested ? 'Solicitud simulada enviada' : 'Simular solicitud de amistad'}{requested ? <Check size={18} /> : <Plus size={18} />}</button></>}
      {group && <><span className={`group-icon ${group.color}`}>{group.initials}</span><span className={`group-state ${joined.includes(group.id) ? 'member' : 'invitation'}`}>{joined.includes(group.id) ? <Check size={13} /> : <Clock3 size={13} />}{joined.includes(group.id) ? 'Mi grupo' : 'Invitación pendiente'}</span><h3 className="group-title">{group.title}</h3><p className="sheet-info">{group.detail}. Grupo y participantes ficticios, sin chat ni mensajes reales.</p><div className="group-members"><span className="avatar lavender">LF</span><span className="avatar peach">TR</span><span className="avatar mint">ML</span><span>{memberCount(group)} integrantes</span></div><button className="primary-btn full" disabled={joined.includes(group.id)} onClick={() => { setJoined(old => [...old, group.id]); setNotice('Te sumaste al grupo ficticio') }}>{joined.includes(group.id) ? 'Ya sos parte · demo' : 'Sumarme al grupo de ejemplo'}<Check size={18} /></button><button className="secondary-btn full" onClick={() => openSubject(catalog.find(s => s.code === subjectCode(group.subject)))}>Ver la materia <BookOpen size={17} /></button></>}
      {sheet.type === 'reset' && <><p className="sheet-info">Se restauran los estados, notas, selección, amistades simuladas y notificaciones de ejemplo. No se modifica ningún dato real.</p><button className="primary-btn full" onClick={reset}>Sí, reiniciar demo <RotateCcw size={17} /></button><button className="secondary-btn full" onClick={() => setSheet(null)}>Seguir explorando</button></>}
    </Sheet>}
  </div>
}

function GroupCard({ group, member, members, open }) {
  return <button className={`group-card ${member ? 'is-member' : 'is-invitation'}`} data-group-id={group.id} onClick={open}><span className={`group-icon ${group.color}`}>{group.initials}</span><span className={`group-state ${member ? 'member' : 'invitation'}`}>{member ? <Check size={12} /> : <Clock3 size={12} />}{member ? 'Mi grupo' : 'Invitación pendiente'}</span><h3>{group.title}</h3><p>{group.detail}</p><div><span className="stacked-avatars"><i>LF</i><i>TR</i><i>+{Math.max(0, members - 2)}</i></span><span>{members} integrantes</span><ArrowRight size={18} /></div></button>
}

function SubjectRow({ subject, status, grades, open }) {
  const value = getStatus(status, subject.code)
  return <button className="demo-subject-row" onClick={() => open(subject)}><span className={`subject-symbol ${stateClass(value)}`}>{value === 'Aprobada' ? <Check size={18} /> : value === 'Cursando' ? <BookOpen size={18} /> : value === 'Regularizada' ? <GraduationCap size={18} /> : <span className="pending-circle" />}</span><span className="subject-row-copy"><strong>{subject.name}</strong><small>{subject.year}° año · {subject.term}</small><span className={`demo-status ${stateClass(value)}`}>{value}{value === 'Aprobada' && (Number.isFinite(grades[subject.code]) ? ` · Nota ${grades[subject.code]}` : ' · Sin nota')}</span></span><ChevronRight size={18} /></button>
}

createRoot(document.getElementById('root')).render(<App />)
