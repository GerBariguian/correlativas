// The web domain decides eligibility, explicit statuses and scope identity.
import { createOnboardingDraft, decideOnboardingSubjects, onboardingReviewProgress, onboardingScopeKey } from '../../src/academicOnboardingLogic.js'
import { academicScope } from '../../src/userDataAuthorityLogic.js'
export function sessionKey(context) { return onboardingScopeKey(academicScope(context,context.catalogId)) }
export function startSession(context) {
 if(!context.usable)throw new Error('ONBOARDING_UNAVAILABLE')
 const draft=createOnboardingDraft({scope:academicScope(context,context.catalogId),subjects:context.career.subjects,progress:{state:'loaded',statusMap:context.record.status}})
 return {draft,cursor:0,skipped:[],complete:false}
}
export const editableCodes=session=>session.draft.codes.filter(code=>!Object.hasOwn(session.draft.baseline,code))
export function sessionProgress(session){ return {...onboardingReviewProgress(session.draft),skipped:session.skipped.length} }
export function moveSession(session,offset){return {...session,cursor:Math.max(0,Math.min(editableCodes(session).length,session.cursor+offset))} }
export function skipSession(session){
 const code=editableCodes(session)[session.cursor]
 if(!code)return session
 return {...moveSession(session,1),skipped:Object.hasOwn(session.draft.decisions,code)?session.skipped:[...new Set([...session.skipped,code])]}
}
export function confirmDecision(session,code,status){
 const draft=decideOnboardingSubjects(session.draft,[code],status)
 // Back/correction is by card, not an ever-growing history of all maps.
 return {...moveSession(session,1),draft:{...draft,past:[],future:[]},skipped:session.skipped.filter(c=>c!==code),complete:false}
}
export function sessionMatches(session,context){
 try{
  if(onboardingScopeKey(session.draft.scope)!==sessionKey(context))return false
  if(JSON.stringify(session.draft.codes)!==JSON.stringify(context.career.subjects.map(s=>s.code)))return false
  const expected={...session.draft.baseline,...session.draft.decisions}
  return JSON.stringify(Object.entries(expected).sort())===JSON.stringify(Object.entries(context.record.status).sort())
 }catch{return false}
}
// Restore through domain constructors; never trust serialized drafts or maps.
export function restoreSession(raw,context){
 const fresh=startSession(context)
 if(!raw || !sessionMatches(raw,context))return null
 const base=createOnboardingDraft({scope:fresh.draft.scope,subjects:context.career.subjects,progress:{state:'loaded',statusMap:raw.draft.baseline}})
 let draft=base
 for(const [code,status] of Object.entries(raw.draft.decisions))draft=decideOnboardingSubjects(draft,[code],status)
 const codes=editableCodes({draft})
 if(!Number.isInteger(raw.cursor)||raw.cursor<0||raw.cursor>codes.length||!Array.isArray(raw.skipped)||raw.skipped.some(c=>!codes.includes(c)||Object.hasOwn(draft.decisions,c)))return null
 return {draft:{...draft,past:[],future:[]},cursor:raw.cursor,skipped:[...new Set(raw.skipped)],complete:raw.complete===true}
}
