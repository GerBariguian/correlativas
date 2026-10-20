import React from 'react'
import { academicStateMessage } from './c4-ui-model.mjs'
export function C4AcademicState({ model, refresh }) {
  const [title, text] = academicStateMessage(model)
  return <section className="c4-state" aria-live="polite"><span className="c4-kicker">LECTURA ACADÉMICA · {model.state}</span><h2>{title}</h2><p>{text}</p>
    {(model.code || model.reason) && <small>{model.code || model.reason}</small>}
    {model.state === 'error' && <p><button onClick={() => void refresh()}>Actualizar consulta</button></p>}
  </section>
}
