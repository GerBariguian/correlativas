// DIAGNOSTIC ONLY: weakened variants are never deployment candidates.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { initialize, seed, claims, TIME, friendship } = require('./helpers.cjs')
const { doc, writeBatch, serverTimestamp } = require('firebase/firestore')
const original = fs.readFileSync('tests/rules/fixtures/joint-create-pre-distribution.rules', 'utf8')
function body(source, name, replacement) {
  const start = source.indexOf('function ' + name + '(')
  assert.ok(start >= 0, name)
  const open = source.indexOf('{', start)
  let depth = 1, end = open + 1
  for (; depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth-- }
  return source.slice(0, open + 1) + replacement + source.slice(end - 1)
}
const variants = {
  full: s => s,
  noSchema: s => body(s, 'validInstancePlanShape', 'return true;'),
  noPendingBindings: s => body(s, 'pendingBindingAt', 'return true;'),
  noOwnerInstance: s => body(s, 'operationalBinding', 'return true;'),
  noAuthority: s => body(body(s, 'instanceAuthority', 'return true;'), 'socialAuthorityAvailable', 'return true;'),
  noFriendship: s => body(s, 'acceptedPlanningFriend', 'return true;'),
  noNoticeSchema: s => body(s, 'validNotice', 'return true;'),
  noRequiredNotice: s => body(s, 'invitationRequired', 'return true;'),
  noNoticeTransition: s => body(s, 'planInvitation', 'return true;'),
  noLegacyCreate: s => s.replace('allow create: if socialUser() && validPlan()', 'allow create: if false && validPlan()'),
  noArrays: s => s.split('\n').filter(l => !/&& d\.(inviteeIds|memberIds|participants|invitedBy)/.test(l)).join('\n'),
  cachedPendingBinding: s => body(s, 'pendingBindingAt', `
    let b = request.resource.data.participants.get(ids.size() <= index ? '' : ids[index], {});
    return ids.size() <= index || (b.keys().hasAll(['careerInstanceId', 'bindingState'])
      && b.keys().hasOnly(['careerInstanceId', 'bindingState'])
      && b.careerInstanceId == null && b.bindingState == 'unresolved');`),
  bindingHelper: s => body(s, 'pendingBindingAt', `
    return ids.size() <= index || diagnosticPending(request.resource.data.participants[ids[index]]);
  }
  function diagnosticPending(b) {
    return b.keys().hasAll(['careerInstanceId', 'bindingState'])
      && b.keys().hasOnly(['careerInstanceId', 'bindingState'])
      && b.careerInstanceId == null && b.bindingState == 'unresolved';`),
  inviteeHelper: s => body(s, 'validInvitee', `
    return ids.size() <= index || diagnosticInvitee(ids[index]);
  }
  function diagnosticInvitee(id) {
    return id is string && id.matches('^[A-Za-z0-9_-]+$') && invitationRequired(id, planId)
      && request.resource.data.get('invitedBy', {}).get(id, request.auth.uid) == request.auth.uid;`),
  leanCreateShape: s => body(s, 'validInstancePlanShape', `
    let d = request.resource.data;
    return d.keys().hasAll(['schemaVersion', 'catalogId', 'ownerId', 'inviteeIds', 'memberIds', 'participants', 'name', 'invitedBy', 'closed', 'deleting', 'createdAt', 'updatedAt'])
      && d.keys().hasOnly(['schemaVersion', 'catalogId', 'ownerId', 'inviteeIds', 'memberIds', 'participants', 'name', 'invitedBy', 'closed', 'deleting', 'createdAt', 'updatedAt'])
      && d.schemaVersion is int && d.schemaVersion == 2
      && d.catalogId is string && d.catalogId.size() > 0 && d.catalogId.size() <= 100
      && d.ownerId is string && d.ownerId.matches('^[A-Za-z0-9_-]+$')
      && d.inviteeIds is list && d.inviteeIds.size() <= 4
      && d.inviteeIds.toSet().size() == d.inviteeIds.size() && !(d.ownerId in d.inviteeIds)
      && d.participants is map && d.participants.keys().toSet() == d.inviteeIds.toSet().union([d.ownerId].toSet())
      && d.invitedBy is map && d.invitedBy.keys().hasOnly(d.inviteeIds) && d.invitedBy.keys().hasAll(d.inviteeIds)
      && d.name is string && d.name.size() >= 1 && d.name.size() <= 80
      && d.name.matches('.*[^ ].*') && !d.name.matches('.*[\\\\x00-\\\\x1F\\\\x7F].*')
      && d.closed is bool && d.deleting is bool && d.createdAt is timestamp && d.updatedAt == request.time;`),
}
variants.combined = s => variants.leanCreateShape(variants.inviteeHelper(variants.bindingHelper(s)))
variants.createLocal = s => {
  const start = s.indexOf('allow create: if socialUser() && validInstancePlanShape()')
  const end = s.indexOf(';', start)
  assert.ok(start >= 0 && end > start)
  const condition = s.slice(start, end).replace('allow create: if ', '').replaceAll('request.resource.data', 'd')
  return s.slice(0, start) + 'allow create: if diagnosticCreate(request.resource.data);\nfunction diagnosticCreate(d) { return ' + condition + '; }' + s.slice(end + 1)
}
variants.combinedLocal = s => variants.createLocal(variants.combined(s))
async function attempt(env, count, orientation, mutate = () => {}) {
      await env.clearFirestore()
      const ids = ['one', 'two', 'three', 'four'].slice(0, count), entries = {}
      for (const uid of ['owner', ...ids]) entries[`migrationUsers/${uid}`] = { schemaVersion: 1,
        generation: 'multicareer-v1', authority: 'instances', phase: 'complete', origin: 'legacy', manifestId: uid, updatedAt: TIME }
      entries['users/owner/careerInstances/i_owner'] = { schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active', createdAt: TIME, updatedAt: TIME, archivedAt: null }
      for (const [i, uid] of ids.entries()) entries[`friendships/${orientation === 'inverse' || (orientation === 'mixed' && i % 2) ? uid + ':owner' : 'owner:' + uid}`] = friendship('owner', uid)
      const plan = { schemaVersion: 2, ownerId: 'owner', catalogId: 'catalog', inviteeIds: ids, memberIds: ['owner'],
        participants: { owner: { careerInstanceId: 'i_owner', bindingState: 'resolved' }, ...Object.fromEntries(ids.map(uid => [uid, { careerInstanceId: null, bindingState: 'unresolved' }])) },
        name: 'Plan', invitedBy: Object.fromEntries(ids.map(uid => [uid, 'owner'])), closed: false, deleting: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      const notices = Object.fromEntries(ids.map(uid => [uid, { schemaVersion: 1, type: 'JOINT_PLAN_INVITATION', actorUid: 'owner', createdAt: serverTimestamp(), target: { kind: 'jointPlan', id: 'p' }, readAt: null }]))
      mutate({ plan, entries, notices })
      await seed(env, entries)
      const db = env.authenticatedContext('owner', claims('owner')).firestore(), batch = writeBatch(db)
      batch.set(doc(db, 'jointPlans/p'), plan)
      for (const [uid, notice] of Object.entries(notices)) batch.set(doc(db, `users/${uid}/activityInbox/jp_p`), notice)
      let outcome = 'ALLOW'
      try { await batch.commit() } catch (e) { assert.equal(e.code, 'permission-denied'); outcome = 'DENY' }
      return outcome
}
for (const [name, transform] of Object.entries(variants)) test('expression isolation ' + name, async () => {
  const env = await initialize(transform(original))
  try {
    for (const orientation of ['direct', 'inverse', 'mixed']) for (const count of [0, 1, 2, 3, 4]) {
      const outcome = await attempt(env, count, orientation)
      console.log('MATRIX', name, orientation, count, outcome)
      const max = ['noSchema', 'noPendingBindings', 'noRequiredNotice'].includes(name) ? 4
        : ['noArrays', 'bindingHelper', 'leanCreateShape', 'combined', 'combinedLocal'].includes(name) ? 3 : 2
      assert.equal(outcome, count > 0 && count <= max ? 'ALLOW' : 'DENY')
    }
  } finally { await env.cleanup() }
})

const attacks = {
  ownerSpoof: ({ plan }) => { plan.ownerId = 'one' },
  inviteeSpoof: ({ plan }) => { plan.invitedBy.one = 'one' },
  duplicate: ({ plan }) => { plan.inviteeIds.push('one') },
  ownerInvited: ({ plan }) => { plan.inviteeIds.push('owner') },
  noFriend: ({ entries }) => { delete entries['friendships/owner:one'] },
  ownerLegacy: ({ entries }) => { Object.assign(entries['migrationUsers/owner'], { authority: 'legacy', phase: 'pending' }) },
  ownerFrozen: ({ entries }) => { Object.assign(entries['migrationUsers/owner'], { authority: 'frozen', phase: 'copying' }) },
  ownerBlocked: ({ entries }) => { entries['migrationUsers/owner'].phase = 'blocked' },
  ownerInvalid: ({ entries }) => { entries['migrationUsers/owner'].manifestId = 'one' },
  recipientFrozen: ({ entries }) => { Object.assign(entries['migrationUsers/one'], { authority: 'frozen', phase: 'copying' }) },
  recipientBlocked: ({ entries }) => { entries['migrationUsers/one'].phase = 'blocked' },
  recipientInvalid: ({ entries }) => { entries['migrationUsers/one'].schemaVersion = 9 },
  foreignInstance: ({ entries }) => { entries['users/one/careerInstances/i_owner'] = entries['users/owner/careerInstances/i_owner']; delete entries['users/owner/careerInstances/i_owner'] },
  archivedInstance: ({ entries }) => { entries['users/owner/careerInstances/i_owner'].lifecycle = 'archived' },
  catalogMismatch: ({ plan }) => { plan.catalogId = 'another' },
  bindingSpoof: ({ plan }) => { plan.participants.one = { careerInstanceId: 'i_one', bindingState: 'resolved' } },
  ownerBindingSpoof: ({ plan }) => { plan.participants.owner.bindingState = 'unresolved' },
  bindingExtra: ({ plan }) => { plan.participants.one.extra = true },
  bindingMissing: ({ plan }) => { delete plan.participants.one.careerInstanceId },
  noActivity: ({ notices }) => { for (const key of Object.keys(notices)) delete notices[key] },
  partialActivity: ({ notices }) => { delete notices.one },
  spoofActivity: ({ notices }) => { notices.one.actorUid = 'one' },
  wrongTarget: ({ notices }) => { notices.one.target.id = 'other' },
  wrongTimestamp: ({ notices }) => { notices.one.createdAt = TIME },
  schemaExtra: ({ plan }) => { plan.extra = true },
  schemaMissing: ({ plan }) => { delete plan.name },
  invalidMember: ({ plan }) => { plan.memberIds.push('one') },
  duplicateMember: ({ plan }) => { plan.memberIds.push('owner') },
  badName: ({ plan }) => { plan.name = '\u0001' },
  closed: ({ plan }) => { plan.closed = true },
  deleting: ({ plan }) => { plan.deleting = true },
}
for (const name of ['full', 'combinedLocal']) test('same attacks ' + name, async t => {
  const env = await initialize(variants[name](original))
  try {
    for (const [attack, mutate] of Object.entries(attacks)) for (const count of [1, 4]) {
      await t.test(`${attack} / ${count}`, async () => assert.equal(await attempt(env, count, 'direct', mutate), 'DENY'))
    }
    await t.test('legacy recipient is compatible, not academic access', async () => {
      assert.equal(await attempt(env, 1, 'direct', ({ entries }) => {
        Object.assign(entries['migrationUsers/one'], { authority: 'legacy', phase: 'pending' })
      }), 'ALLOW')
    })
  } finally { await env.cleanup() }
})
