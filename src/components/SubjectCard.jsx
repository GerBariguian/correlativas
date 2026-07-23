import { STATUS, canCourse, canTakeFinal, getStatus, unlocks, getSubjectLevel, missingCoursePrereqs, missingFinalPrereqs } from '../logic'

function statusClass(status) {
  return {
    Pendiente: 'status pending',
    Cursando: 'status taking',
    Regularizada: 'status regularized',
    Aprobada: 'status approved',
  }[status]
}

function subjectNameByCode(code, subjects) {
  return subjects.find((s) => s.code === code)?.name || code
}

function SubjectCard({ subject, subjects, statusMap, onChange, expanded, setExpanded, setActivePage, setSelectedMapCode }) {
  const status = getStatus(statusMap, subject.code)
  const courseOk = canCourse(subject, statusMap)
  const finalOk = canTakeFinal(subject, statusMap, subjects)
  const unlockList = unlocks(subjects, subject.code)
  const missingCourse = missingCoursePrereqs(subject, statusMap)
  const missingFinal = missingFinalPrereqs(subject, statusMap, subjects)
  const isOpen = expanded === subject.code

  return (
    <article
      className={`subject-card ${isOpen ? 'open' : ''}`}
      onClick={() => setExpanded(isOpen ? null : subject.code)}
    >
      <div className="subject-head">
        <div>
          <p className="code">
            {subject.code} · {getSubjectLevel(subject)} · {subject.term}
          </p>
          <h3>{subject.name}</h3>
          <p className="hours">{subject.hours} hs</p>
        </div>

        <span className={statusClass(status)}>{status}</span>
      </div>

      <div className="mini-rules">
        <span className={courseOk ? 'rule ok' : 'rule no'}>
          {courseOk ? '✓' : '×'} Cursada
        </span>

        <span className={finalOk ? 'rule ok' : 'rule no'}>
          {finalOk ? '✓' : '×'} Final
        </span>
      </div>

{isOpen && (
  <div className="details">
    <div className="correlatives-section">
  <p>
    <b>Para cursar</b>
  </p>

  <p>
    <strong>Tener cursadas:</strong>
    <br />
    {(subject.prereqs ?? []).length
      ? (subject.prereqs ?? [])
          .map((code) => subjectNameByCode(code, subjects))
          .join(', ')
      : 'Sin requisitos de cursada'}
  </p>

  <p>
    <strong>Tener aprobadas:</strong>
    <br />
    {(subject.approvedPrereqs ?? []).length
      ? (subject.approvedPrereqs ?? [])
          .map((code) => subjectNameByCode(code, subjects))
          .join(', ')
      : 'Sin requisitos adicionales de aprobación'}
  </p>

  <p>
    <b>Para rendir</b>
    <br />
    {(subject.finalPrereqs ?? subject.prereqs ?? []).includes('ALL')
      ? 'Todas las demás materias obligatorias'
      : (subject.finalPrereqs ?? subject.prereqs ?? []).length
        ? (subject.finalPrereqs ?? subject.prereqs ?? [])
            .map((code) => subjectNameByCode(code, subjects))
            .join(', ')
        : 'Sin correlativas de final'}
  </p>
</div>

    <p>
      <b>Desbloquea</b>
      <br />
      {unlockList.length
        ? unlockList.map((s) => s.name).join(', ')
        : 'No desbloquea materias'}
    </p>

    <p>
  <b>Estado para cursar</b>
  <br />

  {courseOk ? (
    '✅ Habilitada'
  ) : (
    <>
      ❌ Bloqueada
      {missingCourse.regularized.length > 0 && (
        <>
          <br />
          Falta cursar o regularizar:{' '}
          {missingCourse.regularized
            .map((code) => subjectNameByCode(code, subjects))
            .join(', ')}
        </>
      )}

      {missingCourse.approved.length > 0 && (
        <>
          <br />
          Falta aprobar:{' '}
          {missingCourse.approved
            .map((code) => subjectNameByCode(code, subjects))
            .join(', ')}
        </>
      )}
    </>
  )}
</p>

<p>
  <b>Estado para final</b>
  <br />

  {finalOk ? (
    '✅ Puede rendirse'
  ) : (
    <>
      ❌ Falta aprobar:{' '}
      {missingFinal.length
        ? missingFinal
            .map((code) => subjectNameByCode(code, subjects))
            .join(', ')
        : 'correlativas'}
    </>
  )}
</p>

    <button
      className="map-link-btn"
      onClick={(event) => {
        event.stopPropagation()
        setSelectedMapCode(subject.code)
        setActivePage('mapa')
      }}
    >
      🌳 Ver en mapa
    </button>
  </div>
)}
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
  )
}

export default SubjectCard