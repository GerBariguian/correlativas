function CareerSelector({ careers, activeCareerId, setActiveCareerId }) {
  const universities = [...new Set(careers.map((career) => career.university))]
  const activeCareer = careers.find((career) => career.id === activeCareerId)
  const activeUniversity = activeCareer?.university || universities[0]

  const universityCareers = careers.filter(
    (career) => career.university === activeUniversity
  )

  function changeUniversity(university) {
    const firstCareer = careers.find((career) => career.university === university)
    setActiveCareerId(firstCareer.id)
  }

  return (
    <section className="career-selector">
      <div>
        <p className="eyebrow">Plan de estudio</p>
        <h2>{activeCareer?.name}</h2>
        <span>
          {activeCareer?.university} · {activeCareer?.faculty} · Plan{' '}
          {activeCareer?.plan}
        </span>
      </div>

      <div className="career-selectors">
        <label>
          Universidad
          <select
            value={activeUniversity}
            onChange={(event) => changeUniversity(event.target.value)}
          >
            {universities.map((university) => (
              <option key={university} value={university}>
                {university}
              </option>
            ))}
          </select>
        </label>

        <label>
          Carrera
          <select
            value={activeCareerId}
            onChange={(event) => setActiveCareerId(event.target.value)}
          >
            {universityCareers.map((career) => (
              <option key={career.id} value={career.id}>
                {career.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}

export default CareerSelector