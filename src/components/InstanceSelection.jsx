import { useState } from 'react'

// Navigation over existing instances only; no bootstrap, ID generation or migration.
export default function InstanceSelection({ bridge, careers, onManage }) {
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  async function select(value) {
    setSaving(true); setError('')
    try { await bridge.repository.selectInstance(value || null) }
    catch { setError('No se pudo cambiar la trayectoria. No se eligió otra automáticamente.') }
    finally { setSaving(false) }
  }
  return <section className="side-card">
    <label>Trayectoria seleccionada <select value={bridge.activeCareerInstanceId ?? ''}
      disabled={saving || !bridge.capabilities.select} onChange={event => select(event.target.value)}>
      <option value="">Sin selección</option>
      {bridge.instances.filter(instance => instance.lifecycle === 'active').map(instance => {
        const catalog = careers.find(career => career.id === instance.catalogId)
        return <option key={instance.careerInstanceId} value={instance.careerInstanceId}>
          {catalog ? `${catalog.university} · ${catalog.name} · Plan ${catalog.plan}` : 'Catálogo no disponible'}
        </option>
      })}
    </select></label>
    {onManage && <button type="button" onClick={onManage}>Mis carreras</button>}
    {error && <p role="alert">{error}</p>}
  </section>
}
