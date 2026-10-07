// ISOLATED candidate: one semantic-equivalent renewal branch refactor only.
const {optimized:dispatch}=require('./invitation-dispatch.cjs')
function optimized(original){
 const r=dispatch(original)
 const before=`&& ((uid in before.inviteeIds && after.inviteeIds == before.inviteeIds
                && before.invitedBy[uid] == request.auth.uid
                && before.invitationCycles[uid] != after.invitationCycles[uid]
                && after.participants == before.participants)
            || (!(uid in before.inviteeIds) && after.inviteeIds.hasAll(before.inviteeIds) && after.inviteeIds.removeAll(before.inviteeIds) == [uid]))`
 const after=`&& (uid in before.inviteeIds
            ? (after.inviteeIds == before.inviteeIds
                && before.invitedBy[uid] == request.auth.uid
                && before.invitationCycles[uid] != after.invitationCycles[uid]
                && after.participants == before.participants)
            : (after.inviteeIds.hasAll(before.inviteeIds) && after.inviteeIds.removeAll(before.inviteeIds) == [uid]))`
 if(r.split(before).length!==2)throw Error('Renewal branch seam changed')
 return r.replace(before,after)
}
module.exports={optimized}
