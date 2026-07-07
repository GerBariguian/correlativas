import { RotateCcw } from 'lucide-react'

function Header({ reset }) {
  return (
    <header className="hero">
      <div>
        <p className="eyebrow">Asistente académico</p>
        <h1>Correlativas</h1>
        <p className="subtitle">
          Sabé qué podés cursar, qué podés rendir y qué materias te están frenando.
        </p>
      </div>

      <button className="reset" onClick={reset}>
        <RotateCcw size={18} />
        Reiniciar
      </button>
    </header>
  )
}

export default Header