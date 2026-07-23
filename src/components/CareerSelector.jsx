function CareerSelector({
  careers = [],
  activeCareerId,
  setActiveCareerId,
}) {
  if (!careers.length) {
    return null
  }

  const activeCareer =
    careers.find((career) => career.id === activeCareerId) ??
    careers[0]

  const universities = [
    ...new Set(
      careers
        .map((career) => career.university?.trim())
        .filter(Boolean)
    ),
  ]

  const activeUniversity = activeCareer.university?.trim()

  const universityCareers = careers.filter(
    (career) =>
      career.university?.trim() === activeUniversity
  )

  const careerNames = [
    ...new Set(
      universityCareers
        .map((career) => career.name?.trim())
        .filter(Boolean)
    ),
  ]

  const activeCareerName = activeCareer.name?.trim()

  const availablePlans = universityCareers.filter(
    (career) =>
      career.name?.trim() === activeCareerName
  )

  function changeUniversity(university) {
    const firstCareer = careers.find(
      (career) =>
        career.university?.trim() === university
    )

    if (firstCareer) {
      setActiveCareerId(firstCareer.id)
    }
  }

  function changeCareer(careerName) {
    const firstPlan = universityCareers.find(
      (career) =>
        career.name?.trim() === careerName
    )

    if (firstPlan) {
      setActiveCareerId(firstPlan.id)
    }
  }

  function changePlan(careerId) {
    const selectedPlan = availablePlans.find(
      (career) => career.id === careerId
    )

    if (selectedPlan) {
      setActiveCareerId(selectedPlan.id)
    }
  }

  const hasMultiplePlans = availablePlans.length > 1

  return (
    <section className="career-selector">
      <div>
        <p className="eyebrow">Plan de estudio</p>

        <h2>{activeCareer.name}</h2>

        <span>
          {[
            activeCareer.university,
            activeCareer.faculty,
            activeCareer.plan
              ? `Plan ${activeCareer.plan}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      <div
        className={`career-selectors ${
          hasMultiplePlans
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
              changeCareer(event.target.value)
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

        {hasMultiplePlans && (
          <label>
            Plan

            <select
              value={activeCareer.id}
              onChange={(event) =>
                changePlan(event.target.value)
              }
            >
              {availablePlans.map((career) => (
                <option
                  key={career.id}
                  value={career.id}
                >
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