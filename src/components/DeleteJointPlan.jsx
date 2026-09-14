import { useRef } from 'react'

export default function DeleteJointPlan({ name, busy, onDelete }) {
  const dialog = useRef(null)
  const cancel = useRef(null)
  const pending = useRef(false)
  return <>
    <button className="reset destructive" disabled={busy} onClick={() => { dialog.current.showModal(); cancel.current?.focus() }}>Eliminar plan</button>
    <dialog ref={dialog} className="delete-progress-dialog" aria-labelledby="delete-plan-title" onCancel={(event) => { if (busy || pending.current) event.preventDefault() }}>
      <h2 id="delete-plan-title">Eliminar {name}</h2>
      <p>Esta acción eliminará definitivamente este plan conjunto. No se puede deshacer.</p>
      <p>Si se interrumpe la conexión, podrás reintentar la eliminación desde este plan.</p>
      <div className="friend-actions">
        <button className="reset" ref={cancel} disabled={busy} onClick={() => dialog.current.close()}>Cancelar</button>
        <button className="reset destructive" disabled={busy} onClick={async () => {
          if (pending.current) return
          pending.current = true
          try { if (await onDelete()) dialog.current?.close() } finally { pending.current = false }
        }}>{busy ? 'Eliminando...' : 'Sí, eliminar plan'}</button>
      </div>
    </dialog>
  </>
}
