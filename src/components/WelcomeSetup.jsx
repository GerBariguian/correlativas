function WelcomeSetup({
  careers,
  activeCareerId,
  setActiveCareerId,
  onContinue,
}) {
  const universities = [...new Set(careers.map((c) => c.university))]

  const activeCareer = careers.find((c) => c.id === activeCareerId)

  const selectedUniversity =
    activeCareer?.university ?? universities[0]

  const careersOfUniversity = careers.filter(
    (c) => c.university === selectedUniversity
  )

  return (
    <section className="login-page">
      <div className="login-card">
        <img src="/logo.png" alt="Correlativas" className="login-logo" />

        <p className="eyebrow">Bienvenido</p>

        <h1>Elegí tu carrera</h1>

        <p>
          Configurá Correlativas por única vez.
        </p>

        <h3>Universidad</h3>

        <div className="welcome-options">
          {universities.map((u) => (
            <button
              key={u}
              className={
                u === selectedUniversity
                  ? 'welcome-option active'
                  : 'welcome-option'
              }
              onClick={() => {
                const firstCareer = careers.find(
                  (c) => c.university === u
                )
                setActiveCareerId(firstCareer.id)
              }}
            >
              {u}
            </button>
          ))}
        </div>

        <h3>Carrera</h3>

        <div className="welcome-options">
          {careersOfUniversity.map((career) => (
            <button
              key={career.id}
              className={
                career.id === activeCareerId
                  ? 'welcome-option active'
                  : 'welcome-option'
              }
              onClick={() => setActiveCareerId(career.id)}
            >
              {career.name}
            </button>
          ))}
        </div>

        <button
          className="login-google-btn"
          onClick={onContinue}
        >
          Empezar
        </button>
      </div>
    </section>
  )
}

export default WelcomeSetup