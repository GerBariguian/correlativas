import { useRef } from 'react'
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
  gradesUI,
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
  const detailButton = useRef(null)
  const gradeButton = useRef(null)
  function openDetail() {
    // MUI restores the focused trigger on close, including surface mouse clicks.
    detailButton.current?.focus()
    setExpanded(subject.code)
  }

  return (
    <>
      <article
        className="subject-card"
        onClick={openDetail}
      >
        <div className="subject-head">
          <div>
            <p className="code">
              {subject.code} · {getSubjectLevel(subject)} · {subject.term}
            </p>

            <div className="subject-title">
              <h3>{subject.name}</h3>

              <button type="button" ref={detailButton} className="subject-toggle subject-detail-button"
                aria-label={`Ver detalle de ${subject.name}`} aria-haspopup="dialog"
                onClick={event => { event.stopPropagation(); openDetail() }}>
                Ver detalle
              </button>
            </div>

            <p className="hours">
              {subject.hours} hs
            </p>
          </div>

          <span className={statusClass(status)}>
            {status}
          </span>
        </div>

        {gradesUI && status === 'Aprobada' && <div className="subject-final-grade" onClick={event => event.stopPropagation()}>
          {gradesUI.ready && gradesUI.grades[subject.code]?.grade != null && <span>Nota final: {gradesUI.grades[subject.code].grade}</span>}
          <button type="button" ref={gradeButton} className="subject-toggle"
            disabled={gradesUI.pending}
            aria-expanded={gradesUI.inlineCode === subject.code && !isOpen}
            aria-controls={'grade-editor-' + subject.code}
            onClick={() => gradesUI.toggle(subject.code)}>
            {gradesUI.ready && gradesUI.grades[subject.code]?.grade != null ? 'Editar' : '+ Agregar nota'}
          </button>
          {gradesUI.notice?.code === subject.code && gradesUI.inlineCode !== subject.code && <small role="status" aria-live="polite">{gradesUI.pending ? 'Actualizando nota...' : gradesUI.notice.message}</small>}
          {gradesUI.inlineCode === subject.code && !isOpen && <div id={'grade-editor-' + subject.code}>
            {gradesUI.editor(subject.code, true, () => gradeButton.current?.focus())}
          </div>}
        </div>}
        <div className="mini-rules">
          <span className={courseOk ? 'rule ok' : 'rule no'}>
            {courseOk ? '✓' : '×'} Cursada
          </span>

          <span className={finalOk ? 'rule ok' : 'rule no'}>
            {finalOk ? '✓' : '×'} Correlativas de final
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
        gradeEditor={isOpen && gradesUI ? gradesUI.editor(subject.code) : null}
        onClose={() => setExpanded(null)}
        subject={subject}
        status={status}
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
