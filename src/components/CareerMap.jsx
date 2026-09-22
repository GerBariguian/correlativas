import { getStatus, unlocks, getSubjectLevel, availableToCourse, missingCoursePrereqs } from '../logic'
import ProgressSummary from './ProgressSummary'


function CareerMap({
  subjects,
  statusMap,
  selectedCode,
  setSelectedCode,
  setActivePage,
  setPlannerSelectedCodes,
  plannerSelectedCodes = [],
}) {
  const levels = [...new Set(subjects.map(getSubjectLevel))]

  const selectedSubject = subjects.find((subject) => subject.code === selectedCode)
  const isActivity = selectedSubject?.projectionKind === 'activity'
  const alreadySelected = plannerSelectedCodes.includes(selectedCode)
  const canAdd = !isActivity && availableToCourse(subjects, statusMap).some(subject => subject.code === selectedCode)
  const selectedStatus = selectedSubject && getStatus(statusMap, selectedCode)
  const missing = selectedSubject && missingCoursePrereqs(selectedSubject, statusMap)
  const names = codes => codes.map(code => subjects.find(subject => subject.code === code)?.name || code).join(', ')
  const selectedUnlocks = selectedSubject
    ? unlocks(subjects, selectedSubject.code).map((s) => s.code)
    : []
  const selectedPrereqs = selectedSubject
    ? [...(selectedSubject.prereqs ?? []), ...(selectedSubject.approvedPrereqs ?? [])] : []

  function addToPlanner() {
    if (alreadySelected) { setActivePage('planificador'); return }
    if (!canAdd) return

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

          <ProgressSummary
            subjects={subjects}
            statusMap={statusMap}
          />

          {selectedSubject && (
            <div><button className="map-to-planner-btn" disabled={!canAdd && !alreadySelected} aria-describedby={!canAdd ? 'map-planner-reason' : undefined} onClick={addToPlanner}>
              {alreadySelected ? `Ver ${selectedSubject.name} en Mi selección` : `📅 Agregar ${selectedSubject.name} al planificador`}
            </button>
              {!canAdd && <div id="map-planner-reason">
                {isActivity && <p>Esta actividad no se incluye como cursada en Mi selección. Podés seguir su estado en Materias.</p>}
                {selectedStatus !== 'Pendiente' && <p>No se puede agregar a Mi selección: su estado es {selectedStatus}. Solo se incluyen materias Pendientes habilitadas para cursar.</p>}
                {missing.regularized.length > 0 && <p>Falta regularizar: {names(missing.regularized)}.</p>}
                {missing.approved.length > 0 && <p>Falta aprobar para cursar: {names(missing.approved)}.</p>}
              </div>}
            </div>
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
                            aria-pressed={selectedCode === subject.code}
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
                            title={selectedSubject?.approvedPrereqs?.includes(subject.code) ? 'Requiere aprobación para cursar'
                              : selectedSubject?.prereqs?.includes(subject.code) ? 'Requiere regularización para cursar' : undefined}
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
