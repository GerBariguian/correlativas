import useAcademicBridge from './hooks/useAcademicBridge'
import InstanceSelection from './components/InstanceSelection'
import MyCareers from './components/MyCareers'
import JointPlanHistory from './components/JointPlanHistory'
import useActivity from './hooks/useActivity'
import CareerSelector from './components/CareerSelector'
import CareerProjectionPage from './components/CareerProjectionPage'
import useCareerProjection from './hooks/useCareerProjection'
import usePlannerSession from './hooks/usePlannerSession'
import { Route } from 'lucide-react'
import PlannerPage from './components/PlannerPage'
import CareerMap from './components/CareerMap'
import Header from './components/Header'
import SubjectsPanel from './components/SubjectsPanel'
import Advisor from './components/Advisor'
import WelcomeSetup from './components/WelcomeSetup'
import FriendsPage from './components/FriendsPage'
import useSocialProfile from './hooks/useSocialProfile'
import { onAuthStateChanged, signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import {
  saveUserProfile,
} from './services/firestore'
import Dashboard from './components/Dashboard'
import { useEffect, useMemo, useRef, useState } from 'react'
import { careers } from './data/careers'
import {
  availableFinals,
  availableToCourse,
  blockedSubjects,
  getStatus,
  getSubjectLevel,
  recommendations,
  summary,
  unlocks,
} from './logic'

const DEFAULT_CAREER_ID = careers[0].id
const EMPTY_SUBJECTS = [], EMPTY_STATUS = {}

const STORAGE_KEY_PREFIX = 'correlativas-status'

// Anonymous legacy keys remain untouched: their owner cannot be determined safely.
function cacheStatus(uid, careerId, map) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + '-' + uid + '-' + careerId, JSON.stringify(map))
  } catch (error) {
    console.error('No se pudo actualizar la copia local del progreso.', error)
  }
}

