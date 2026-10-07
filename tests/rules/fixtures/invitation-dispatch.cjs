// ISOLATED PROTOTYPE ONLY. Never used by the application or deployment.
const {independent}=require('./independent-invitations.cjs')
function optimized(original){
 let r=independent(original)
 function once(a,b){if(r.split(a).length!==2)throw Error('Dispatch seam: '+a);r=r.replace(a,b)}
 // A selector is evidence only when the occurrence diff proves its identity.
 const fields="'invitationOccurrences', 'joinOccurrence']"
 if(r.split(fields).length!==3)throw Error('Shape seams')
 r=r.replaceAll(fields,"'invitationOccurrences', 'joinOccurrence', 'invitationRecipient']")
 once('&& d.joinOccurrence is int',"&& (d.invitationRecipient == null || d.invitationRecipient is string) && d.joinOccurrence is int")
 once('&& request.resource.data.invitationSerial == 0', '&& request.resource.data.invitationRecipient == null && request.resource.data.invitationSerial == 0')
 const a=r.indexOf('      function inviteInstanceMember() {'),b=r.indexOf('      function invitationFor(uid)',a)
 if(a<0||b<0)throw Error('Dispatch function seam')
 r=r.slice(0,a)+`      function inviteInstanceMember() {
        return invitationFor(request.resource.data.invitationRecipient);
      }
`+r.slice(b)
 once("'invitationSerial','updatedAt'])", "'invitationSerial','updatedAt','invitationRecipient'])")
 once('&& changed.size() == 1', '&& changed.size() == 1 && changed.hasOnly([uid])')
 return r
}
module.exports={optimized}
