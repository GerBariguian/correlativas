import { useEffect, useRef, useState } from 'react'

export default function DeleteCareerProgress({ reset, careerName }) {
  const dialog = useRef(null)
  const cancel = useRef(null)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => () => dialog.current?.close(), [])
  async function erase() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try { await reset() } finally {
      busyRef.current = false
      setBusy(false)
      dialog.current?.close()
    }
  }
  return <details className="progress-danger-zone">
    <summary>Opciones avanzadas de esta carrera</summary>
    <button className="reset destructive" onClick={() => { dialog.current.showModal(); cancel.current?.focus() }}>Borrar progreso de esta carrera</button>
    <dialog ref={dialog} className="delete-progress-dialog" aria-labelledby="delete-progress-title" onCancel={(event) => { if (busyRef.current) event.preventDefault() }}>
      <h2 id="delete-progress-title">Borrar progreso de esta carrera</h2>
      <p>{careerName}</p>
      <p>Esta acción va a borrar el progreso académico guardado de esta carrera. No se puede deshacer.</p>
      <div className="friend-actions">
        <button className="reset" ref={cancel} disabled={busy} onClick={() => dialog.current.close()}>Cancelar</button>
        <button className="reset destructive" disabled={busy} onClick={erase}>{busy ? 'Borrando...' : 'Sí, borrar progreso'}</button>
      </div>
    </dialog>
  </details>
}
