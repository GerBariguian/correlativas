import { coursePeople } from '../planningPresentation'

export default function AcademicSummary({ plan, code, ids, people, nameOf, detail = false, detailOnly = false }) {
  const results = coursePeople(plan, code, ids, people)
  const eligible = results.filter((p) => p.eligible).length
  const unknown = results.filter((p) => !p.known).length
  const unavailable = results.filter((p) => p.known && !p.eligible).length
  return <div className="academic-summary">
    {!detailOnly && <><p><span className="planning-badge">{eligible === ids.length && !unknown ? 'Todos · ' : ''}{eligible}/{ids.length} pueden cursarla</span>{unknown > 0 && <span className="planning-badge">? {unknown} sin información</span>}</p>
    {unavailable > 0 && <p className="planning-warning">{unavailable === 1 ? 'Una persona ya no figura habilitada.' : `${unavailable} personas ya no figuran habilitadas.`}</p>}
    {results.some((p) => p.membership === 'Ya no participa') && <p className="planning-warning">Hay una persona que ya no participa.</p>}</>}
    {detail && <ul className="planning-person-detail">{results.map((p) => <li key={p.uid}><span>{nameOf(p.uid)}{p.membership !== 'Miembro' && <small>{p.membership}</small>}</span><span>{p.label}</span></li>)}</ul>}
  </div>
}
