import {
  STATUS,
  canCourse,
  canTakeFinal,
  getStatus,
  unlocks,
  getSubjectLevel,
  missingCoursePrereqs,
  missingFinalPrereqs
} from '../logic'

import SubjectModal from './SubjectModal'

function statusClass(status) {
  return {
    Pendiente: 'status pending',
    Cursando: 'status taking',
    Regularizada: 'status regularized',
    Aprobada: 'status approved',
  }[status]
}

function SubjectCard({
  subject,
  subjects,
  statusMap,
  onChange,
  expanded,
  setExpanded,
  setActivePage,
  setSelectedMapCode
}) {
  const status = getStatus(statusMap, subject.code)
  const courseOk = canCourse(subject, statusMap)
  const finalOk = canTakeFinal(subject, statusMap, subjects)
  const unlockList = unlocks(subjects, subject.code)
  const missingCourse = missingCoursePrereqs(subject, statusMap)
  const missingFinal = missingFinalPrereqs(subject, statusMap, subjects)

  const isOpen = expanded === subject.code

  return (
    <>
      <article
        className="subject-card"
        onClick={() => setExpanded(subject.code)}
      >
        <div className="subject-head">
          <div>
            <p className="code">
              {subject.code} · {getSubjectLevel(subject)} · {subject.term}
            </p>

            <div className="subject-title">
              <h3>{subject.name}</h3>

              <small className="subject-toggle">
                Ver detalle
              </small>
            </div>

            <p className="hours">
              {subject.hours} hs
            </p>
          </div>

          <span className={statusClass(status)}>
            {status}
          </span>
        </div>

        <div className="mini-rules">
          <span className={courseOk ? 'rule ok' : 'rule no'}>
            {courseOk ? '✓' : '×'} Cursada
          </span>

          <span className={finalOk ? 'rule ok' : 'rule no'}>
            {finalOk ? '✓' : '×'} Final
          </span>
        </div>

        <div className="status-actions">
          {STATUS.map((item) => (
            <button
              key={item}
              className={item === status ? 'active' : ''}
              onClick={(event) => {
                event.stopPropagation()
                onChange(subject.code, item)
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </article>

      <SubjectModal
        open={isOpen}
        onClose={() => setExpanded(null)}
        subject={subject}
        subjects={subjects}
        courseOk={courseOk}
        finalOk={finalOk}
        missingCourse={missingCourse}
        missingFinal={missingFinal}
        unlockList={unlockList}
        setActivePage={setActivePage}
        setSelectedMapCode={setSelectedMapCode}
      />
    </>
  )
}

export default SubjectCard