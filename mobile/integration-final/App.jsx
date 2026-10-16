// Isolated navigation shell derived from the approved visual demo.
// Data, map, subject components, styles and academic logic remain shared imports.
import React, { useEffect, useRef, useState } from 'react'
import { Dialog } from '@mui/material'
import { ArrowRight, Bell, BookOpen, Check, CheckCheck, ChevronRight, Clock3, Compass, GraduationCap, Home, Map, Plus, RotateCcw, Search, Sparkles, Users, X, Route } from 'lucide-react'
import ProgressSummary from '../../src/components/ProgressSummary'
import { resolveSubjectRoute } from './subjectDetailModel.mjs'
import { SubjectDetailPanel } from './SubjectDetailPanel'
import './detail.css'
import { Dashboard, DashboardUnavailable } from './Dashboard'
import './dashboard.css'
import MobileMap from '../../prototypes/mobile-app/MobileMap'
import { useNavigation } from './useNavigation'
import { SecondaryPage } from '../stage2-navigation/NavigationPages'
import { getStatus, getSubjectLevel } from '../../src/logic'
import logo from '../../public/logo.png'
import { friends, groups, makeJoined, notifications, subjectCode } from '../../prototypes/mobile-app/data'
import '../../src/styles.css'
import '../../prototypes/mobile-app/mobile.css'
import '../stage2-navigation/navigation.css'
import './sixNavigation.css'
import './contexts.css'
import { useAcademicDemo } from './useAcademicDemo'
import { ContextPage, ContextSelector, ContextUnavailable, ScenarioPicker } from './ContextPages'
import { CareerWizard } from './CareerWizard'
import './careers.css'
import { AcademicFeedback } from './AcademicSimulation'
import { EMPTY_FILTERS } from './subjectFilters.mjs'
import { SubjectsList, SubjectFilters } from './SubjectsList'
import './subjects.css'
import './presentation.css'
import { CareerAdded } from '../career-onboarding/CareerAdded'
import {AcademicOnboarding,OnboardingEntry} from './AcademicOnboarding'
import { SYSTEMS } from './contextModel.mjs'

const pages = [{ id: 'inicio', label: 'Inicio', icon: Home }, { id: 'materias', label: 'Materias', icon: BookOpen }, { id: 'mapa', label: 'Mapa', icon: Map }, { id: 'planificador', label: 'Planificar', icon: Compass }, { id: 'proyeccion', label: 'Proyectar', icon: Route }, { id: 'comunidad', label: 'Comunidad', icon: Users }]
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

