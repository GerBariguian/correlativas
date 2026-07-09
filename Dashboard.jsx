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

      <article className="side-card">
        <p className="card-label">Podés rendir final</p>
        <strong>{finals.length}</strong>
        <span>Solo con correlativas aprobadas.</span>
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
    </section>
  )
}

export default Dashboard