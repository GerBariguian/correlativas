import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { careers } from '../data/careers'
import { readInstancePlanningSharing, setInstancePlanningSharing, refreshInstancePlanningSnapshot } from '../services/instancePlanning'
export default function InstanceSharingSettings({ user, instances }) {
 const [id,setId]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0)
 const selected=instances.find(i=>i.careerInstanceId===id)
 useEffect(()=>{let live=true;setData(null);setError('');if(selected)readInstancePlanningSharing(user.uid,id).then(d=>{if(live&&auth.currentUser===user)setData(d)}).catch(()=>{if(live&&auth.currentUser===user)setError('No se pudo consultar esta trayectoria.')});return()=>{live=false}},[user,id,selected?.lifecycle,attempt])
 async function change(task){if(busy)return;setBusy(true);setError('');try{await task()}catch{if(auth.currentUser===user)setError('No se pudo actualizar la configuración.')}finally{if(auth.currentUser===user){setBusy(false);setAttempt(n=>n+1)}}}
 return <details><summary>Compartir avance por trayectoria</summary>
  <label>Trayectoria<select value={id} disabled={busy} onChange={e=>setId(e.target.value)}><option value="">Elegir trayectoria</option>{instances.map(i=><option key={i.careerInstanceId} value={i.careerInstanceId}>{careers.find(c=>c.id===i.catalogId)?.name || i.catalogId}{i.lifecycle==='archived'?' · Archivada':''}</option>)}</select></label>
  <p>Sólo tus amigos con una trayectoria activa del mismo catálogo pueden consultar el resumen autorizado. Participar en un plan no comparte tu progreso.</p>
  {selected&&data?.careerInstanceId===id&&<><p>{data.sharing?.enabled?'Compartiendo resumen':'No compartido'}</p><button disabled={busy||selected.lifecycle!=='active'||data.lifecycle!=='active'} onClick={()=>change(()=>setInstancePlanningSharing(user.uid,id,!data.sharing?.enabled,data.sharing?.enabled?null:1))}>{data.sharing?.enabled?'Dejar de compartir':'Compartir materias aprobadas y habilitadas'}</button>{data.sharing?.enabled&&<button disabled={busy||selected.lifecycle!=='active'} onClick={()=>change(()=>refreshInstancePlanningSnapshot(user.uid,id))}>Actualizar resumen compartido</button>}</>}
  {error&&<p role="alert">{error}<button disabled={busy} onClick={()=>setAttempt(n=>n+1)}>Reintentar</button></p>}
 </details>
}