export default function App({ careerOnboarding = false }) {
  const demo = useAcademicDemo()
  return <AccountSession key={demo.generation} demo={demo} careerOnboarding={careerOnboarding} />
}
function AccountSession({ demo, careerOnboarding }) {
  const [read, setRead] = useState([])
  const [joined, setJoined] = useState(makeJoined)
  const [requested, setRequested] = useState(false)
  const [careerDraft, setCareerDraft] = useState(null)
  const [onboardingRequest, setOnboardingRequest] = useState(null)
  const social = { onboardingRequest, setOnboardingRequest, careerDraft, setCareerDraft, read, setRead, joined, setJoined, requested, setRequested }
  const key = `${demo.state.uid}:${demo.context.key}:${demo.context.authority}:${demo.context.phase}`
  return <ContextExperience key={key} demo={demo} social={social} careerOnboarding={careerOnboarding} />
}
function ContextExperience({ demo, social, careerOnboarding }) {
  const catalog = demo.context.career?.subjects ?? []
  const career = demo.context.career
  const { stats, finals, toCourse, status } = demo.presentation
  const { read, setRead, joined, setJoined, requested, setRequested } = social
  const navigation = useNavigation()
  const { page, sheet } = navigation.route
  const addingCareer = page.startsWith('alta-')
  const setSheet = navigation.panel
  const [filters, setFilters] = useState(() => ({...EMPTY_FILTERS}))
  const setFilter = value => setFilters({...EMPTY_FILTERS, status: ['Todas','Finales'].includes(value) ? '' : value, criteria: value === 'Finales' ? ['finals'] : []})
  const [search, setSearch] = useState('')
  const [communityTab, setCommunityTab] = useState('Amistades')
  const [selectedCode, setSelectedCode] = useState(null)
  const [selection, setSelection] = useState([])
  const [notice, setNotice] = useState('')
  const main = useRef(null)
  const unread = notifications.filter(n => !read.includes(n.id)).length
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(id) }, [notice])
  const navigate = navigation.go
  const startOnboarding=()=>{if(demo.beginOnboarding())navigate('onboarding')} 
  function openSubject(subject) { if (!demo.context.usable || !subject || !catalog.some(s=>s.code===subject.code)) return; setSheet({type:'subject',code:subject.code,scopeKey:demo.context.key}) }
  function showFinals() { setFilter('Finales'); setSearch(''); navigate('materias') }
  function reset() { navigate('inicio'); demo.reset() }
  const subject = resolveSubjectRoute(demo.presentation,demo.context,sheet)
  useEffect(() => { if (sheet?.type === 'subject' && !subject) navigation.replace(page) }, [sheet, subject, page])
  const memberCount = g => g.members + (joined.includes(g.id) && g.membership !== 'member' ? 1 : 0)
  function activateNotification(item) {
    if (item.target === 'finals' && (!demo.context.usable || career?.id !== SYSTEMS)) { setNotice(!demo.context.usable ? 'Esta actividad académica no está disponible en este contexto. No se cambió tu carrera.' : 'Esta actividad de ejemplo corresponde a Sistemas (UTN). Elegí esa carrera para verla.'); return }
    setRead(old => [...new Set([...old, item.id])])
    if (item.target === 'finals') showFinals()
    else if (item.target === 'group') { setCommunityTab('Grupos'); navigate('comunidad', { type: 'group', id: item.group }) }
    else { setCommunityTab('Amistades'); navigate('comunidad', { type: 'friend', friend: friends.find(f => f.id === item.friend) }) }
  }
  const group = sheet?.type === 'group' ? groups.find(g => g.id === sheet.id) : null
  // Selection remains explicit. This intent survives the context-key remount,
  // but is consumed once and is never persisted or applied to another account.
  useEffect(() => {
    const request = social.onboardingRequest
    if (!careerOnboarding || !request) return
    social.setOnboardingRequest(null)
    if (request.uid !== demo.state.uid || request.instanceId !== demo.context.activeCareerInstanceId) return
    if (demo.beginOnboarding()) navigate('onboarding')
  }, [social.onboardingRequest, demo.context.key])
  const configureTarget = sheet?.type === 'configure-context' && sheet.uid === demo.state.uid && sheet.scopeKey === demo.context.key
    ? demo.state.instances.find(i => i.careerInstanceId === sheet.instanceId && i.lifecycle === 'active') : null
  function requestConfigure(instanceId) {
    if (!instanceId || instanceId === demo.context.activeCareerInstanceId) { startOnboarding(); return }
    const target = demo.state.instances.find(i => i.careerInstanceId === instanceId && i.lifecycle === 'active')
    setNotice('')
    if (target) setSheet({type:'configure-context',instanceId,uid:demo.state.uid,scopeKey:demo.context.key})
  }
  function confirmConfigure() {
    if (!configureTarget) return
    try {
      demo.act('select',configureTarget.careerInstanceId)
      social.setOnboardingRequest({uid:demo.state.uid,instanceId:configureTarget.careerInstanceId})
      social.setCareerDraft(null)
    } catch { setNotice('No se pudo cambiar el contexto. Tus datos se conservan; volvé a Mis carreras para reintentar.') }
  }
  const addedInstance = careerOnboarding && social.careerDraft?.added
    ? demo.state.instances.find(i => i.careerInstanceId === social.careerDraft.added) : null


  return <div className="demo-stage final-navigation-stage">
    <aside className="demo-intro"><div className="intro-brand"><img src={logo} alt="" />Correlativas</div><span className="intro-kicker">MOBILE 2.3.6 · INTEGRACIÓN</span><h1>Tu carrera.<br />A tu ritmo.</h1><p>Un lugar para ver lo que lograste y descubrir todo lo que viene.</p><div className="intro-points"><span><Check size={17} /> Tu progreso, a primera vista</span><span><Check size={17} /> Correlativas más claras</span><span><Check size={17} /> Mejor, con compañía</span></div><div className="intro-note"><span className="demo-dot" /> Contextos académicos · datos ficticios<p>Probá las pantallas, cambiá estados y explorá el mapa. Los datos ficticios se conservan sólo en este navegador.</p><small>Operaciones simuladas. Sin servicios externos.</small></div><span className="intro-footer">HECHO PARA TU PRÓXIMO PASO <ArrowRight size={15} /></span></aside>
    <div className="demo-device">
      <div className="demo-ribbon"><span><span className="demo-dot" /> DEMO · DATOS FICTICIOS</span><button onClick={() => setSheet({ type: 'reset' })} aria-label="Reiniciar demo"><RotateCcw size={14} /> Reiniciar</button></div>
      {!addingCareer && <header className="mobile-brand"><button className="brand-home" aria-label="Correlativas, ir al inicio" onClick={() => navigate('inicio')}><img src={logo} alt="" /><span>correlativas<span className="brand-period">.</span></span></button><div className="header-actions"><button className="icon-btn notification-button" onClick={() => setSheet({ type: 'notifications' })} aria-label={`Notificaciones, ${unread} sin leer`}><Bell size={21} />{unread > 0 && <span className="notification-dot" aria-hidden="true">{unread}</span>}</button><button className="avatar lavender" onClick={() => navigate('cuenta')} aria-label="Abrir Cuenta de Alex, perfil ficticio">A</button></div></header>}
      {!addingCareer && <ContextSelector demo={demo} navigate={navigate} />}
      <main className="mobile-content" ref={main} tabIndex={-1} id="navigation-content">
        {!addingCareer && navigation.canBack && <button className="text-btn navigation-back" onClick={navigation.back} aria-label="Volver a la pantalla anterior">← Volver</button>}
        {demo.storageWarning&&<p role="status" className="demo-storage-warning">{demo.storageWarning}</p>}
        {['inicio','materias'].includes(page) && <AcademicFeedback demo={demo} />}
        {page==='onboarding'?<AcademicOnboarding demo={demo} navigate={navigate} gestures={careerOnboarding}/>:addingCareer ? <CareerWizard onAdded={careerOnboarding ? (instanceId,catalogId) => {social.setCareerDraft({added:instanceId,reveal:catalogId});navigation.replace('carreras')} : undefined} demo={demo} navigation={navigation} draft={social.careerDraft} setDraft={social.setCareerDraft} /> : page === 'carreras' && addedInstance ? <CareerAdded demo={demo} instance={addedInstance} configure={() => requestConfigure(addedInstance.careerInstanceId)} later={() => social.setCareerDraft({reveal:addedInstance.catalogId})}/> : page === 'carreras' ? <ContextPage onConfigure={careerOnboarding ? requestConfigure : undefined} demo={demo} reveal={social.careerDraft?.reveal} navigate={navigate} startAdd={() => { social.setCareerDraft({ university: '', career: '', catalogId: '', queries: ['', ''] }); navigate('alta-universidad') }} /> : page === 'cuenta' ? <><SecondaryPage page={page} navigate={navigate} /><ScenarioPicker demo={demo} /></> : page === 'inicio' && (!demo.context.usable || demo.presentation.dataError) ? <DashboardUnavailable demo={demo} navigate={navigate} /> : demo.presentation.dataError && page !== 'comunidad' ? <section className="context-empty"><h1>Progreso no disponible</h1><p>No se pudieron interpretar los datos ficticios. No se reemplazaron por materias pendientes. Elegí otro escenario desde Cuenta para continuar.</p></section> : !demo.context.usable && page !== 'comunidad' ? <ContextUnavailable demo={demo} navigate={navigate} /> : page === 'proyeccion' ? <SecondaryPage page={page} navigate={navigate} /> : <>
        {page === 'inicio' ? <><Dashboard onboardingEntry={<OnboardingEntry demo={demo} start={startOnboarding}/>} demo={demo} navigate={navigate} onState={state => {setFilter(state);setSearch('');navigate('materias')}} onCourse={() => {setFilters({...EMPTY_FILTERS,criteria:['course']});setSearch('');navigate('materias')}} onFinals={showFinals} /></> : <><div className="page-heading"><span className="section-kicker">{page === 'comunidad' ? 'CONECTÁ Y COMPARTÍ' : `${career?.name ?? 'Sin selección'} · ${career?.university ?? ''}`}</span><h1>{page === 'planificador' ? 'Planificar' : pages.find(p => p.id === page)?.label}</h1><p>{titles[page]}</p></div>
          {page === 'materias' && <SubjectsList model={demo.presentation} filters={filters} setFilters={setFilters} query={search} setQuery={setSearch} plan={career?.plan} openSubject={openSubject} openFilters={() => setSheet({type:'subject-filters'})} />}
          {page === 'mapa' && <MobileMap subjects={catalog} statusMap={status} selectedCode={selectedCode} setSelectedCode={setSelectedCode} selection={selection} setSelection={setSelection} navigate={navigate} openSubject={openSubject} />}
          {page === 'comunidad' && <><div className="community-cover"><Users size={27} /><div><strong>Compartir también es avanzar.</strong><p>Tu gente, tu carrera, tu próximo final.</p></div></div><div className="segmented">{['Amistades', 'Grupos'].map(t => <button key={t} aria-pressed={communityTab === t} onClick={() => setCommunityTab(t)}>{t}</button>)}</div>{communityTab === 'Amistades' ? <><div className="section-heading"><h2>Tu comunidad <span className="count">3</span></h2><button className="icon-btn bordered" aria-label="Agregar amistad" onClick={() => setSheet({ type: 'add-friend' })}><Plus size={19} /></button></div>{friends.map(f => <button className="friend-card" key={f.id} onClick={() => setSheet({ type: 'friend', friend: f })}><span className={`avatar ${f.color}`}>{f.initials}</span><span><strong>{f.name}</strong><small>{f.detail}</small></span><ChevronRight size={19} /></button>)}<p className="privacy-note">Cada persona elige qué compartir. Perfiles y grupos ficticios de Sistemas (UTN), independientes del contexto seleccionado.</p></> : <>{[true, false].map(member => <section className="group-section" key={String(member)} aria-label={member ? 'Mis grupos' : 'Invitaciones pendientes'}><div className="section-heading"><h2>{member ? 'Mis grupos' : 'Invitaciones pendientes'}</h2><span className="count">{groups.filter(g => joined.includes(g.id) === member).length}</span></div>{groups.filter(g => joined.includes(g.id) === member).map(g => <GroupCard key={g.id} group={g} member={member} members={memberCount(g)} open={() => setSheet({ type: 'group', id: g.id })} />)}{!groups.some(g => joined.includes(g.id) === member) && <p className="privacy-note">{member ? 'Todavía no te sumaste a un grupo.' : 'No tenés invitaciones pendientes.'}</p>}</section>)}</>}</>}
          {page === 'planificador' && <><nav className="segmented" aria-label="Vistas de planificación"><button aria-current="page">Mi selección</button><button onClick={() => navigate('proyeccion')}>Proyectar Carrera</button></nav><div className="map-tip"><Compass size={20} /><p>Seleccioná materias desde el mapa. Esta lista es una exploración, no una inscripción.</p></div>{selection.length ? selection.map(code => <div className="selection-item" key={code}><SubjectRow subject={catalog.find(s => s.code === code)} status={status} open={openSubject} /><button className="text-btn" onClick={() => setSelection(old => old.filter(c => c !== code))}>Quitar de mi selección</button></div>) : <div className="empty-state"><Compass size={36} /><h2>Un nuevo recorrido por armar</h2><p>En el mapa podés elegir materias habilitadas y reunirlas acá.</p></div>}<button className="primary-btn full" onClick={() => navigate('mapa')}>Explorar el mapa <ArrowRight size={18} /></button></>}
        </>}
        </>}<footer className="mobile-footer"><img src={logo} alt="" /><span>Tu carrera, a tu ritmo.<small>Demo visual · Sin conexión a Firebase</small></span></footer>
      </main>
      {!addingCareer && <nav className="bottom-nav" aria-label="Navegación principal">{pages.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} aria-current={page === id ? 'page' : undefined}><span><Icon size={22} strokeWidth={page === id ? 2.3 : 1.8} /></span><span className="bottom-nav-label">{label}</span></button>)}</nav>}
      <div className="demo-toast" role="status">{notice && !sheet && <span><Check size={17} />{notice}</span>}</div>
    </div>
    {sheet?.type === 'subject' && subject && <SubjectDetailPanel demo={demo} code={subject.code} close={() => setSheet(null)} onMap={() => {setSelectedCode(subject.code);navigate('mapa')}} />}
    {sheet && sheet.type !== 'subject' && <Sheet title={subject ? 'Tu materia' : group ? 'Estudiar en equipo' : ({ 'subject-filters': 'Filtrar materias', notifications: 'Tu actividad', profile: 'Tu perfil', friend: 'Compañeros de camino', 'add-friend': 'Sumá a tu gente', 'configure-context': 'Cambiar de carrera', reset: '¿Volvemos a empezar?' })[sheet.type]} close={() => setSheet(null)}>
      {sheet.type === 'subject-filters' && <SubjectFilters model={demo.presentation} filters={filters} query={search} onCancel={() => setSheet(null)} onApply={next => {setFilters(next);setSheet(null)}} />}
      {sheet.type === 'notifications' && <>{notice && <p role="status" className="context-notice">{notice}</p>}<div className="notification-tools"><span>{unread} sin leer</span><button className="text-btn" onClick={() => setRead(notifications.map(n => n.id))}>Marcar todas leídas</button></div>{notifications.map(n => <button data-notification-id={n.id} className={`notification-item ${read.includes(n.id) ? 'read' : ''}`} key={n.id} onClick={() => activateNotification(n)}><span className="notification-mark"><Bell size={18} /></span><span><strong>{n.title}</strong><p>{n.detail}</p><small>{n.time}</small></span><ChevronRight size={17} /></button>)}</>}
      {sheet.type === 'friend' && <><div className="profile-feature"><span className={`avatar ${sheet.friend.color}`}>{sheet.friend.initials}</span><h3>{sheet.friend.name}</h3><p>{sheet.friend.detail}</p></div><div className="friend-progress"><strong>{sheet.friend.progress}%</strong><span>de avance ficticio compartido</span><div style={{ '--width': `${sheet.friend.progress}%` }} /></div><button className="primary-btn full" onClick={() => { setCommunityTab('Grupos'); navigate('comunidad') }}>Ver grupos de estudio <Users size={17} /></button></>}
      {sheet.type === 'configure-context' && <>{notice && <p role="alert">{notice}</p>}<p className="sheet-info career-context-explanation">{configureTarget ? `Para configurar ${demo.careers.find(c=>c.id===configureTarget.catalogId)?.name ?? 'esta carrera'} · Plan ${demo.careers.find(c=>c.id===configureTarget.catalogId)?.plan ?? ''}, necesitamos cambiar la carrera seleccionada. Tu progreso y la carga pausada de la carrera actual se conservan.` : 'Esta trayectoria ya no está disponible. No se cambió el contexto ni se inició una carga.'}</p><button className="primary-btn full" disabled={!configureTarget} onClick={confirmConfigure}>Cambiar y configurar</button><button className="secondary-btn full" onClick={()=>setSheet(null)}>Cancelar</button></>}
      {sheet.type === 'add-friend' && <><p className="sheet-info">Solicitud simulada a una persona ficticia. No se envía ningún mensaje.</p><div className="friend-card"><span className="avatar peach">SN</span><span><strong>Sofía Núñez</strong><small>Sistemas · UTN · Perfil de ejemplo</small></span></div><button className="primary-btn full" disabled={requested} onClick={() => { setRequested(true); setNotice('Solicitud ficticia registrada en la demo') }}>{requested ? 'Solicitud simulada enviada' : 'Simular solicitud de amistad'}{requested ? <Check size={18} /> : <Plus size={18} />}</button></>}
      {group && <><span className={`group-icon ${group.color}`}>{group.initials}</span><span className={`group-state ${joined.includes(group.id) ? 'member' : 'invitation'}`}>{joined.includes(group.id) ? <Check size={13} /> : <Clock3 size={13} />}{joined.includes(group.id) ? 'Mi grupo' : 'Invitación pendiente'}</span><h3 className="group-title">{group.title}</h3><p className="sheet-info">{group.detail}. Grupo y participantes ficticios, sin chat ni mensajes reales.</p><div className="group-members"><span className="avatar lavender">LF</span><span className="avatar peach">TR</span><span className="avatar mint">ML</span><span>{memberCount(group)} integrantes</span></div><button className="primary-btn full" disabled={joined.includes(group.id)} onClick={() => { setJoined(old => [...old, group.id]); setNotice('Te sumaste al grupo ficticio') }}>{joined.includes(group.id) ? 'Ya sos parte · demo' : 'Sumarme al grupo de ejemplo'}<Check size={18} /></button><button className="secondary-btn full" disabled={career?.id !== SYSTEMS || !catalog.some(s => s.code === subjectCode(group.subject))} onClick={() => openSubject(catalog.find(s => s.code === subjectCode(group.subject)))}>Ver la materia <BookOpen size={17} /></button></>}
      {sheet.type === 'reset' && <><p className="sheet-info">Se restauran los estados, selección, amistades simuladas y notificaciones de ejemplo. No se modifica ningún dato real.</p><button className="primary-btn full" onClick={reset}>Sí, reiniciar demo <RotateCcw size={17} /></button><button className="secondary-btn full" onClick={() => setSheet(null)}>Seguir explorando</button></>}
    </Sheet>}
  </div>
}

