// Second isolated gate; extends the demonstrated distributed CREATE, not production.
const { distributed } = require('./distributed-versioned-invitations.cjs')
function invitations(original) {
  let rules=distributed(original)
  rules=rules.replace('return occurrence == index + 1 && !exists(path) && existsAfter(path);',
    'return (resource == null ? occurrence == index + 1 : occurrence == request.resource.data.invitationSerial) && !exists(path) && existsAfter(path);')
  rules=rules.replace('&& !exists(path) && validCreationRecipient(p);', `&& validCreationRecipient(p)
            && (!exists(path) || (get(path).data.invitationSerial + 1 == p.invitationSerial
              && p.invitationOccurrences[uid] == p.invitationSerial
              && get(path).data.invitationOccurrences.get(uid, 0) != p.invitationOccurrences[uid]));`)
  const start=rules.indexOf('      function inviteInstanceMember() {'),end=rules.indexOf('      allow update:',start)
  if(start<0||end<0)throw Error('Missing INVITE seam')
  rules=rules.slice(0,start)+`      function inviteInstanceMember() {
        let before=resource.data;
        let after=request.resource.data;
        let changed=after.invitationOccurrences.diff(before.invitationOccurrences).affectedKeys();
        let uid=changed[0];
        return openMember(before) && proposalAuthority(request.auth.uid)
          && operationalBinding(before, request.auth.uid)
          && after.diff(before).affectedKeys().hasOnly(['inviteeIds','participants','invitedBy','invitationCycles','invitationOccurrences','invitationSerial','updatedAt'])
          && changed.size() == 1 && !(uid in before.memberIds)
          && after.invitationSerial == before.invitationSerial + 1
          && after.invitationOccurrences[uid] == after.invitationSerial
          && after.invitationCycles.diff(before.invitationCycles).affectedKeys().hasOnly([uid])
          && after.invitedBy.diff(before.invitedBy).affectedKeys().hasOnly([uid])
          && after.invitedBy[uid] == request.auth.uid
          && after.participants.diff(before.participants).affectedKeys().hasOnly([uid])
          && ((uid in before.inviteeIds && after.inviteeIds == before.inviteeIds
                && before.invitedBy[uid] == request.auth.uid
                && before.invitationCycles[uid] != after.invitationCycles[uid]
                && after.participants == before.participants)
            || (!(uid in before.inviteeIds) && after.inviteeIds == before.inviteeIds.concat([uid])))
          && versionedNoticeRequired(uid, planId, 0);
      }
`+rules.slice(end)
  rules=rules.replace('function inviteInstanceMember() {', `function inviteInstanceMember() {
        let a=request.resource.data;
        let ids=a.inviteeIds;
        return invitationFor(a.invitationOccurrences[ids[0]] == a.invitationSerial ? ids[0]
          : a.invitationOccurrences[ids[1]] == a.invitationSerial ? ids[1]
          : a.invitationOccurrences[ids[2]] == a.invitationSerial ? ids[2] : ids[3]);
      }
      function invitationFor(uid) {`)
  rules=rules.replace('        let uid=changed[0];','')
  rules=rules.replace('after.inviteeIds == before.inviteeIds.concat([uid])', 'after.inviteeIds.hasAll(before.inviteeIds) && after.inviteeIds.removeAll(before.inviteeIds) == [uid]')
  rules=rules.replace('&& operationalBinding(after, uid);', `&& operationalBinding(after, uid) && currentInvitation(before, uid);`)
  rules=rules.replace('      function joinInstanceMember() {', `      function currentInvitation(p, uid) {
        let inviter=p.invitedBy[uid];
        let a=getAfter(/databases/$(database)/documents/friendships/$(inviter + ':' + uid));
        let b=getAfter(/databases/$(database)/documents/friendships/$(uid + ':' + inviter));
        return (a != null && b == null && a.data.status == 'accepted' && a.data.cycleId == p.invitationCycles[uid])
          || (b != null && a == null && b.data.status == 'accepted' && b.data.cycleId == p.invitationCycles[uid]);
      }
      function joinInstanceMember() {`)
  return rules
}
module.exports={invitations}
