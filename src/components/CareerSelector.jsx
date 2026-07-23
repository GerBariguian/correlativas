function CareerSelector({
  careers,
  activeCareerId,
  setActiveCareerId,
}) {
  const universities = [
    ...new Set(careers.map((career) => career.university)),
  ]

  const activeCareer = careers.find(
    (career) => career.id === activeCareerId
  )

  const activeUniversity =
    activeCareer?.university || universities[0]

  const universityCareers = careers.filter(
    (career) => career.university === activeUniversity
  )

  const careerNames = [
    ...new Set(universityCareers.map((career) => career.name)),
  ]

  const activeCareerName =
    activeCareer?.name || careerNames[0]

  const availablePlans = universityCareers.filter(
    (career) => career.name === activeCareerName
  )

  function changeUniversity(university) {
    const firstCareer = careers.find(
      (career) => career.university === university
    )

    if (firstCareer) {
      setActiveCareerId(firstCareer.id)
    }
  }

  function changeCareerName(careerName) {
    const firstPlan = universityCareers.find(
      (career) => career.name === careerName
    )

    if (firstPlan) {
      setActiveCareerId(firstPlan.id)
    }
  }

  return (
    <section className="career-selector">
      <div>
        <p className="eyebrow">Plan de estudio</p>

        <h2>{activeCareer?.name}</h2>

        <span>
          {activeCareer?.university}
          {activeCareer?.faculty
            ? ` · ${activeCareer.faculty}`
            : ''}
          {activeCareer?.plan
            ? ` · Plan ${activeCareer.plan}`
            : ''}
        </span>
      </div>

      <div
        className={`career-selectors ${
          availablePlans.length > 1
            ? 'three-columns'
            : 'two-columns'
        }`}
      >
        <label>
          Universidad

          <select
            value={activeUniversity}
            onChange={(event) =>
              changeUniversity(event.target.value)
            }
          >
            {universities.map((university) => (
              <option
                key={university}
                value={university}
              >
                {university}
              </option>
            ))}
          </select>
        </label>

        <label>
          Carrera

          <select
            value={activeCareerName}
            onChange={(event) =>
              changeCareerName(event.target.value)
            }
          >
            {careerNames.map((careerName) => (
              <option
                key={careerName}
                value={careerName}
              >
                {careerName}
              </option>
            ))}
          </select>
        </label>

        {availablePlans.length > 1 && (
          <label>
            Plan

            <select
              value={activeCareerId}
              onChange={(event) => changePlan(event.target.value)}
            >
              {availablePlans.map((career) => (
                <option key={career.id} value={career.id}>
                  {career.plan}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  )
}

export default CareerSelector