function GroupCard({ group, member, members, open }) {
  return <button className={`group-card ${member ? 'is-member' : 'is-invitation'}`} data-group-id={group.id} onClick={open}><span className={`group-icon ${group.color}`}>{group.initials}</span><span className={`group-state ${member ? 'member' : 'invitation'}`}>{member ? <Check size={12} /> : <Clock3 size={12} />}{member ? 'Mi grupo' : 'Invitación pendiente'}</span><h3>{group.title}</h3><p>{group.detail}</p><div><span className="stacked-avatars"><i>LF</i><i>TR</i><i>+{Math.max(0, members - 2)}</i></span><span>{members} integrantes</span><ArrowRight size={18} /></div></button>
}

function SubjectRow({ subject, status, open }) {
  const value = getStatus(status, subject.code)
  return <button className="demo-subject-row" onClick={() => open(subject)}><span className={`subject-symbol ${stateClass(value)}`}>{value === 'Aprobada' ? <Check size={18} /> : value === 'Cursando' ? <BookOpen size={18} /> : value === 'Regularizada' ? <GraduationCap size={18} /> : <span className="pending-circle" />}</span><span className="subject-row-copy"><strong>{subject.name}</strong><small>{getSubjectLevel(subject)}{subject.term ? ` · ${subject.term}` : ''}</small><span className={`demo-status ${stateClass(value)}`}>{value}</span></span><ChevronRight size={18} /></button>
}
