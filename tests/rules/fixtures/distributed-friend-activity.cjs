// Isolated accepted canonical lifecycle + versioned friend Activity. Never deployment input.
const fs=require('node:fs')
function friendActivity(rules){
 let core=fs.readFileSync('tests/rules/fixtures/friendship-cycle-design.rules','utf8')
 core=core.slice(core.indexOf('    function actor()'),core.lastIndexOf('\n  }'))
 core=core.replace('request.auth != null','socialUser()')
  .replace('d.participants[0] != d.participants[1]','d.participants[0] < d.participants[1]')
  .replace(/\s*&& !existsAfter\([^\n]+\)/,'')
  .replace('&& !exists(c) && getAfter(c)',"&& friendNoticeRequired(d.recipientId, 'fr_' + d.cycleId) && !exists(c) && getAfter(c)")
  .replace("&& request.resource.data.status in ['accepted', 'rejected']", "&& request.resource.data.status in ['accepted', 'rejected'] && (request.resource.data.status != 'accepted' || friendNoticeRequired(resource.data.senderId, 'fa_' + resource.data.cycleId))")
 const start=rules.lastIndexOf('    match /friendships/{id} {')
 if(start<0)throw Error('Missing friendship seam')
 rules=rules.slice(0,start)+core+`
    function friendNoticeRequired(uid,id) {
      let path=/databases/$(database)/documents/users/$(uid)/activityInbox/$(id);
      return !exists(path) && existsAfter(path);
    }
    match /users/{uid}/activityInbox/{itemId} {
      allow create: if socialUser() && activityCreationEnabled() && friendVersionedNotice();
      function friendVersionedNotice() {
        let n=request.resource.data;
        let path=/databases/$(database)/documents/friendships/$(n.target.id);
        let after=getAfter(path).data;
        return n.keys().hasAll(['schemaVersion','type','actorUid','createdAt','target','readAt','friendshipCycleId'])
          && n.keys().hasOnly(['schemaVersion','type','actorUid','createdAt','target','readAt','friendshipCycleId'])
          && n.schemaVersion is int && n.schemaVersion == 2 && n.actorUid == request.auth.uid && uid != request.auth.uid
          && n.createdAt == request.time && n.readAt == null
          && n.target is map && n.target.keys().hasAll(['kind','id']) && n.target.keys().hasOnly(['kind','id']) && n.target.kind == 'friendship'
          && n.friendshipCycleId == after.cycleId
          && ((n.type == 'FRIEND_REQUEST' && itemId == 'fr_' + after.cycleId
            && after.status == 'pending' && after.senderId == request.auth.uid && after.recipientId == uid
            && (!exists(path) || (get(path).data.status in ['withdrawn','rejected'] && get(path).data.cycleId != after.cycleId)))
          || (n.type == 'FRIEND_ACCEPTED' && itemId == 'fa_' + after.cycleId
            && after.status == 'accepted' && after.recipientId == request.auth.uid && after.senderId == uid
            && get(path).data.status == 'pending' && get(path).data.cycleId == after.cycleId));
      }
    }
  }
}
`
 return rules
}
module.exports={friendActivity}
