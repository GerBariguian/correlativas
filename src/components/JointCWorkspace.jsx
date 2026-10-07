import { useEffect, useMemo, useRef, useState } from 'react'
import { auth } from '../firebase'
import { careers } from '../data/careers'
import { jointCProductSession } from '../services/jointCProduct'
import { subscribeFriendships } from '../services/friends'
import { compatibleJointInstances, currentJointEdge, JOINT_C_UNAVAILABLE } from '../jointCProductLogic'
import useJointProfiles from '../hooks/useJointProfiles'
import JointPlanHistory from './JointPlanHistory'
import InstanceSharingSettings from './InstanceSharingSettings'
import { readInstancePlanningSnapshot } from '../services/instancePlanning'

export default function JointCWorkspace({ user, bridge, activityIntent, onActivityConsumed }) {
 const product=useMemo(()=>jointCProductSession(user.uid),[user])
 const [plans,setPlans]=useState([]),[planId,setPlanId]=useState(''),[detail,setDetail]=useState(null),[subjects,setSubjects]=useState([])
 const [state,setState]=useState('loading'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0)
 const [friends,setFriends]=useState([]),[recipients,setRecipients]=useState([]),[results,setResults]=useState([])
 const [instance,setInstance]=useState(''),[joinInstance,setJoinInstance]=useState(''),[invitation,setInvitation]=useState(null)
 const [expectedOccurrence,setExpectedOccurrence]=useState(null)
 const [shared,setShared]=useState(null)
 const [newName,setNewName]=useState('Plan conjunto'),[rename,setRename]=useState('')
 const [code,setCode]=useState(''),[targets,setTargets]=useState([]),[subjectState,setSubjectState]=useState('loading')
 const live=useRef(true),lock=useRef(false),generation=useRef(0),consumed=useRef(null)
 const instances=bridge.instances || [],enabled=bridge.authority==='instances' && bridge.phase==='complete'
 const current=()=>live.current && auth.currentUser===user
 useEffect(()=>{live.current=true;return()=>{live.current=false;generation.current++}},[user])
 useEffect(()=>subscribeFriendships(user.uid,r=>{if(current())setFriends(r)},()=>{if(current())setFriends([])}),[user])
 useEffect(()=>{
  let valid=true;setState('loading')
  product.discover().then(r=>{if(valid&&current()){setPlans(r.plans);setState('ready');if(r.unavailable.length)setError('Algunos planes ya no están disponibles.')}})
   .catch(()=>{if(valid&&current()){setPlans([]);setState('error')}})
  return()=>{valid=false}
 },[product,attempt])
 useEffect(()=>{
  if(!activityIntent || consumed.current===activityIntent.token)return
  consumed.current=activityIntent.token
  if(activityIntent.model==='C'){setExpectedOccurrence(activityIntent.occurrenceId);setPlanId(activityIntent.planId);setError('');setAttempt(n=>n+1)}
  else setError(JOINT_C_UNAVAILABLE)
  onActivityConsumed?.()
 },[activityIntent,onActivityConsumed])
 useEffect(()=>{
  const token=++generation.current;setDetail(null);setSubjects([]);setShared(null);setInvitation(null);setJoinInstance('');setTargets([]);setSubjectState('loading')
  if(!planId)return
  const active=()=>current()&&generation.current===token
  product.plan(planId).then(async p=>{
   if(!active())return;setDetail(p);setRename(p.plan.name || '')
   const own=p.slots.find(s=>s.slot.uid===user.uid)
   if(own?.slot.status==='pending'){
    if(expectedOccurrence && own.slot.occurrence!==expectedOccurrence){setError(JOINT_C_UNAVAILABLE);return}
    try{const i=await product.invitation(planId,own.slot.occurrence);if(active())setInvitation(i)}catch{if(active())setError(JOINT_C_UNAVAILABLE)}
   }
   if(p.people.some(x=>x.uid===user.uid)){
    try{const rows=await product.subjects(planId);if(active()){setSubjects(rows);setSubjectState('ready')}}catch{if(active())setSubjectState('error')}
   }else if(active())setSubjectState('unavailable')
  }).catch(()=>{if(active())setError(JOINT_C_UNAVAILABLE)})
  return()=>{generation.current++}
 },[product,planId,attempt,user,expectedOccurrence])
 const accepted=friends.filter(f=>f.status==='accepted'),people=detail?.people || []
 const friendIds=[...new Set(accepted.map(f=>f.participants.find(u=>u!==user.uid)))]
 const ids=[...people.map(p=>p.uid),...accepted.flatMap(f=>f.participants)]
 const profiles=useJointProfiles(user,ids),name=uid=>uid===user.uid?'Vos':profiles[uid]?.name || 'Participante'
 const catalog=careers.find(c=>c.id===detail?.plan.catalogId),actor=people.find(p=>p.uid===user.uid)
 const ownSlot=detail?.slots.find(s=>s.slot.uid===user.uid),owner=detail?.plan.ownerId===user.uid
 const actorOperable=actor && instances.some(i=>i.careerInstanceId===actor.reference.instanceId && i.lifecycle==='active' && i.catalogId===detail?.plan.catalogId)
 const editable=enabled && actorOperable && !detail?.plan.closed && !detail?.plan.deleting
 const compatible=detail?compatibleJointInstances(instances,detail.plan.catalogId):[]
 async function run(fn,refresh=true){
  if(lock.current||!current())return;lock.current=true;setBusy(true);setError('')
  try{await fn()}catch{if(current())setError('No se pudo completar la acción. No está disponible o no está permitida.')}
  finally{lock.current=false;if(current()){setBusy(false);if(refresh)setAttempt(n=>n+1)}}
 }
 const label=i=>{const c=careers.find(c=>c.id===i.catalogId);return c?`${c.university} · ${c.name} · Plan ${c.plan}`:'Catálogo no disponible'}
 function checks(values,selected,setSelected,max){return values.map(v=><label className="planning-check" key={v}><input type="checkbox" checked={selected.includes(v)} disabled={busy||(!selected.includes(v)&&selected.length>=max)} onChange={e=>setSelected(old=>e.target.checked?[...old,v]:old.filter(x=>x!==v))}/>{name(v)}</label>)}
 return <section className="planning-ui">
  <h2>Planes conjuntos</h2>
  <p>Participar no comparte tu progreso. Cada invitación y asignación se guarda de forma independiente.</p>
  <label className="planning-field">Tus planes<select value={planId} disabled={busy} onChange={e=>{setExpectedOccurrence(null);setPlanId(e.target.value);setResults([]);setError('');setCode('')}}><option value="">Elegir plan</option>{planId&&!plans.some(p=>p.planId===planId)&&<option value={planId}>Plan seleccionado</option>}{plans.map(p=><option key={p.planId} value={p.planId}>{p.plan.name || careers.find(c=>c.id===p.plan.catalogId)?.name || p.plan.catalogId} · {p.planId.slice(-6)}{p.plan.closed?' · Cerrado':''}</option>)}</select></label>
  {state==='loading'&&<p role="status">Cargando planes…</p>}
  {state==='error'&&<p role="alert">No pudimos cargar tus planes.</p>}
  <button disabled={busy} onClick={()=>setAttempt(n=>n+1)}>Actualizar planes</button>
  {enabled&&<details><summary>Crear un plan</summary>
   <label className="planning-field">Nombre del plan<input value={newName} maxLength={80} disabled={busy} onChange={e=>setNewName(e.target.value)}/></label>
   <label className="planning-field">Trayectoria para este plan<select value={instance} disabled={busy} onChange={e=>setInstance(e.target.value)}><option value="">Elegir explícitamente</option>{instances.filter(i=>i.lifecycle==='active'&&careers.some(c=>c.id===i.catalogId)).map(i=><option key={i.careerInstanceId} value={i.careerInstanceId}>{label(i)}</option>)}</select></label>
   <fieldset disabled={busy}><legend>Invitar amigos (hasta cuatro)</legend>{checks(friendIds,recipients,setRecipients,4)}</fieldset>
   <button disabled={busy||!instance||!newName.trim()} onClick={()=>run(async()=>{
    const p=await product.create(instances.find(i=>i.careerInstanceId===instance),newName);if(!current())return
    setPlanId(p);setResults([])
    const r=await product.invite(p,recipients);if(current())setResults(r)
   })}>Crear plan{recipients.length?' e invitar':''}</button>
  </details>}
  {detail&&<article className="planning-plan">
   <h3>{detail.plan.name || catalog?.name || detail.plan.catalogId}{detail.plan.closed?' · Cerrado':''}</h3>
   <p>{catalog?.name || detail.plan.catalogId}</p>
   {owner&&enabled&&!detail.plan.closed&&<label className="planning-field">Renombrar plan<input value={rename} maxLength={80} disabled={busy} onChange={e=>setRename(e.target.value)}/><button disabled={busy||!rename.trim()} onClick={()=>run(()=>product.rename(planId,rename))}>Guardar nombre</button></label>}
   <ul>{people.map(p=><li key={p.uid}>{name(p.uid)} · Miembro{p.uid===detail.plan.ownerId?' · Creador':''}{p.uid!==user.uid&&<button disabled={busy} onClick={()=>run(async()=>{
    const token=generation.current;setShared(null)
    const result=await readInstancePlanningSnapshot(user.uid,p.uid,p.reference.instanceId,detail.plan.catalogId)
    if(current()&&generation.current===token){if(!result)throw Error('UNAVAILABLE');setShared({uid:p.uid,snapshot:result.snapshot})}
   },false)}>Ver resumen compartido</button>}</li>)}{detail.slots.filter(s=>s.slot.status==='pending').map(s=><li key={s.slotId}>{name(s.slot.uid)} · Invitación pendiente</li>)}</ul>
   {shared&&<div><h4>Resumen compartido de {name(shared.uid)}</h4><p>Aprobadas: {shared.snapshot.approvedCodes.join(', ')||'Ninguna'}</p><p>Habilitadas para cursar: {shared.snapshot.availableToCourseCodes.join(', ')||'Ninguna'}</p>{shared.snapshot.pendingFinalCodes&&<p>Finales pendientes: {shared.snapshot.pendingFinalCodes.join(', ')||'Ninguno'}</p>}</div>}
   {invitation&&enabled&&<div className="planning-invitation">
    <p>Elegí tu trayectoria para aceptar esta invitación. Tu progreso continúa siendo privado.</p>
    {!compatible.length?<p>Necesitás una trayectoria activa de este catálogo. Podés revisarla en Mis carreras.</p>:<label className="planning-field">Trayectoria compatible<select value={joinInstance} disabled={busy} onChange={e=>setJoinInstance(e.target.value)}><option value="">Elegir explícitamente</option>{compatible.map(i=><option value={i.careerInstanceId} key={i.careerInstanceId}>{label(i)}</option>)}</select></label>}
    <button disabled={busy||!joinInstance} onClick={()=>run(()=>product.join(planId,invitation.occurrenceId,joinInstance,instances))}>Aceptar invitación</button>
   </div>}
   {ownSlot&&enabled&&<button className="planning-secondary" disabled={busy} onClick={()=>run(()=>product.release(planId,ownSlot))}>{ownSlot.slot.status==='pending'?'Rechazar invitación':'Salir del plan'}</button>}
   {editable&&<details><summary>Invitar participantes</summary>{checks(friendIds.filter(u=>!people.some(p=>p.uid===u)),recipients,setRecipients,4)}<button disabled={busy||!recipients.length} onClick={()=>run(async()=>{const r=await product.invite(planId,recipients);if(current())setResults(r)})}>Enviar invitaciones seleccionadas</button><p>Para reintentar, seleccioná sólo a quienes figuran como no disponibles.</p></details>}
   {editable&&catalog&&<fieldset disabled={busy}><legend>Asignar materia</legend>
    <label className="planning-field">Materia<select value={code} onChange={e=>setCode(e.target.value)}><option value="">Elegir materia</option>{catalog.subjects.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
    {checks(people.map(p=>p.uid),targets,setTargets,5)}
    <button disabled={!catalog.subjects.some(s=>s.code===code)||!targets.length} onClick={()=>run(async()=>{const r=await product.assign(planId,code,actor.reference,people.filter(p=>targets.includes(p.uid)));if(current())setResults(r)})}>Asignar a participantes seleccionados</button>
   </fieldset>}
   {subjectState==='error'&&<p role="alert">Las materias no están disponibles. Podés reintentar con Actualizar planes.</p>}
   {subjects.map(row=><article key={row.code}><h4>{catalog?.subjects.find(s=>s.code===row.code)?.name || row.code}</h4><ul>{row.edges.map(({edgeId,edge})=>{const current=currentJointEdge(edge,people);return <li key={edgeId}>{name(edge.uid)} · {edge.state==='assigned'?'Asignada':'Retirada'}{!current?' · Ocupación histórica':''}
    {editable&&(edge.state==='assigned'||current)&&<button disabled={busy} onClick={()=>run(()=>product.transition(planId,row.code,actor.reference,edge,edge.state==='assigned'?'unassigned':'assigned'))}>{edge.state==='assigned'?'Retirar asignación':'Reasignar'}</button>}</li>})}</ul></article>)}
   {owner&&enabled&&<div className="planning-actions">{!detail.plan.closed&&<button className="planning-secondary" disabled={busy} onClick={()=>{if(window.confirm('¿Cerrar el plan? No podrá reabrirse.'))run(()=>product.close(planId))}}>Cerrar plan</button>}<button className="planning-secondary planning-danger" disabled={busy} onClick={()=>{if(window.confirm('¿Eliminar definitivamente este plan?'))run(async()=>{await product.delete(planId);if(current()){setPlanId('');setDetail(null)}})}}>Eliminar plan</button></div>}
  </article>}
  {!!results.length&&<div role="status"><p>{results.filter(r=>r.status==='success').length} completadas; {results.filter(r=>r.status!=='success').length} no disponibles. Los resultados completados se conservan.</p><ul>{results.map(r=><li key={r.uid}>{name(r.uid)}: {r.status==='success'?'Completado':'No disponible'}</li>)}</ul></div>}
  {busy&&<p role="status">Guardando…</p>}{error&&<p role="alert">{error}</p>}
  {enabled&&<InstanceSharingSettings user={user} instances={instances}/>}
  <details><summary>Historia de planes anteriores</summary><JointPlanHistory user={user}/></details>
 </section>
}
