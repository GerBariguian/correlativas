import {
  Dialog,
  DialogContent,
  IconButton
} from '@mui/material'

function subjectNameByCode(code, subjects) {
  return subjects.find((subject) => subject.code === code)?.name || code
}

function SubjectModal({
  open,
  onClose,
  subject,
  status,
  subjects,
  courseOk,
  finalOk,
  missingCourse,
  missingFinal,
  unlockList,
  setActivePage,
  setSelectedMapCode
}) {
  if (!subject) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogContent className="subject-modal">
        <div className="subject-modal-header">
          <div>
            <p className="code">
              {subject.code} · {subject.term}
            </p>

            <h2>{subject.name}</h2>
          </div>

          <IconButton onClick={onClose} aria-label="Cerrar detalle de materia">
            ✕
          </IconButton>
        </div>

        <div className="subject-modal-grid">

          <div className="subject-modal-left">

            <h3>Correlatividades</h3>

            <p>
              <strong>Para cursar</strong>
            </p>

            <p>
              <strong>Tener cursadas:</strong>
              <br />

              {(subject.prereqs ?? []).length
                ? subject.prereqs
                    .map((code) =>
                      subjectNameByCode(code, subjects)
                    )
                    .join(', ')
                : 'Sin requisitos de cursada'}
            </p>

            <p>
              <strong>Tener aprobadas:</strong>
              <br />

              {(subject.approvedPrereqs ?? []).length
                ? subject.approvedPrereqs
                    .map((code) =>
                      subjectNameByCode(code, subjects)
                    )
                    .join(', ')
                : 'Sin requisitos adicionales de aprobación'}
            </p>

            <p>
              <strong>Estado para cursar</strong>
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
                        .map((code) =>
                          subjectNameByCode(code, subjects)
                        )
                        .join(', ')}
                    </>
                  )}

                  {missingCourse.approved.length > 0 && (
                    <>
                      <br />
                      Falta aprobar:{' '}
                      {missingCourse.approved
                        .map((code) =>
                          subjectNameByCode(code, subjects)
                        )
                        .join(', ')}
                    </>
                  )}
                </>
              )}
            </p>

            <p>
              <strong>Para rendir</strong>
              <br />

              {(subject.finalPrereqs ?? subject.prereqs ?? []).includes('ALL')
                ? 'Todas las demás materias obligatorias'
                : (subject.finalPrereqs ?? subject.prereqs ?? []).length
                  ? (subject.finalPrereqs ?? subject.prereqs ?? [])
                      .map((code) =>
                        subjectNameByCode(code, subjects)
                      )
                      .join(', ')
                  : 'Sin correlativas de final'}
            </p>

            <p>
              <strong>Estado para final</strong>
              <br />

              {status === 'Aprobada' ? 'Materia ya aprobada' : status !== 'Regularizada' ? 'Todavía no está regularizada' : finalOk ? (
                '✅ Puede rendirse'
              ) : (
                <>
                  ❌ Falta aprobar:{' '}

                  {missingFinal.length
                    ? missingFinal
                        .map((code) =>
                          subjectNameByCode(code, subjects)
                        )
                        .join(', ')
                    : 'correlativas'}
                </>
              )}
            </p>

            {status !== 'Regularizada' && missingFinal.length > 0 && <p>Correlativas de final pendientes. Falta aprobar: {missingFinal.map(code => subjectNameByCode(code, subjects)).join(', ')}.</p>}

            <p>
              <strong>Desbloquea</strong>
              <br />

              {unlockList.length
                ? unlockList
                    .map((item) => item.name)
                    .join(', ')
                : 'No desbloquea materias'}
            </p>

            <button
              className="map-link-btn"
              onClick={() => {
                onClose()
                setSelectedMapCode(subject.code)
                setActivePage('mapa')
              }}
            >
              🌳 Ver en mapa
            </button>

          </div>

          <div className="subject-modal-right">

            <h3>¿De qué trata esta materia?</h3>

            {subject.description ? (
              <p>{subject.description}</p>
            ) : (
              <p className="subject-description-empty">
                Información de la materia próximamente.
              </p>
            )}

            {subject.topics?.length > 0 && (
              <>
                <h3>Temas principales</h3>

                <ul>
                  {subject.topics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </>
            )}

          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SubjectModal
