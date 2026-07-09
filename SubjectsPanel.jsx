import { Lock, Search } from 'lucide-react'
import SubjectCard from './SubjectCard'
import { getSubjectLevel } from '../logic'


function SubjectsPanel({
  view,
  setView,
  query,
  setQuery,
  year,
  setYear,
  shownSubjects,
  subjects,
  statusMap,
  updateStatus,
  expanded,
  setExpanded,
  setActivePage,
  setSelectedMapCode,
}) {

const levels = [...new Set(subjects.map(getSubjectLevel))]

  return (
    <section className="subjects-panel">
      <div className="toolbar">
        <div className="tabs">
          {[
            ['all', 'Todas'],
            ['course', 'Podés cursar'],
            ['finals', 'Podés rendir final'],
            ['blocked', 'Bloqueadas'],
            ['unlocks', 'Desbloqueos'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={view === key ? 'active' : ''}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="filters">
          <label>
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar materia..."
            />
          </label>

          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Todos los niveles</option>

            {levels.map((level) => (
              <option key={level} value={level}>
      		{level}
              </option>
 	   ))}
	</select>
        </div>
      </div>

      <div className="subject-grid">
        {shownSubjects.length ? (
          shownSubjects.map((subject) => (
            <SubjectCard
  	      key={subject.code}
              subject={subject}
              subjects={subjects}
              statusMap={statusMap}
              onChange={updateStatus}
              view={view}
              expanded={expanded}
              setExpanded={setExpanded}
              setActivePage={setActivePage}
              setSelectedMapCode={setSelectedMapCode}
            />
          ))
        ) : (
          <div className="empty">
            <Lock />
            <p>No hay materias para mostrar con estos filtros.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default SubjectsPanel