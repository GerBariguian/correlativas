// Budget exploration on complete Rules; v2 creation remains unintegrated.
const { before, after, beforeEach, test } = require('node:test')
const { readFileSync } = require('node:fs')
const { doc, writeBatch, serverTimestamp } = require('firebase/firestore')
const { initialize, seed, claims, TIME, friendship, assertSucceeds } = require('./helpers.cjs')
let env
let rules = readFileSync('firestore.rules', 'utf8')
const legacyNotice = 'return legacyAuthority(uid) && legacyAuthority(request.auth.uid)'
if (rules.includes(legacyNotice)) rules = rules.replace(legacyNotice, `return (after.get('schemaVersion', 0) == 2
  ? instanceAuthority(request.auth.uid) && (legacyAuthority(uid) || instanceAuthority(uid))
  : legacyAuthority(uid) && legacyAuthority(request.auth.uid))`)
else if (!rules.includes('instanceAuthority(request.auth.uid) && socialAuthorityAvailable(uid)')) throw Error('Notice seam changed')
// Keep this reduced diagnostic distinct from the full-schema integration test.
const integrated = rules.indexOf('      allow create: if socialUser() && validInstancePlanShape()')
if (integrated >= 0) {
  const legacy = rules.indexOf('      allow create: if socialUser() && validPlan()', integrated)
  if (legacy < integrated) throw Error('Create variant seam changed')
  rules = rules.slice(0, integrated) + rules.slice(legacy)
}
const seam = '      // The required notice validates both actor and recipient authority.'
if (!rules.includes(seam)) throw Error('Create seam changed')
rules = rules.replace(seam, `
      // Isolated candidate: same source + notices protocol, no subjectChecks.
      allow create: if socialUser() && request.resource.data.schemaVersion == 2
        && request.resource.data.ownerId == request.auth.uid
        && request.resource.data.memberIds == [request.auth.uid]
        && request.resource.data.inviteeIds.size() >= 1 && request.resource.data.inviteeIds.size() <= 4
        && request.resource.data.inviteeIds.toSet().size() == request.resource.data.inviteeIds.size()
        && !(request.auth.uid in request.resource.data.inviteeIds)
        && request.resource.data.closed == false && request.resource.data.deleting == false
        && request.resource.data.createdAt == request.time && request.resource.data.updatedAt == request.time
        && operationalBinding(request.resource.data, request.auth.uid)
        && !exists(/databases/$(database)/documents/jointPlanTombstones/$(planId))
        && validInvitee(request.resource.data.inviteeIds, 0) && validInvitee(request.resource.data.inviteeIds, 1)
        && validInvitee(request.resource.data.inviteeIds, 2) && validInvitee(request.resource.data.inviteeIds, 3);
${seam}`)
before(async () => { env = await initialize(rules) }, { timeout: 30000 })
after(async () => { if (env) await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })
for (const count of [1, 3, 4]) for (const reverse of [false, true]) test(`candidate create ${count} invitees, reverse=${reverse}`, async () => {
  const ids = ['one', 'two', 'three', 'four'].slice(0, count), entries = {}
  for (const uid of ['owner', ...ids]) entries[`migrationUsers/${uid}`] = { schemaVersion: 1,
    generation: 'multicareer-v1', authority: 'instances', phase: 'complete', origin: 'legacy', manifestId: uid, updatedAt: TIME }
  entries['users/owner/careerInstances/i_owner'] = { schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active',
    createdAt: TIME, updatedAt: TIME, archivedAt: null }
  entries['users/owner/catalogMemberships/catalog'] = { schemaVersion: 1, careerInstanceId: 'i_owner' }
  for (const uid of ids) entries[`friendships/${reverse ? uid + ':owner' : 'owner:' + uid}`] = friendship('owner', uid)
  await seed(env, entries)
  const c = env.authenticatedContext('owner', claims('owner')).firestore(), b = writeBatch(c)
  b.set(doc(c, 'jointPlans/p'), { schemaVersion: 2, ownerId: 'owner', catalogId: 'catalog', inviteeIds: ids,
    memberIds: ['owner'], participants: { owner: { careerInstanceId: 'i_owner', bindingState: 'resolved' },
      ...Object.fromEntries(ids.map(uid => [uid, { careerInstanceId: null, bindingState: 'unresolved' }])) },
    name: 'Plan', invitedBy: Object.fromEntries(ids.map(uid => [uid, 'owner'])), closed: false, deleting: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  for (const uid of ids) b.set(doc(c, `users/${uid}/activityInbox/jp_p`), { schemaVersion: 1,
    type: 'JOINT_PLAN_INVITATION', actorUid: 'owner', createdAt: serverTimestamp(), target: { kind: 'jointPlan', id: 'p' }, readAt: null })
  await assertSucceeds(b.commit())
})
