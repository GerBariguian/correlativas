import React,{useEffect,useRef,useState} from 'react'
import {Search,SlidersHorizontal,X,ChevronRight,Check,BookOpen,GraduationCap,LockKeyhole} from 'lucide-react'
import {STATUS} from '../../src/logic.js'
import {EMPTY_FILTERS,CRITERIA,filterCount,filterAcademicRows,academicLevels,cleanFilters} from './subjectFilters.mjs'
const labels={Pendiente:'Pendientes',Cursando:'Cursando',Regularizada:'Regularizadas',Aprobada:'Aprobadas'}
const statusClass={Pendiente:'pending',Cursando:'taking',Regularizada:'regularized',Aprobada:'approved'}
export function SubjectsList({model,filters,setFilters,query,setQuery,openFilters,openSubject,plan}){
 const rows=filterAcademicRows(model,filters,query)
 const [limit,setLimit]=useState(60), nextFocus=useRef(null)
 const signature=JSON.stringify([filters,query,model.scopeKey])
 useEffect(()=>{setLimit(60)},[signature])
 useEffect(()=>{if(nextFocus.current!==null){document.querySelector(`[data-result-index="${nextFocus.current}"]`)?.focus({preventScroll:true});nextFocus.current=null}},[limit])
 const count=filterCount(filters)
 const chips=[...(filters.status?[{key:'status',label:`Estado: ${labels[filters.status]}`,clear:()=>setFilters({...filters,status:''})}]:[]),...(filters.level?[{key:'level',label:`Nivel: ${filters.level}`,clear:()=>setFilters({...filters,level:''})}]:[]),...filters.criteria.map(key=>({key,label:CRITERIA[key],clear:()=>setFilters({...filters,criteria:filters.criteria.filter(k=>k!==key)})}))]
 function clear(){setFilters({...EMPTY_FILTERS});setQuery('')}
 return <section className="subjects-mobile" aria-label="Listado de materias">
  <div className="subjects-search-row"><label className="search-field"><Search size={19} aria-hidden="true"/><input type="search" aria-label="Buscar materia" placeholder="Nombre o código…" value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off" enterKeyHint="search"/></label><button className="subject-filter-trigger" onClick={openFilters} aria-label={`Abrir filtros avanzados, ${count} activos`} aria-haspopup="dialog"><SlidersHorizontal size={19} aria-hidden="true"/><span>Filtros{count>0&&<b>{count}</b>}</span></button></div>
  <div className="filter-scroller" role="group" aria-label="Filtrar materias por estado" onFocusCapture={e=>e.target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})}>{['',...['Cursando','Regularizada','Aprobada','Pendiente']].map(status=><button key={status} aria-pressed={filters.status===status} onClick={()=>setFilters({...filters,status})}>{status?labels[status]:'Todas'}</button>)}</div>
  {chips.length>0&&<div className="applied-subject-filters" aria-label="Filtros aplicados">{chips.map(chip=><button key={chip.key} aria-label={`Quitar filtro ${chip.label}`} onClick={chip.clear}>{chip.label}<X size={14} aria-hidden="true"/></button>)}</div>}
  <div className="list-caption subject-results"><span role="status" aria-live="polite" aria-atomic="true">{rows.length} {rows.length===1?'materia':'materias'}{rows.length!==model.rows.length?` de ${model.rows.length}`:''}</span><span>Plan {plan}</span></div>
  {(count>0 || query!=='')&&<button className="subject-clear-all" onClick={clear}>Limpiar búsqueda y filtros</button>}
  {model.rows.length===0?<div className="empty-state"><BookOpen size={32} aria-hidden="true"/><h2>Este catálogo no tiene materias</h2><p>Podés revisar el contexto académico desde Mis carreras.</p></div>:rows.length===0?<div className="empty-state"><Search size={30} aria-hidden="true"/><h2>No encontramos materias</h2><p>{query?'Probá otro nombre o código, o quitá algún filtro.':'No hay materias que cumplan todos los filtros seleccionados.'}</p><button className="primary-btn" onClick={clear}>Ver todas</button></div>:<>
  <div className="subject-list subject-results-list">{rows.slice(0,limit).map((row,index)=><button className={`demo-subject-row subject-result-row ${statusClass[row.status]}`} key={row.code} data-subject-code={row.code} data-result-index={index} onClick={()=>openSubject(row.subject)} aria-label={`${row.subject.name}, ${row.code}, ${row.level}, ${row.status}. Ver detalle`}>
   <span className={`subject-symbol ${statusClass[row.status]}`} aria-hidden="true">{row.status==='Aprobada'?<Check size={18}/>:row.status==='Cursando'?<BookOpen size={18}/>:row.status==='Regularizada'?<GraduationCap size={18}/>:<span className="pending-circle"/>}</span>
   <span className="subject-row-copy"><strong>{row.subject.name}</strong><small className="subject-code">{row.code} · {row.level}{row.subject.term && row.subject.term!==row.level?` · ${row.subject.term}`:''}</small><span className={`demo-status ${statusClass[row.status]}`}>{row.status}</span>{row.status==='Pendiente'&&<span className={`subject-availability ${row.canEnroll?'eligible':''}`}>{row.canEnroll?'Habilitada para cursar':<><LockKeyhole size={12} aria-hidden="true"/>Correlativas pendientes</>}</span>}{row.status==='Regularizada'&&<span className={`subject-availability ${row.canSitFinal?'eligible':''}`}>{row.canSitFinal?'Final habilitado':'Final con correlativas pendientes'}</span>}</span><ChevronRight size={18} aria-hidden="true"/>
  </button>)}</div>
  {rows.length>60&&<p className="subject-window-count">Mostrando {Math.min(limit,rows.length)} de {rows.length}. Se conserva el orden del catálogo.</p>}
  {limit<rows.length&&<button className="secondary-btn full subject-load-more" onClick={()=>{nextFocus.current=limit;setLimit(n=>n+60)}}>Mostrar más materias</button>}
  </>}
 </section>
}
export function SubjectFilters({model,filters,query,onApply,onCancel}){
 const [draft,setDraft]=useState(()=>cleanFilters(filters))
 const levels=academicLevels(model), count=filterAcademicRows(model,draft,query).length
 return <form className="subject-filter-form" onSubmit={e=>{e.preventDefault();onApply(cleanFilters(draft))}}>
  <p>Los criterios se combinan: se mostrarán solo las materias que cumplan todos. La búsqueda actual también se conserva.</p>
  <label htmlFor="subject-state">Estado académico</label><select id="subject-state" value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="">Todos los estados</option>{STATUS.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select>
  <label htmlFor="subject-level">Nivel</label><select id="subject-level" value={draft.level} onChange={e=>setDraft({...draft,level:e.target.value})}><option value="">Todos los niveles</option>{levels.map(level=><option key={level} value={level}>{level}</option>)}</select>
  <fieldset><legend>Condiciones académicas</legend>{Object.entries(CRITERIA).map(([key,label])=><label className="subject-criterion" key={key}><input type="checkbox" checked={draft.criteria.includes(key)} onChange={e=>setDraft({...draft,criteria:e.target.checked?[...draft.criteria,key]:draft.criteria.filter(k=>k!==key)})}/><span>{label}</span></label>)}</fieldset>
  <small>«Desbloqueos» indica dependencias directas, no una habilitación automática. «Bloqueadas» filtra materias pendientes; no impide registrar su estado.</small>
  <p role="status" className="subject-filter-preview">{count} {count===1?'resultado':'resultados'} con esta selección</p>
  <button type="button" className="text-btn" onClick={()=>setDraft({...EMPTY_FILTERS})}>Limpiar filtros</button>
  <div className="subject-filter-actions"><button type="button" className="secondary-btn" onClick={onCancel}>Cancelar</button><button className="primary-btn" type="submit">Ver {count} {count===1?'materia':'materias'}</button></div>
 </form>
}
