import { getStatus } from '../logic'

function ProgressSummary({ subjects, statusMap }) {
  const statuses = subjects.map((subject) =>
    getStatus(statusMap, subject.code).toLowerCase()
  )

  const approved = statuses.filter(
    (status) => status === 'aprobada'
  ).length

  const regularized = statuses.filter(
    (status) => status === 'regularizada'
  ).length

  const inProgress = statuses.filter(
    (status) => status === 'cursando'
  ).length

  const pending = statuses.filter(
    (status) => status === 'pendiente'
  ).length

  return (
    <div className="progress-summary">
      <div className="summary-item approved">
        <span className="dot"></span>
        <span>Aprobadas ({approved})</span>
      </div>

      <div className="summary-item regularized">
        <span className="dot"></span>
        <span>Regularizadas ({regularized})</span>
      </div>

      <div className="summary-item in-progress">
        <span className="dot"></span>
        <span>Cursando ({inProgress})</span>
      </div>

      <div className="summary-item pending">
        <span className="dot"></span>
        <span>Pendientes ({pending})</span>
      </div>
    </div>
  )
}

export default ProgressSummary