function App() {
  const [activeCareerId, setActiveCareerId] = useState(DEFAULT_CAREER_ID)
  const [user, setUser] = useState(null)
  const bridge = useAcademicBridge(user, activeCareerId)
  const activity = useActivity(user)
  const [activityIntent, setActivityIntent] = useState(null)
  const [activityNotice, setActivityNotice] = useState('')
  const activitySequence = useRef(0)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(true)
  const [careerRevision, setCareerRevision] = useState(0)
  const [hasChosenCareer, setHasChosenCareer] = useState(false)
  const [statusMap, setStatusMap] = useState(careers[0].initialStatus)
  const [statusScope, setStatusScope] = useState(null)
  const [view, setView] = useState('all')
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [selectedMapCode, setSelectedMapCode] = useState(null)
  const planner = usePlannerSession(user?.uid ?? null, bridge.key)
  const plannerSelectedCodes = planner.selectedCodes
  const setPlannerSelectedCodes = planner.setSelectedCodes
  const session = useRef(null)
  const progress = useRef(null)
  const writes = useRef(Promise.resolve())
  const confirmedCareer = useRef(DEFAULT_CAREER_ID)
  const confirmedSource = useRef(null)
  const activeCareer = careers.find((career) => career.id === activeCareerId
    && (bridge.authority !== 'instances' || bridge.scope?.catalogId === career.id))
  const subjects = activeCareer?.subjects ?? EMPTY_SUBJECTS
  const initialStatus = activeCareer?.initialStatus ?? EMPTY_STATUS
  const socialProfile = useSocialProfile(user, activeCareerId,
    (!profileLoading && hasChosenCareer) || ['frozen', 'instances'].includes(bridge.authority), !bridge.capabilities.legacySocial)
  const personalProjection = useCareerProjection(user, activeCareerId,
    activePage === 'projection' && !profileLoading && hasChosenCareer && !statusLoading, bridge)

  function isCurrentSession(token) {
    return Boolean(token) && session.current === token && auth.currentUser?.uid === token.uid
  }

  // Serialize mutations, including reset, without poisoning the queue on failure.
  function enqueueWrite(task) {
    const result = writes.current.then(task)
    writes.current = result.catch(() => {})
    return result
  }

  function reportError(error) {
    console.error('Error de sincronización con Firestore.', error)
    window.alert('No se pudo sincronizar con Firebase. Revisá tu conexión y recargá la página para reintentar.')
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      session.current = currentUser ? { uid: currentUser.uid } : null
      progress.current = null
      confirmedCareer.current = DEFAULT_CAREER_ID
      confirmedSource.current = null
      setUser(currentUser)
      setActivityIntent(null)
      setActivityNotice('')
      setHasChosenCareer(false)
      setProfileLoading(Boolean(currentUser))
      setStatusLoading(true)
      setActiveCareerId(DEFAULT_CAREER_ID)
      setStatusMap(careers[0].initialStatus)
      setAuthLoading(false)
    })
    return () => {
      unsubscribe()
      session.current = null
      progress.current = null
    }
  }, [])

  useEffect(() => {
    if (!user || ['loading', 'frozen', 'invalid'].includes(bridge.authority)) return
    const catalog = careers.find(item => item.id === bridge.catalogId)
    const chosen = catalog?.id ?? (bridge.authority === 'legacy' ? DEFAULT_CAREER_ID : null)
    if (confirmedSource.current !== bridge.key || confirmedCareer.current !== chosen) {
      progress.current = null
      setStatusLoading(true)
    }
    confirmedSource.current = bridge.key
    confirmedCareer.current = chosen
    setActiveCareerId(chosen)
    setHasChosenCareer(Boolean(catalog))
    setProfileLoading(false)
  }, [user, bridge.authority, bridge.catalogId, bridge.activeCareerInstanceId])

  useEffect(() => {
    progress.current = null
    if (!user || profileLoading || !hasChosenCareer || !bridge.source || !bridge.capabilities.academicWrite
      || bridge.source.scope.catalogId !== activeCareerId) return
    const token = session.current
    let cancelled = false
    let stop = () => {}
    setStatusLoading(true)
    setExpanded(null)
    setSelectedMapCode(null)
    async function loadStatusForCareer() {
      try {
        await writes.current
        if (cancelled || !isCurrentSession(token)) return
        if (activePage === 'projection') {
          // This branch replaces the one-shot loader; both never write concurrently.
          stop = bridge.source.subscribe(({ statusMap: cloudStatus, revision }) => {
            if (cancelled || !isCurrentSession(token) || confirmedCareer.current !== activeCareerId) return
            const map = cloudStatus ?? (bridge.authority === 'instances' ? EMPTY_STATUS : initialStatus)
            progress.current = { token, careerId: activeCareerId, source: bridge.source, revision, map }
            setStatusMap(map)
            setStatusScope(bridge.key)
            cacheStatus(user.uid, bridge.key, map)
            setStatusLoading(false)
          }, error => { if (!cancelled && isCurrentSession(token)) reportError(error) })
          return
        }
        const { statusMap: cloudStatus, revision } = await bridge.source.load()
        if (cancelled || !isCurrentSession(token) || confirmedCareer.current !== activeCareerId) return
        const map = cloudStatus ?? (bridge.authority === 'instances' ? EMPTY_STATUS : initialStatus)
        progress.current = { token, careerId: activeCareerId, source: bridge.source, revision, map }
        setStatusMap(map)
        setStatusScope(bridge.key)
        cacheStatus(user.uid, bridge.key, map)
        setStatusLoading(false)
      } catch (error) {
        // Keep editing gated rather than overwrite an unreadable cloud record.
        if (!cancelled && isCurrentSession(token)) reportError(error)
      }
    }
    loadStatusForCareer()
    return () => {
      cancelled = true
      stop()
      progress.current = null
    }
  }, [user, profileLoading, hasChosenCareer, activeCareerId, initialStatus, careerRevision, activePage === 'projection', bridge.key, bridge.capabilities.academicWrite])

  async function changeCareer(careerId, finishSetup = false) {
    if (!bridge.canWrite() || bridge.authority !== 'legacy') return
    if (!careers.some((career) => career.id === careerId)) return
    if (!hasChosenCareer && !finishSetup) {
      setActiveCareerId(careerId)
      return
    }
    const token = session.current
    if (!isCurrentSession(token)) return
    try {
      await enqueueWrite(async () => {
        if (!isCurrentSession(token)) return
        await saveUserProfile(token.uid, { activeCareerId: careerId })
        if (!isCurrentSession(token)) return
        if (careerId !== confirmedCareer.current) {
          setCareerRevision((revision) => revision + 1)
          progress.current = null
          setStatusLoading(true)
        }
        confirmedCareer.current = careerId
        setActiveCareerId(careerId)
        if (finishSetup) setHasChosenCareer(true)
      })
    } catch (error) {
      if (isCurrentSession(token)) reportError(error)
    }
  }

  const stats = useMemo(() => summary(subjects, statusMap), [subjects, statusMap])
  const toCourse = useMemo(() => availableToCourse(subjects, statusMap), [subjects, statusMap])
  const finals = useMemo(() => availableFinals(subjects, statusMap), [subjects, statusMap])
  const blocked = useMemo(() => blockedSubjects(subjects, statusMap), [subjects, statusMap])
  const recs = useMemo(() => recommendations(subjects, statusMap), [subjects, statusMap])
  const criticalSubjects = useMemo(() => {
    return subjects
      .map((subject) => ({
        ...subject,
        unlocksCount: unlocks(subjects, subject.code).length,
      }))
      .filter((subject) => getStatus(statusMap, subject.code) !== 'Aprobada')
      .sort((a, b) => b.unlocksCount - a.unlocksCount)
      .slice(0, 5)
  }, [subjects, statusMap])

  async function persistStatus(transform) {
    const context = progress.current
    if (!context || !isCurrentSession(context.token) || !bridge.canWrite()) return
    try {
      await enqueueWrite(async () => {
        if (!isCurrentSession(context.token)) return
        const nextMap = transform(context.map)
        context.revision = await context.source.save(nextMap, context.revision)
        context.map = nextMap
        if (!isCurrentSession(context.token)) return
        cacheStatus(context.token.uid, context.source.key, nextMap)
        if (progress.current === context) setStatusMap(nextMap)
      })
    } catch (error) {
      if (isCurrentSession(context.token)) reportError(error)
    }
  }

  function updateStatus(code, next) {
    return persistStatus((current) => ({ ...current, [code]: next }))
  }

  function reset() {
    return persistStatus(() => initialStatus)
  }

  const shownSubjects = subjects.filter((subject) => {
    const q = `${subject.name} ${subject.code}`.toLowerCase()
    const subjectLevel = getSubjectLevel(subject)

    if (query && !q.includes(query.toLowerCase())) return false
    if (year && subjectLevel !== year) return false
    if (view === 'course') return toCourse.some((s) => s.code === subject.code)
    if (view === 'finals') return finals.some((s) => s.code === subject.code)
    if (view === 'blocked') return blocked.some((s) => s.code === subject.code)
    if (view === 'unlocks') return unlocks(subjects, subject.code).length > 0

    return true
  })

  if (authLoading) {
  return (
    <main className="app-shell">
      <section className="placeholder-page">
        <p className="eyebrow">Correlativas</p>
        <h2>Cargando...</h2>
      </section>
    </main>
  )
}

