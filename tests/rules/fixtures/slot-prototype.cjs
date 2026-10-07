// ISOLATED C feasibility prototype. Never deployment input.
const fs=require('node:fs')
const {friendActivity}=require('./distributed-friend-activity.cjs')
function slots(original){
 let r=friendActivity(original)
 const start=r.indexOf('    match /jointPlans/{planId} {')
 if(start<0)throw Error('Missing plan seam')
 let depth=1,end=r.indexOf('{',start+r.slice(start).indexOf(' {'))+1
 // Match braces in the body, not the path capture.
 const open=r.indexOf(' {',start)+1;end=open+1
 for(;depth;end++){if(r[end]==='{')depth++;if(r[end]==='}')depth--}
 r=r.slice(0,start)+fs.readFileSync('tests/rules/fixtures/slot-prototype.fragment.rules','utf8')+r.slice(end)
 return r
}
module.exports={slots}
