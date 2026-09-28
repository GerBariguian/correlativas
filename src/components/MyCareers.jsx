import { useRef, useState } from 'react'

const catalogLabel = catalog => catalog ? `${catalog.university} · ${catalog.name} · Plan ${catalog.plan}` : 'Carrera con catálogo no disponible'
export default function MyCareers({ bridge, careers }) {
  const [catalogId, setCatalogId] = useState(''), [confirmId, setConfirmId] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const allowed = bridge.authority === 'instances' && bridge.phase === 'complete' && bridge.capabilities.academicWrite
  async function act(operation, value) {
    if (!allowed || inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await bridge.lifecycle[operation](value)
      if (operation === 'add') setCatalogId('')
      setConfirmId(null)
      setNotice({ add: 'Carrera agregada. Seleccionala cuando quieras verla.', select: 'Selección guardada.',
        archive: 'Carrera archivada. Tus datos se conservaron.', restore: 'Carrera restaurada. Podés seleccionarla; compartir sigue desactivado.' }[operation])
    } catch (failure) {
      setError(failure.code === 'DUPLICATE_CATALOG_INSTANCE' ? 'Ya tenés esta carrera. Si está archivada, restaurala.'
        : failure.code === 'INVALID_INPUT' ? 'Elegí una carrera disponible.'
          : 'No se pudo completar la acción. Revisá el estado de tus carreras antes de reintentar.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  if (!allowed) return <section className="side-card" aria-labelledby="my-careers-title">
    <h2 id="my-careers-title">Mis carreras</h2><p role="status">{bridge.authority === 'loading' ? 'Cargando tus carreras…'
      : bridge.authority === 'frozen' ? 'Estamos actualizando tu cuenta. La administración de carreras está suspendida.'
        : 'La administración de carreras no está disponible en este momento.'}</p>
  </section>
  const owned = new Set(bridge.instances.map(instance => instance.catalogId))
  return <section className="my-careers side-card" aria-labelledby="my-careers-title" aria-busy={busy}>
    <h2 id="my-careers-title">Mis carreras</h2>
    <p>Administrá tus carreras y elegí cuál querés consultar. Archivar conserva tu progreso y planificación.</p>
    {bridge.instances.length === 0 && <p>Todavía no agregaste carreras. Agregá la primera para comenzar.</p>}
    <form onSubmit={event => { event.preventDefault(); if (catalogId && !owned.has(catalogId)) act('add', catalogId) }}>
      <label htmlFor="add-career">Universidad, carrera y plan</label>
      <div className="my-careers-actions">
        <select id="add-career" value={catalogId} disabled={busy} onChange={event => setCatalogId(event.target.value)}>
          <option value="">Elegí una carrera</option>
          {careers.map(catalog => <option key={catalog.id} value={catalog.id} disabled={owned.has(catalog.id)}>
            {catalogLabel(catalog)}{owned.has(catalog.id) ? ' · Ya agregada' : ''}
          </option>)}
        </select>
        <button type="submit" disabled={busy || !catalogId || owned.has(catalogId)}>Agregar carrera</button>
      </div>
    </form>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {busy && <p role="status">Guardando cambios…</p>}
    {['active', 'archived'].map(state => {
      const rows = bridge.instances.filter(instance => instance.lifecycle === state)
      return rows.length > 0 && <section key={state} aria-label={state === 'active' ? 'Carreras activas' : 'Carreras archivadas'}>
        <h3>{state === 'active' ? 'Activas' : 'Archivadas'}</h3>
        <ul className="my-careers-list">{rows.map(instance => {
          const id = instance.careerInstanceId, catalog = careers.find(item => item.id === instance.catalogId)
          return <li key={id} className={state === 'archived' ? 'my-career-archived' : ''}>
            <h4>{catalogLabel(catalog)}</h4>
            <p>{state === 'archived' ? 'Archivada · Tus datos se conservan' : bridge.activeCareerInstanceId === id ? 'Activa · Seleccionada actualmente' : 'Activa'}</p>
            {!catalog && <p>Este catálogo no está disponible para consultar materias. Tus datos se conservan.</p>}
            <div className="my-careers-actions">
              {state === 'active' ? <>
                <button type="button" disabled={busy || !catalog || bridge.activeCareerInstanceId === id} onClick={() => act('select', id)}>Seleccionar</button>
                <button type="button" disabled={busy} onClick={() => setConfirmId(id)}>Archivar</button>
              </> : <button type="button" disabled={busy} onClick={() => act('restore', id)}>Restaurar</button>}
            </div>
            {confirmId === id && <fieldset className="my-careers-confirm" disabled={busy}>
              <legend>Confirmar archivo de carrera</legend>
              <p>Se conservarán el progreso, la planificación y el historial. Si está seleccionada, quedará sin selección; no se elegirá otra carrera. Compartir permanecerá desactivado.</p>
              <div className="my-careers-actions">
                <button type="button" onClick={() => act('archive', id)}>Confirmar archivo</button>
                <button type="button" onClick={() => setConfirmId(null)}>Cancelar</button>
              </div>
            </fieldset>}
          </li>
        })}</ul>
      </section>
    })}
  </section>
}
