import { Sparkles } from 'lucide-react'

function Advisor({ recs }) {
  return (
    <section className="advisor">
      <div className="section-title">
        <div>
          <p className="eyebrow">Opción B</p>
          <h2>Asesor académico</h2>
        </div>
        <Sparkles />
      </div>

      <div className="rec-grid">
        {recs.map((rec, index) => (
          <article className="rec-card" key={`${rec.type}-${rec.title}-${index}`}>
            <p>{rec.type}</p>
            <h3>{rec.title}</h3>
            <span>{rec.reason}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

export default Advisor