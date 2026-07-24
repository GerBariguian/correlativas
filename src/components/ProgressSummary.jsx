function ProgressSummary({ statusMap }) {
  const values = Object.values(statusMap)

  const approved = values.filter(
    (status) => status === 'approved'
  ).length

  const regularized = values.filter(
    (status) => status === 'regularized'
  ).length

  const inProgress = values.filter(
    (status) => status === 'in_progress'
  ).length

  const pending = values.filter(
    (status) => status === 'pending'
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