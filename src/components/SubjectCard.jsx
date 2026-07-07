import { STATUS, canCourse, canTakeFinal, getStatus, unlocks, getSubjectLevel } from '../logic'

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
  const finalOk = canTakeFinal(subject, statusMap)
  const unlockList = unlocks(subjects, subject.code)
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
    <p>
      <b>Correlativas</b>
      <br />
      {subject.prereqs.length
        ? subject.prereqs
            .map((code) => subjectNameByCode(code, subjects))
            .join(', ')
        : 'Sin correlativas'}
    </p>

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
      {courseOk ? '✅ Habilitada' : '❌ Bloqueada'}
    </p>

    <p>
      <b>Estado para final</b>
      <br />
      {finalOk ? '✅ Puede rendirse' : '❌ Falta aprobar correlativas'}
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