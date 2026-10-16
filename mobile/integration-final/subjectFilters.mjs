import { STATUS } from '../../src/logic.js'
export const CRITERIA = Object.freeze({course:'Podés cursar',finals:'Finales habilitados',blocked:'Bloqueadas',unlocks:'Desbloqueos'})
export const EMPTY_FILTERS = Object.freeze({status:'',level:'',criteria:Object.freeze([])})
export const normalizeQuery = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim()
export function cleanFilters(value={}) {
 return {status:STATUS.includes(value.status)?value.status:'',level:typeof value.level==='string'?value.level:'',criteria:[...new Set((Array.isArray(value.criteria)?value.criteria:[]).filter(k=>Object.hasOwn(CRITERIA,k)))]}
}
export function academicLevels(model){return [...new Set(model.rows.map(row=>row.level))]}
export function filterCount(value){const f=cleanFilters(value);return Number(Boolean(f.status))+Number(Boolean(f.level))+f.criteria.length}
export function filterAcademicRows(model,value=EMPTY_FILTERS,query=''){
 const filters=cleanFilters(value), tokens=normalizeQuery(query).split(/\s+/).filter(Boolean)
 return model.rows.filter(row=>{
  if(filters.status && row.status!==filters.status)return false
  if(filters.level && row.level!==filters.level)return false
  if(!filters.criteria.every(key=>({course:()=>row.canEnroll,finals:()=>row.canSitFinal,blocked:()=>row.status==='Pendiente'&&!row.courseRequirementsMet,unlocks:()=>row.dependents.length>0}[key])()))return false
  const text=normalizeQuery(`${row.subject.name} ${row.code}`)
  return tokens.every(token=>text.includes(token))
 })
}
