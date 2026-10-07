// ISOLATED PROTOTYPE ONLY. Never used by application/deployment configuration.
// Same five-write commit; a mandatory notice validates its recipient's pending
// binding. No persistent certificate and no extra creation state/document.
const assert = require('node:assert/strict')
module.exports = function distributedCreate(source) {
  const pending = `        && pendingBindingAt(request.resource.data.inviteeIds, 0) && pendingBindingAt(request.resource.data.inviteeIds, 1)
        && pendingBindingAt(request.resource.data.inviteeIds, 2) && pendingBindingAt(request.resource.data.inviteeIds, 3)`
  source = source.replaceAll('\r\n', '\n')
  assert.equal(source.split(pending).length, 2, 'Exact pending creation group required')
  source = source.replace(pending, '')
  const seam = '            && acceptedPlanningFriend(uid);'
  assert.equal(source.split(seam).length, 2, 'Exact notice transition seam required')
  source = source.replace(seam, `            && acceptedPlanningFriend(uid)
            && (after.get('schemaVersion', 0) != 2 || exists(path)
              || validCreationRecipient(after));
        }
        function validCreationRecipient(p) {
          let b = p.participants[uid];
          return b.keys().hasAll(['careerInstanceId', 'bindingState'])
            && b.keys().hasOnly(['careerInstanceId', 'bindingState'])
            && b.careerInstanceId == null && b.bindingState == 'unresolved';`)
  return source
}
