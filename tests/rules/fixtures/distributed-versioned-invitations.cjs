const { versionedInvitations } = require('./versioned-invitations.cjs')
function distributed(original) {
  let rules = versionedInvitations(original)
  const start = rules.indexOf('    function versionedNoticeRequired(')
  const end = rules.indexOf('    function invitationCycle(', start)
  if (start < 0 || end < start) throw Error('Missing distribution seam')
  rules = rules.slice(0,start) + `    function versionedNoticeRequired(uid, planId, index) {
      let occurrence = request.resource.data.invitationOccurrences[uid];
      let path = /databases/$(database)/documents/users/$(uid)/activityInbox/$('jp_' + planId + '_' + string(occurrence));
      return occurrence == index + 1 && !exists(path) && existsAfter(path);
    }
` + rules.slice(end)
  return rules
}
module.exports = { distributed }
