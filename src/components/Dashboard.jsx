import { useState } from 'react'
import { BookOpen, CheckCircle2, Circle, Compass, GraduationCap } from 'lucide-react'

function StatCard({ label, value, icon }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  )
}

function Dashboard({ stats, toCourse, finals, criticalSubjects, activeCareer }) {
  const [showFinals, setShowFinals] = useState(false)
  return (
    <section className="dashboard">
      <article className="progress-card">
        <div className="progress-head">
          <div>
            <p className="card-label">
  	      {activeCareer.name} · {activeCareer.university}
	    </p>
            <h2>{stats.progress}% completado</h2>
          </div>
          <GraduationCap size={38} />
        </div>

        <div className="progress-track">
          <div style={{ width: `${stats.progress}%` }} />
        </div>

        <div className="stat-grid">
          <StatCard label="Aprobadas" value={stats.approved} icon={<CheckCircle2 size={21} />} />
          <StatCard label="Regularizadas" value={stats.regularized} icon={<BookOpen size={21} />} />
          <StatCard label="Cursando" value={stats.taking} icon={<Compass size={21} />} />
          <StatCard label="Pendientes" value={stats.pending} icon={<Circle size={21} />} />
        </div>
      </article>

      <article className="side-card">
        <p className="card-label">Podés cursar</p>
        <strong>{toCourse.length}</strong>
        <span>Correlativas aprobadas o regularizadas.</span>
      </article>

      <article
        className="side-card clickable-card"
        onClick={() => setShowFinals((current) => !current)}
      >
        <p className="card-label">Podés rendir final</p>
        <strong>{finals.length}</strong>
        <span>Solo con correlativas aprobadas.</span>

        <small className="card-action">
          {showFinals ? '▲ Ocultar materias' : '▼ Ver materias'}
        </small>
      </article>

      <article className="side-card">
        <p className="card-label">Finales pendientes</p>
        <strong>{stats.regularized}</strong>
        <span>Materias regularizadas que todavía tenés que cerrar.</span>
      </article>

      <article className="side-card">
        <p className="card-label">Materias críticas</p>
        <strong>{criticalSubjects.length}</strong>
        <span>Materias pendientes o en curso que más desbloquean.</span>
      </article>

      {showFinals && (
  <article className="subjects-panel">
    <div className="section-title">
      <div>
        <p className="card-label">Podés rendir</p>
        <h2>Finales disponibles</h2>
      </div>
    </div>

    {finals.length === 0 ? (
      <p>No tenés finales habilitados.</p>
    ) : (
      <div className="subject-grid">
        {finals.map((subject) => (
          <div className="subject-card" key={subject.code}>
            <p className="code">{subject.code}</p>
            <h3>{subject.name}</h3>
          </div>
        ))}
      </div>
    )}
  </article>
)}
    </section>
  )
}

export default Dashboard