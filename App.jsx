import CareerSelector from './components/CareerSelector'
import Planner from './components/Planner'
import CareerMap from './components/CareerMap'
import Header from './components/Header'
import SubjectsPanel from './components/SubjectsPanel'
import Advisor from './components/Advisor'
import WelcomeSetup from './components/WelcomeSetup'
import { onAuthStateChanged, signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import {
  loadUserStatus,
  saveUserStatus,
  loadUserProfile,
  saveUserProfile,
} from './services/firestore'
import Dashboard from './components/Dashboard'
import { useEffect, useMemo, useState } from 'react'
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

function loadStatus(careerId, initialStatus) {
  try {
    return (
      JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}-${careerId}`)) ||
      initialStatus
    )
  } catch {
    return initialStatus
  }
}

function App() {
  const [activeCareerId, setActiveCareerId] = useState(DEFAULT_CAREER_ID)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)
  const [hasChosenCareer, setHasChosenCareer] = useState(false)
  const activeCareer = careers.find((career) => career.id === activeCareerId)
  const subjects = activeCareer.subjects
  const initialStatus = activeCareer.initialStatus
  useEffect(() => {
    async function loadStatusForCareer() {
      if (user) {
        const cloudStatus = await loadUserStatus(user.uid, activeCareerId)

        setStatusMap(cloudStatus || initialStatus)
      } else {
        setStatusMap(loadStatus(activeCareerId, initialStatus))
      }

      setExpanded(null)
      setSelectedMapCode(null)
      setPlannerSelectedCodes([])
    }

    loadStatusForCareer()
  }, [activeCareerId, user])
  const [statusMap, setStatusMap] = useState(() =>
  loadStatus(DEFAULT_CAREER_ID, careers[0].initialStatus)
)
  const [view, setView] = useState('all')
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [selectedMapCode, setSelectedMapCode] = useState(null)
  const [plannerSelectedCodes, setPlannerSelectedCodes] = useState([])
  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!user) {
        setProfileLoading(false)
        return
      }

      const profile = await loadUserProfile(user.uid)

      if (profile?.activeCareerId) {
        setActiveCareerId(profile.activeCareerId)
        setHasChosenCareer(true)
      } else {
        setHasChosenCareer(false)
      }

      setProfileLoading(false)
    }

    loadProfile()
  }, [user])

  const stats = useMemo(() => summary(subjects, statusMap), [statusMap])
  const toCourse = useMemo(() => availableToCourse(subjects, statusMap), [statusMap])
  const finals = useMemo(() => availableFinals(subjects, statusMap), [statusMap])
  const blocked = useMemo(() => blockedSubjects(subjects, statusMap), [statusMap])
  const recs = useMemo(() => recommendations(subjects, statusMap), [statusMap])
  const criticalSubjects = useMemo(() => {
    return subjects
      .map((subject) => ({
        ...subject,
        unlocksCount: unlocks(subjects, subject.code).length,
      }))
      .filter((subject) => getStatus(statusMap, subject.code) !== 'Aprobada')
      .sort((a, b) => b.unlocksCount - a.unlocksCount)
      .slice(0, 5)
  }, [statusMap])

  function updateStatus(code, next) {
    const nextMap = { ...statusMap, [code]: next }

    setStatusMap(nextMap)

    if (user) {
      saveUserStatus(user.uid, activeCareerId, nextMap)
    } else {
      localStorage.setItem(
        `${STORAGE_KEY_PREFIX}-${activeCareerId}`,
        JSON.stringify(nextMap)
      )
    }
  }

  function reset() {
    if (!confirm('¿Seguro que querés reiniciar el progreso?')) return
    setStatusMap(initialStatus)
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}-${activeCareerId}`,
      JSON.stringify(initialStatus)
    )
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

async function startWithCareer() {
  if (!user) return

  await saveUserProfile(user.uid, {
    activeCareerId,
    updatedAt: new Date(),
  })

  setHasChosenCareer(true)
}


if (profileLoading) {
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
        setActiveCareerId={setActiveCareerId}
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
  	setActiveCareerId={setActiveCareerId}
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
      </nav>

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
