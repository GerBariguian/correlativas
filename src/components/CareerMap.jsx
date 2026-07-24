import { getStatus, unlocks, getSubjectLevel } from '../logic'
import ProgressSummary from './ProgressSummary'


function CareerMap({
  subjects,
  statusMap,
  selectedCode,
  setSelectedCode,
  setActivePage,
  setPlannerSelectedCodes,
}) {
  const levels = [...new Set(subjects.map(getSubjectLevel))]

  const selectedSubject = subjects.find((subject) => subject.code === selectedCode)
  const selectedUnlocks = selectedSubject
    ? unlocks(subjects, selectedSubject.code).map((s) => s.code)
    : []
  const selectedPrereqs = selectedSubject ? selectedSubject.prereqs : []

  function addToPlanner() {
    if (!selectedCode) return

    setPlannerSelectedCodes((current) =>
      current.includes(selectedCode) ? current : [...current, selectedCode]
    )

    setActivePage('planificador')
  }

  return (
    <section className="career-map-page">
      <div className="map-header">
        <div>
          <p className="eyebrow">Mapa académico</p>
          <h2>Mapa de la carrera</h2>
          <p>Visualizá tu recorrido académico organizado por niveles.</p>

          <ProgressSummary statusMap={statusMap} />

          {selectedSubject && (
            <button className="map-to-planner-btn" onClick={addToPlanner}>
              📅 Agregar {selectedSubject.name} al planificador
            </button>
          )}
        </div>
      </div>

      <div className="career-map">
        {levels.map((level) => {
          const levelSubjects = subjects.filter(
            (subject) => getSubjectLevel(subject) === level
          )

          const terms = [...new Set(levelSubjects.map((subject) => subject.term))]

          return (
            <article className="year-column" key={level}>
              <div className="year-title">
                <strong>{level}</strong>
              </div>

              {terms.map((term) => {
                const termSubjects = levelSubjects.filter(
                  (subject) => subject.term === term
                )

                return (
                  <div className="term-block" key={term}>
                    <h3>{term}</h3>

                    <div className="map-subjects">
                      {termSubjects.map((subject) => {
                        const status = getStatus(statusMap, subject.code)

                        return (
                          <button
                            className={`map-subject ${status.toLowerCase()} ${
                              selectedCode === subject.code ? 'selected' : ''
                            } ${
                              selectedUnlocks.includes(subject.code)
                                ? 'related unlock'
                                : ''
                            } ${
                              selectedPrereqs.includes(subject.code)
                                ? 'related prereq'
                                : ''
                            } ${
                              selectedCode &&
                              selectedCode !== subject.code &&
                              !selectedUnlocks.includes(subject.code) &&
                              !selectedPrereqs.includes(subject.code)
                                ? 'dimmed'
                                : ''
                            }`}
                            key={subject.code}
                            onClick={() =>
                              setSelectedCode(
                                selectedCode === subject.code ? null : subject.code
                              )
                            }
                          >
                            <span>{subject.code}</span>
                            <strong>{subject.name}</strong>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default CareerMap