import CareerSelector from './components/CareerSelector'
import Planner from './components/Planner'
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
  loadUserStatus,
  saveUserStatus,
  loadUserProfile,
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
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(true)
  const [careerRevision, setCareerRevision] = useState(0)
  const [hasChosenCareer, setHasChosenCareer] = useState(false)
  const [statusMap, setStatusMap] = useState(careers[0].initialStatus)
  const [view, setView] = useState('all')
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [selectedMapCode, setSelectedMapCode] = useState(null)
  const [plannerSelectedCodes, setPlannerSelectedCodes] = useState([])
  const session = useRef(null)
  const progress = useRef(null)
  const writes = useRef(Promise.resolve())
  const confirmedCareer = useRef(DEFAULT_CAREER_ID)
  const activeCareer = careers.find((career) => career.id === activeCareerId)
  const subjects = activeCareer.subjects
  const initialStatus = activeCareer.initialStatus
  const socialProfile = useSocialProfile(user, activeCareerId, !profileLoading && hasChosenCareer)

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
      setUser(currentUser)
      setHasChosenCareer(false)
      setProfileLoading(Boolean(currentUser))
      setStatusLoading(true)
      setActiveCareerId(DEFAULT_CAREER_ID)
      setStatusMap(careers[0].initialStatus)
      setPlannerSelectedCodes([])
      setAuthLoading(false)
    })
    return () => {
      unsubscribe()
      session.current = null
      progress.current = null
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const token = session.current
    let cancelled = false
    async function loadProfile() {
      try {
        await writes.current
        if (cancelled || !isCurrentSession(token)) return
        const profile = await loadUserProfile(user.uid)
        if (cancelled || !isCurrentSession(token)) return
        const career = careers.find((item) => item.id === profile?.activeCareerId)
        confirmedCareer.current = career?.id || DEFAULT_CAREER_ID
        setActiveCareerId(confirmedCareer.current)
        setHasChosenCareer(Boolean(career))
        setProfileLoading(false)
      } catch (error) {
        // Never treat a failed read as an absent profile.
        if (!cancelled && isCurrentSession(token)) reportError(error)
      }
    }
    loadProfile()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    progress.current = null
    if (!user || profileLoading || !hasChosenCareer) return
    const token = session.current
    let cancelled = false
    setStatusLoading(true)
    setExpanded(null)
    setSelectedMapCode(null)
    setPlannerSelectedCodes([])
    async function loadStatusForCareer() {
      try {
        await writes.current
        if (cancelled || !isCurrentSession(token)) return
        const cloudStatus = await loadUserStatus(user.uid, activeCareerId)
        if (cancelled || !isCurrentSession(token) || confirmedCareer.current !== activeCareerId) return
        const map = cloudStatus ?? initialStatus
        progress.current = { token, careerId: activeCareerId, map }
        setStatusMap(map)
        cacheStatus(user.uid, activeCareerId, map)
        setStatusLoading(false)
      } catch (error) {
        // Keep editing gated rather than overwrite an unreadable cloud record.
        if (!cancelled && isCurrentSession(token)) reportError(error)
      }
    }
    loadStatusForCareer()
    return () => {
      cancelled = true
      progress.current = null
    }
  }, [user, profileLoading, hasChosenCareer, activeCareerId, initialStatus, careerRevision])

  async function changeCareer(careerId, finishSetup = false) {
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
    if (!context || !isCurrentSession(context.token)) return
    try {
      await enqueueWrite(async () => {
        if (!isCurrentSession(context.token)) return
        const nextMap = transform(context.map)
        await saveUserStatus(context.token.uid, context.careerId, nextMap)
        context.map = nextMap
        if (!isCurrentSession(context.token)) return
        cacheStatus(context.token.uid, context.careerId, nextMap)
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
    if (!confirm('¿Seguro que querés reiniciar el progreso?')) return
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


if (profileLoading || (hasChosenCareer && statusLoading)) {
  return (
    <main className="app-shell">
      <section className="placeholder-page">
        <p className="eyebrow">Correlativas</p>
        <h2>Cargando perfil...</h2>
      </section>
    </main>
  )
}

if (!hasChosenCareer) {
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
      <Header reset={reset} user={user} />
      <CareerSelector
  	careers={careers}
  	activeCareerId={activeCareerId}
    setActiveCareerId={changeCareer}
      />

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
      </nav>

      {activePage === 'amigos' && (
        <FriendsPage key={user.uid} user={user} socialProfile={socialProfile} />
      )}

   {activePage === 'dashboard' && (
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

{activePage === 'materias' && (
      <SubjectsPanel
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

{activePage === 'mapa' && (
  <CareerMap
  subjects={subjects}
  statusMap={statusMap}
  selectedCode={selectedMapCode}
  setSelectedCode={setSelectedMapCode}
  setActivePage={setActivePage}
  setPlannerSelectedCodes={setPlannerSelectedCodes}
/>
)}

{activePage === 'planificador' && (
  <Planner
    availableSubjects={toCourse}
    subjects={subjects}
    selectedCodes={plannerSelectedCodes}
    setSelectedCodes={setPlannerSelectedCodes}
  />
)}
    </main>
  )
}

export default App