if (!user) {
  return (
    <main className="app-shell">
      <section className="login-page">
        <div className="login-card">
          <img
  	    src="/logo.png"
  	    alt="Correlativas"
  	    className="login-logo"
	  />

          <p className="eyebrow">Correlativas</p>
          <h1>Planificá tu carrera universitaria</h1>

          <p>
            Descubrí qué materias podés cursar, qué finales podés rendir y
            guardá tu progreso en la nube.
          </p>

          <div className="login-features">
            <span>📚 Múltiples carreras</span>
            <span>🗺️ Mapa de correlativas</span>
            <span>🧠 Planificador inteligente</span>
          </div>

          <button
            className="login-google-btn"
            onClick={() => signInWithPopup(auth, googleProvider)}
          >
            Continuar con Google
          </button>
        </div>
      </section>
    </main>
  )
}

function startWithCareer() {
  return changeCareer(activeCareerId, true)
}

if ((profileLoading || (bridge.phase === 'blocked' && !bridge.source))
  && (['frozen', 'invalid'].includes(bridge.authority) || bridge.phase === 'blocked')) {
  return <main className="app-shell">
    <Header user={user} activity={activity} onActivityNavigate={result => setActivePage(result.destination === 'friends' ? 'amigos' : 'planificador')} />
    <section className="side-card" role="status">
      <p>{bridge.authority === 'frozen' ? 'Estamos actualizando tu cuenta. Volvé a intentar en unos instantes.'
        : 'No pudimos verificar el estado de tu cuenta. La edición está suspendida para proteger tus datos.'}</p>
      <button onClick={bridge.retry}>Reintentar</button>
    </section>
    <FriendsPage user={user} socialProfile={socialProfile} careerId={null} academicSharing={false} />
    <JointPlanHistory user={user} />
  </main>
}


