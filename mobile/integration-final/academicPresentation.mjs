// Read-only presentation: all academic decisions delegate to the existing web.
import { STATUS, getStatus, getSubjectLevel, summary, availableToCourse, availableFinals, blockedSubjects, canCourse, canTakeFinal, missingCoursePrereqs, missingFinalPrereqs, unlocks } from '../../src/logic.js'
const validMap = map => map !== null && typeof map === 'object' && !Array.isArray(map) && Object.values(map).every(s => STATUS.includes(s))
export function academicPresentation(context, operation = { phase: 'idle' }) {
  const subjects = context.career?.subjects ?? []
  const valid = context.usable && Array.isArray(subjects) && validMap(context.record?.status)
  const status = Object.freeze(valid ? { ...context.record.status } : {})
  const catalog = valid ? subjects : []
  const stats = Object.freeze(catalog.length ? summary(catalog,status) : {total:0,approved:0,regularized:0,taking:0,pending:0,progress:0})
  const toCourse = availableToCourse(catalog,status), finals = availableFinals(catalog,status), blocked = blockedSubjects(catalog,status)
  const rows = catalog.map(subject => Object.freeze({
    subject, code:subject.code, status:getStatus(status,subject.code), level:getSubjectLevel(subject),
    hasRecordedStatus:Object.hasOwn(status,subject.code),
    courseRequirementsMet:canCourse(subject,status), finalRequirementsMet:canTakeFinal(subject,status,catalog),
    canEnroll:toCourse.some(s=>s.code===subject.code), canSitFinal:finals.some(s=>s.code===subject.code),
    missingCourse:missingCoursePrereqs(subject,status), missingFinal:missingFinalPrereqs(subject,status,catalog),
    dependents:unlocks(catalog,subject.code),
  }))
  return Object.freeze({
    scopeKey:context.key, catalogId:context.career?.id ?? null,
    available:Boolean(valid), dataError:Boolean(context.usable && !valid),
    operation, busy:['loading','saving'].includes(operation.phase),
    canEdit:Boolean(valid && !['loading','saving','error','conflict'].includes(operation.phase)),
    subjects:catalog, status, stats, toCourse, finals, blocked, pendingFinalCount:stats.regularized,
    rows, byCode:Object.fromEntries(rows.map(row=>[row.code,row])),
  })
}
export function visibleAcademicRows(model,{filter='Todas',query=''}={}) {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  const text=normalize(query)
  return model.rows.filter(row=>(filter==='Todas' || (filter==='Finales' ? row.canSitFinal : row.status===filter)) && normalize(`${row.subject.name} ${row.code}`).includes(text))
}
