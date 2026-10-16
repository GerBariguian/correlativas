// Dashboard-only presentation; metrics and eligibility belong to the shared model.
import {recommendations} from '../../src/logic.js'
export function dashboardPresentation(model){
 const raw=model.available?recommendations(model.subjects,model.status):[]
 return {
  stats:model.stats,courseCount:model.toCourse.length,finalCount:model.finals.length,
  noCatalogEntries:model.available&&model.rows.length===0,
  noRecordedStates:model.available&&model.rows.length>0&&!model.rows.some(row=>row.hasRecordedStatus),
  complete:model.available&&model.stats.total>0&&model.stats.approved===model.stats.total,
  // Preserve ranking and titles. These are non-interactive suggestions because
  // the existing web API returns names, not stable subject IDs.
  guidance:raw.map(item=>({...item,reason:item.reason.replace(/desbloquea/gi,word=>word[0]==='D'?'Podría ayudar a habilitar':'podría ayudar a habilitar')})),
 }
}