if ((profileLoading || (activePage !== 'careers' && hasChosenCareer && activeCareer && (statusLoading || statusScope !== bridge.key)))
  && !['frozen', 'invalid'].includes(bridge.authority) && bridge.phase !== 'blocked') {
  return (
    <main className="app-shell">
      <section className="placeholder-page">
        <p className="eyebrow">Correlativas</p>
        <h2>Cargando perfil...</h2>
      </section>
    </main>
  )
}

if (!hasChosenCareer && bridge.authority === 'legacy') {
  return (
    <main className="app-shell">
      <WelcomeSetup
        careers={careers}
        activeCareerId={activeCareerId}
        setActiveCareerId={changeCareer}
        onContinue={startWithCareer}
      />
    </main>
  )
}


  return (
    <main className="app-shell">
      <Header user={user} activity={activity} onActivityNavigate={result => {
        if (auth.currentUser !== user) return
        setActivityNotice(result.notice || '')
        if (result.destination === 'friends') { setActivityIntent(null); setActivePage('amigos') }
        else { setActivityIntent({ token: ++activitySequence.current, planId: result.planId || '', notice: result.notice || '' }); setActivePage('planificador') }
      }} />
      {activityNotice && <p role="status" className="activity-navigation-notice">{activityNotice}<button type="button" onClick={() => setActivityNotice('')}>Cerrar</button></p>}
      {bridge.authority === 'instances' ? <InstanceSelection bridge={bridge} careers={careers} onManage={() => setActivePage('careers')} /> :
        <fieldset disabled={!bridge.capabilities.select} style={{ border: 0, padding: 0, margin: 0 }}>
          <CareerSelector careers={careers} activeCareerId={activeCareerId} setActiveCareerId={changeCareer} />
        </fieldset>}
      {['frozen', 'invalid'].includes(bridge.authority) && <section role="status" className="side-card">
        <p>{bridge.authority === 'frozen' ? 'Estamos actualizando tu cuenta. Volvé a intentar en unos instantes.'
          : 'No pudimos verificar el estado de tu cuenta. La edición está suspendida para proteger tus datos.'}</p>
        <button onClick={bridge.retry}>Reintentar</button>
      </section>}
      {bridge.phase === 'blocked' && <p role="status">Tu cuenta requiere revisión. La edición está suspendida.</p>}
      {personalProjection.retainedDraft && <p role="status">Conservamos en esta sesión un borrador de la planificación anterior. No se trasladó ni guardó automáticamente en tu nueva trayectoria.</p>}
      {!activeCareer && <p role="status">No hay una trayectoria disponible seleccionada. Elegí una para ver su progreso.</p>}
      {bridge.authority === 'instances' && (activePage === 'careers' || !activeCareer) &&
        <MyCareers key={user.uid} bridge={bridge} careers={careers} />}

      <nav className="top-nav">
  	<button
    	  className={activePage === 'dashboard' ? 'active' : ''}
    	  onClick={() => setActivePage('dashboard')}
  	>
    	  📊 Dashboard
  	</button>

  	<button
    	  className={activePage === 'materias' ? 'active' : ''}
    	  onClick={() => setActivePage('materias')}
  	>
    	  📚 Materias
  	</button>

  	<button
    	  className={activePage === 'mapa' ? 'active' : ''}
    	  onClick={() => setActivePage('mapa')}
  	>
    	  🌳 Mapa de la carrera
 	 </button>

  	<button
    	  className={activePage === 'planificador' ? 'active' : ''}
    	  onClick={() => setActivePage('planificador')}
  	>
    	  🧠 Planificador
  	</button>
        <button
          className={activePage === 'amigos' ? 'active' : ''}
          onClick={() => setActivePage('amigos')}
        >
          👥 Amigos
        </button>
        <button className={activePage === 'projection' ? 'active' : ''} onClick={() => setActivePage('projection')}>
          <Route size={18} aria-hidden="true" /> Proyectar carrera
        </button>
      </nav>

      <div inert={!bridge.capabilities.academicWrite || !activeCareer}>
      {activeCareer && activePage === 'projection' && (
        ['loading', 'load-error'].includes(personalProjection.phase)
          ? <section className="side-card"><p role="status">{personalProjection.phase === 'loading' ? 'Cargando planificación…'
            : personalProjection.error === 'INCOMPATIBLE_PROJECTION_VERSION' ? 'Esta planificación usa una versión no compatible. No se modificó.'
              : 'No se pudo cargar la planificación. No se crearon ni reemplazaron datos.'}</p>
            {personalProjection.phase === 'load-error' && <button onClick={personalProjection.retry}>Reintentar carga</button>}</section>
          : <CareerProjectionPage key={`${bridge.key}:${Boolean(personalProjection.scenario)}`} career={activeCareer} statusMap={statusMap} persistence={personalProjection} />
      )}

      </div>
      {activePage === 'amigos' && (
        <FriendsPage key={user.uid} user={user} socialProfile={socialProfile} careerId={activeCareerId} academicSharing={bridge.capabilities.legacySocial} />
      )}

      <div inert={!bridge.capabilities.academicWrite || !activeCareer}>
   {activeCareer && activePage === 'dashboard' && (
     <>
      <Dashboard
  	stats={stats}
  	toCourse={toCourse}
  	finals={finals}
  	criticalSubjects={criticalSubjects}
	activeCareer={activeCareer}
      />

      <Advisor recs={recs} />
     </>
)}

{activeCareer && activePage === 'materias' && (
      <SubjectsPanel
        key={bridge.key}
        reset={reset}
        careerName={`${activeCareer.name} · Plan ${activeCareer.plan}`}
  	view={view}
  	setView={setView}
  	query={query}
 	setQuery={setQuery}
  	year={year}
  	setYear={setYear}
  	shownSubjects={shownSubjects}
        subjects={subjects}
  	statusMap={statusMap}
  	updateStatus={updateStatus}
  	expanded={expanded}
  	setExpanded={setExpanded}
        setActivePage={setActivePage}
        setSelectedMapCode={setSelectedMapCode}
      />
)}

{activeCareer && activePage === 'mapa' && (
  <CareerMap
  subjects={subjects}
  statusMap={statusMap}
  selectedCode={selectedMapCode}
  setSelectedCode={setSelectedMapCode}
  setActivePage={setActivePage}
  setPlannerSelectedCodes={setPlannerSelectedCodes}
  plannerSelectedCodes={plannerSelectedCodes}
/>
)}

{activeCareer && activePage === 'planificador' && (
  <PlannerPage
    key={bridge.key}
    user={user}
    academicSocial={bridge.capabilities.legacySocial}
    activityIntent={activityIntent}
    onActivityConsumed={() => setActivityIntent(null)}
    career={activeCareer}
    statusMap={statusMap}
    subjects={subjects}
    selectedCodes={plannerSelectedCodes}
    setSelectedCodes={setPlannerSelectedCodes}
    targetPeriod={planner.targetPeriod}
    setTargetPeriod={planner.setTargetPeriod}
    desiredCount={planner.desiredCount}
    setDesiredCount={planner.setDesiredCount}
  />
)}
      </div>
      {(!activeCareer || !bridge.capabilities.academicWrite) && activePage === 'planificador' && <JointPlanHistory user={user} activityIntent={activityIntent} onActivityConsumed={() => setActivityIntent(null)} />}
    </main>
  )
}

export default App
