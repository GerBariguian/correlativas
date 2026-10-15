import React from 'react'
import { ArrowRight, Compass, GraduationCap, Route, UserRound } from 'lucide-react'

function Destination({ icon: Icon, title, detail, onClick }) {
  return <button className="plan-shortcut navigation-destination" onClick={onClick}><Icon size={22} aria-hidden="true" /><span>{title}<span>{detail}</span></span><ArrowRight size={19} aria-hidden="true" /></button>
}
export function HomeLinks({ navigate }) {
  return <section className="navigation-links" aria-label="Planificación de tu carrera">
    <Destination icon={Compass} title="Planificar" detail="Mi selección de materias" onClick={() => navigate('planificador')} />
    <Destination icon={Route} title="Proyectar Carrera" detail="Explorá el próximo recorrido" onClick={() => navigate('proyeccion')} />
  </section>
}
export function SecondaryPage({ page, navigate }) {
  return <section className="navigation-page" aria-labelledby="destination-title">
    <div className="page-heading"><span className="section-kicker">TU CARRERA, A TU RITMO</span><h1 id="destination-title">{{ cuenta: 'Cuenta', carreras: 'Mis carreras', proyeccion: 'Proyectar Carrera' }[page]}</h1></div>
    {page === 'cuenta' && <>
      <div className="profile-feature"><span className="avatar lavender" aria-hidden="true">A</span><h2>Alex Martínez</h2><p>Perfil ficticio · Sin sesión real</p></div>
      <Destination icon={GraduationCap} title="Mis carreras" detail="Tu contexto académico" onClick={() => navigate('carreras')} />
      <HomeLinks navigate={navigate} />
      <p className="sheet-info">Esta entrega permite revisar la navegación. No hay autenticación ni gestión de cuentas reales.</p>
    </>}
    {page === 'carreras' && <>
      <article className="career-chip"><span className="career-icon"><GraduationCap aria-hidden="true" /></span><div><strong>Ingeniería en Sistemas</strong><span>UTN Buenos Aires · Plan 2023</span></div></article>
      <p className="sheet-info">Contexto fijo de ejemplo. La administración de carreras estará disponible más adelante. En esta revisión no se modifica ningún recorrido.</p>
      <Destination icon={UserRound} title="Ir a Cuenta" detail="Ver el perfil ficticio" onClick={() => navigate('cuenta')} />
    </>}
    {page === 'proyeccion' && <>
      <div className="empty-state"><Route size={36} aria-hidden="true" /><h2>Tu futuro recorrido</h2><p>Acá podrás explorar tu carrera por cuatrimestres y planificar finales. Por ahora podés recorrer la navegación.</p></div>
      <p className="sheet-info">Entrega 2.1 · Sólo navegación. No se generan ni guardan proyecciones.</p>
      <Destination icon={Compass} title="Ir a Planificar" detail="Explorar Mi selección" onClick={() => navigate('planificador')} />
    </>}
  </section>
}
