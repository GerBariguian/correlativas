import { useMemo } from 'react'
import { unlocks } from '../logic'

function Planner({ availableSubjects, subjects,  selectedCodes, setSelectedCodes, }) {
  

  const selectedSubjects = availableSubjects.filter((subject) =>
    selectedCodes.includes(subject.code)
  )
  const unavailableCodes = selectedCodes.filter(code => !availableSubjects.some(subject => subject.code === code))

  const totalHours = selectedSubjects.reduce(
    (total, subject) => total + subject.hours,
    0
  )

  const unlockedCount = useMemo(() => {
    const unlocked = new Set()

    selectedSubjects.forEach((subject) => {
      unlocks(subjects, subject.code).forEach((unlockedSubject) => {
        unlocked.add(unlockedSubject.code)
      })
    })

    return unlocked.size
  }, [selectedSubjects, subjects])

  function toggleSubject(code) {
    setSelectedCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code]
    )
  }

  function clearSelection() {
    setSelectedCodes([])
  }

  function suggestBestSemester() {
    const suggested = availableSubjects
      .map((subject) => ({
        ...subject,
        unlocksCount: unlocks(subjects, subject.code).length,
      }))
      .sort((a, b) => {
        if (b.unlocksCount !== a.unlocksCount) {
          return b.unlocksCount - a.unlocksCount
        }

        return a.year - b.year
      })
      .slice(0, 4)
      .map((subject) => subject.code)

    setSelectedCodes(suggested)
  }

  return (
    <section className="planner-page">
      <div className="planner-top">
        <h2>Planificador inteligente</h2>
        <p>
          Elegí posibles materias para el próximo cuatrimestre y mirá el impacto
          estimado.
        </p>
        <button className="suggest-btn" onClick={suggestBestSemester}>
  	  ✨ Sugerir mejor cuatrimestre
	</button>
        {selectedCodes.length > 0 && (
          <button className="clear-planner-btn" onClick={() => setSelectedCodes([])}>
            🗑️ Limpiar
          </button>
         )}
      </div>

      <div className="planner-summary">
        <article>
          <span>Elegidas</span>
          <strong>{selectedSubjects.length}</strong>
        </article>

        <article>
          <span>Horas totales</span>
          <strong>{totalHours}</strong>
        </article>

        <article>
          <span>Desbloqueos directos</span>
          <strong>{unlockedCount}</strong>
        </article>
      </div>

      {unavailableCodes.length > 0 && <section className="planner-unavailable" aria-label="Selecciones actualmente no disponibles">
        <h3>Selecciones actualmente no disponibles</h3>
        <p>Estas materias ya no figuran entre las habilitadas para cursar. Conservamos tu selección, pero no cuentan en cantidad, horas ni desbloqueos del resumen.</p>
        <ul>{unavailableCodes.map(code => <li key={code}>
          <span>{subjects.find(subject => subject.code === code)?.name || code} · No disponible</span>
          <button type="button" onClick={() => toggleSubject(code)} aria-label={`Quitar ${subjects.find(subject => subject.code === code)?.name || code} de Mi selección`}>Quitar</button>
        </li>)}</ul>
      </section>}
      <div className="planner-grid">
        {availableSubjects.map((subject) => {
          const selected = selectedCodes.includes(subject.code)
          const directUnlocks = unlocks(subjects, subject.code).length

          return (
            <button
              key={subject.code}
              className={`planner-subject ${selected ? 'selected' : ''}`}
              onClick={() => toggleSubject(subject.code)}
            >
              <span>{subject.year}° año · {subject.term}</span>
              <strong>{subject.name}</strong>
              <small>
                {subject.hours} hs · desbloquea {directUnlocks} materia(s)
              </small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default Planner
