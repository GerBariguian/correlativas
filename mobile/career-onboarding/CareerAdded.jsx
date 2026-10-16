import React,{useEffect,useRef} from 'react'
import {CheckCircle2} from 'lucide-react'
export function CareerAdded({demo,instance,configure,later}) {
 const title=useRef(null)
 const catalog=demo.careers.find(c=>c.id===instance.catalogId)
 const selected=instance.careerInstanceId===demo.context.activeCareerInstanceId
 const usable=instance.lifecycle==='active' && Boolean(catalog)
 useEffect(()=>{title.current?.focus({preventScroll:true})},[instance.careerInstanceId])
 return <section className="career-added" aria-labelledby="career-added-title">
  <CheckCircle2 size={32} aria-hidden="true"/>
  <h1 id="career-added-title" ref={title} tabIndex={-1}>Carrera agregada correctamente</h1>
  <h2>{catalog?.name ?? 'Tu trayectoria'}</h2><p>{catalog?.university} · Plan {catalog?.plan}</p>
  <p>{selected?'Tu primera carrera quedó seleccionada. Podés cargar tus materias ahora o hacerlo después.':demo.context.activeCareerInstanceId?'Tu carrera seleccionada no cambió. Si querés configurar esta nueva trayectoria, te pediremos confirmar el cambio de contexto.':'Seguís sin carrera seleccionada. Para configurar esta nueva trayectoria, primero te pediremos confirmar su selección.'}</p>
  <p>La carga es opcional. Cada carrera y plan conserva su propio progreso y los estados ya registrados están protegidos.</p>
  {!usable&&<p role="status">Esta trayectoria está archivada o su catálogo no está disponible. Revisala desde Mis carreras.</p>}
  <button className="primary-btn full" disabled={!usable || (selected && demo.presentation.busy)} onClick={configure}>Configurar mis materias</button>
  <button className="secondary-btn full" onClick={later}>Hacerlo después</button>
 </section>
}
