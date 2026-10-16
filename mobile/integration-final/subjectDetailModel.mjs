// Presentation only. The shared model/web functions remain the academic authority.
import { missingFinalPrereqs } from '../../src/logic.js'
export function subjectDetailModel(model,code){
 const row=model.available?model.byCode[code]:null
 if(!row)return null
 const s=row.subject
 const requirement=(required,missing)=>required.map(code=>({code,name:model.byCode[code]?.subject.name??code,known:Boolean(model.byCode[code]),missing:missing.includes(code)}))
 return {...row, displayLevel:s.level??(s.year==null?'Nivel no informado':row.level), displayPeriod:s.term||'Período no informado',
  courseRegularized:requirement(s.prereqs??[],row.missingCourse.regularized),
  courseApproved:requirement(s.approvedPrereqs??[],row.missingCourse.approved),
  // Ask the existing web helper for the entire final requirement set using an
  // empty progress map. This preserves ALL, elective and exclusion semantics.
  finalRequired:requirement(missingFinalPrereqs(s,{},model.subjects),row.missingFinal),
  allFinals:(s.finalPrereqs??s.prereqs??[]).includes('ALL'),
  finalLabel:row.canSitFinal?'Final habilitado':row.status==='Aprobada'?'Materia ya aprobada':row.status!=='Regularizada'?'Todavía no está regularizada':'Correlativas de final pendientes',
  courseLabel:row.canEnroll?'Habilitada para cursar':row.status==='Pendiente'?'Correlativas de cursada pendientes':row.status==='Cursando'?'Cursando actualmente':row.status==='Regularizada'?'Cursada regularizada':'Materia ya aprobada',
  hoursLabel:s.hours!==null&&s.hours!==undefined&&s.hours!==''?`${s.hours} ${s.hoursUnit||'hs'}`:null,
 }
}

export function resolveSubjectRoute(model,context,route){
 if(route?.type!=='subject' || route.scopeKey!==context.key || model.scopeKey!==context.key || model.catalogId!==context.catalogId || !model.available)return null
 return model.byCode[route.code]?.subject??null
}
