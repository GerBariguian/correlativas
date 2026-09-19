// These are SDK requests to the real emulator, never an authorization mock.
const { before, after, beforeEach, describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { doc, collection, collectionGroup, query, where, documentId, getDocFromServer, getDocsFromServer,
  setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } = require('firebase/firestore')
const { initialize, claims, email, CAREER, TIME, profile, friendship, plan, subject, sharing, snapshot,
  seed, baseline, publish, assertSucceeds: allow, assertFails: deny } = require('./helpers.cjs')
let env
before(async () => { env = await initialize() }, { timeout: 30000 })
after(async () => { if (env) await env.cleanup() })
beforeEach(async () => { await baseline(env) })
const db = (uid = 'german', overrides) => uid === null ? env.unauthenticatedContext().firestore()
  : env.authenticatedContext(uid, claims(uid, overrides)).firestore()
const read = (client, path) => getDocFromServer(doc(client, path))
const put = (client, path, value) => setDoc(doc(client, path), value)
const change = (client, path, value) => updateDoc(doc(client, path), { ...value, updatedAt: serverTimestamp() })
const remove = (client, path) => deleteDoc(doc(client, path))
const list = (client, path, ...filters) => getDocsFromServer(query(collection(client, path), ...filters))
const snapPath = uid => `planningSnapshots/${uid}/careers/${CAREER}`
function finalize(client, id, tombstone = { deletedAt: serverTimestamp() }) {
  const batch = writeBatch(client)
  batch.set(doc(client, `jointPlanTombstones/${id}`), tombstone)
  batch.delete(doc(client, `jointPlans/${id}`))
  return batch.commit()
}
async function planFixture(patch = {}) {
  await seed(env, { 'jointPlans/p': { ...plan(), ...patch }, 'jointPlans/p/subjects/A': subject(),
    'friendships/german:juan': friendship('german', 'juan'),
    'friendships/juan:maria': friendship('juan', 'maria') })
}
async function sharedFixture(uid = 'juan', patch = {}) {
  await seed(env, { [`planningSharing/${uid}`]: sharing(), [snapPath(uid)]: snapshot(),
    'friendships/german:juan': friendship('german', 'juan'), ...patch })
}

describe('Private progress: owner isolation', () => {
  test('ALLOW owner profile read, progress write and statusMap read', async () => {
    const client = db()
    await allow(read(client, 'users/german'))
    await allow(put(client, `users/german/careers/${CAREER}`, { statusMap: { A: 'Aprobada' }, updatedAt: serverTimestamp() }))
    assert.deepEqual((await allow(read(client, `users/german/careers/${CAREER}`))).data().statusMap, { A: 'Aprobada' })
  })
  for (const relationship of ['none', 'accepted friendship', 'same plan']) {
    test(`DENY all private cross-user operations with ${relationship}`, async () => {
      if (relationship === 'accepted friendship') await seed(env, { 'friendships/german:juan': friendship('german', 'juan') })
      if (relationship === 'same plan') await planFixture()
      const client = db(), path = `users/juan/careers/${CAREER}`
      await deny(read(client, 'users/juan'))
      await deny(change(client, 'users/juan', { activeCareerId: 'other' }))
      await deny(read(client, path))
      await deny(change(client, path, { statusMap: {} }))
      await deny(remove(client, path))
      await deny(put(client, 'users/juan/careers/new', { statusMap: {} }))
    })
  }
  test('DENY unauthenticated private reads and writes', async () => {
    await deny(read(db(null), 'users/german'))
    await deny(put(db(null), `users/german/careers/${CAREER}`, { statusMap: {} }))
  })
  test('CURRENT POLICY: private owner access needs authentication, not Google or verified email', async () => {
    for (const override of [{ email_verified: false }, { firebase: { sign_in_provider: 'password' } }]) {
      await allow(read(db('german', override), 'users/german'))
      await allow(change(db('german', override), `users/german/careers/${CAREER}`, { statusMap: {} }))
    }
  })
})

describe('Social profiles', () => {
  test('ALLOW owner create/update and social get by known UID', async () => {
    await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'socialProfiles/german')))
    const client = db()
    await allow(put(client, 'socialProfiles/german', { ...profile('german'), updatedAt: serverTimestamp() }))
    await allow(change(client, 'socialProfiles/german', { name: 'German de prueba' }))
    assert.equal((await allow(read(db('outsider'), 'socialProfiles/german'))).data().name, 'German de prueba')
  })
  for (const [name, patch] of Object.entries({ email: { email: 'private@example.test' }, statusMap: { statusMap: {} }, extra: { admin: true }, uid: { uid: 'juan' }, career: { careerId: 'other' } })) {
    test(`DENY profile invalid ${name}`, async () => {
      await deny(put(db(), 'socialProfiles/german', { ...profile('german'), ...patch, updatedAt: serverTimestamp() }))
    })
  }
  test('DENY foreign write, collection list and delete (including owner)', async () => {
    await deny(change(db(), 'socialProfiles/juan', { name: 'Fake' }))
    await deny(list(db(), 'socialProfiles'))
    await deny(remove(db(), 'socialProfiles/german'))
  })
  test('Legacy email: ALLOW owner read/migration; DENY third-party read before migration', async () => {
    await seed(env, { 'socialProfiles/german': { ...profile('german'), email: email('german') } })
    await allow(read(db(), 'socialProfiles/german'))
    await deny(read(db('juan'), 'socialProfiles/german'))
    await allow(put(db(), 'socialProfiles/german', { ...profile('german'), updatedAt: serverTimestamp() }))
    assert.equal('email' in (await allow(read(db('juan'), 'socialProfiles/german'))).data(), false)
  })
})

describe('Social authentication claims across collections', () => {
  for (const [name, uid, overrides] of [
    ['anonymous', null, {}], ['unverified', 'german', { email_verified: false }],
    ['non-Google', 'german', { firebase: { sign_in_provider: 'password' } }],
  ]) {
    test(`DENY ${name} social reads and mutations`, async () => {
      await planFixture(); await sharedFixture('german')
      const client = db(uid, overrides)
      for (const path of ['socialProfiles/german', `socialEmails/${email('german')}`, 'friendships/german:juan',
        'planningSharing/german', snapPath('german'), 'jointPlans/p', 'jointPlans/p/subjects/A']) await deny(read(client, path))
      await deny(change(client, 'socialProfiles/german', { name: 'Other' }))
      await deny(put(client, `socialEmails/${email('german')}`, { uid: 'german' }))
      await deny(put(client, 'friendships/german:pedro', { ...friendship('german', 'pedro', 'pending'), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
      await deny(change(client, 'planningSharing/german', { enabled: false }))
      await deny(put(client, snapPath('german'), { ...snapshot(), updatedAt: serverTimestamp() }))
      await deny(change(client, 'jointPlans/p', { name: 'Renamed' }))
      await deny(remove(client, 'jointPlans/p/subjects/A'))
    })
  }
})

describe('Social email exact index', () => {
  test('ALLOW exact lookup and owner atomic index creation with private pointer', async () => {
    assert.equal((await allow(read(db(), `socialEmails/${email('juan')}`))).data().uid, 'juan')
    const client = db('newuser'), batch = writeBatch(client)
    batch.set(doc(client, 'users/newuser'), { activeCareerId: CAREER, socialEmail: email('newuser') })
    batch.set(doc(client, `socialEmails/${email('newuser')}`), { uid: 'newuser' })
    await allow(batch.commit())
    await allow(read(db(), `socialEmails/${email('newuser')}`))
  })
  test('DENY list, exact collection query and prefix/range queries', async () => {
    const client = db()
    await deny(list(client, 'socialEmails'))
    await deny(list(client, 'socialEmails', where(documentId(), '==', email('juan'))))
    await deny(list(client, 'socialEmails', where(documentId(), '>=', 'j'), where(documentId(), '<', 'k')))
  })
  test('DENY arbitrary email, arbitrary UID, extra fields, takeover and foreign delete', async () => {
    const client = db()
    await deny(put(client, 'socialEmails/arbitrary@example.test', { uid: 'german' }))
    await deny(put(client, `socialEmails/${email('german')}`, { uid: 'juan' }))
    await deny(put(client, `socialEmails/${email('german')}`, { uid: 'german', extra: true }))
    await deny(put(client, `socialEmails/${email('juan')}`, { uid: 'german' }))
    await deny(remove(client, `socialEmails/${email('juan')}`))
    await deny(remove(client, `socialEmails/${email('german')}`))
  })
  test('ALLOW atomic email migration; DENY dangling old pointer/index and stale third-party lookup', async () => {
    const nextEmail = 'new-german@example.test', client = db('german', { email: nextEmail })
    await deny(change(client, 'users/german', { socialEmail: nextEmail }))
    const batch = writeBatch(client)
    batch.update(doc(client, 'users/german'), { socialEmail: nextEmail })
    batch.set(doc(client, `socialEmails/${nextEmail}`), { uid: 'german' })
    batch.delete(doc(client, `socialEmails/${email('german')}`))
    await allow(batch.commit())
    assert.equal((await allow(read(db('juan'), `socialEmails/${nextEmail}`))).data().uid, 'german')
    await seed(env, { [`socialEmails/${email('german')}`]: { uid: 'german' } })
    await deny(read(db('juan'), `socialEmails/${email('german')}`))
    await allow(read(client, `socialEmails/${email('german')}`))
  })
})

describe('Friendships', () => {
  const request = (patch = {}) => ({ ...friendship('german', 'juan', 'pending'), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...patch })
  for (const status of ['accepted', 'rejected']) {
    test(`ALLOW sender pending and recipient ${status}; participants query/read`, async () => {
      await allow(put(db(), 'friendships/german:juan', request()))
      await allow(change(db('juan'), 'friendships/german:juan', { status }))
      assert.equal((await allow(read(db(), 'friendships/german:juan'))).data().status, status)
      await allow(read(db('juan'), 'friendships/german:juan'))
      assert.equal((await allow(list(db(), 'friendships', where('participants', 'array-contains', 'german')))).size, 1)
    })
  }
  for (const [name, patch, path] of [
    ['accepted creation', { status: 'accepted' }], ['forged sender', { senderId: 'pedro' }],
    ['inconsistent recipient', { recipientId: 'pedro' }], ['self request', { recipientId: 'german' }],
    ['extra participant', { participants: ['german', 'juan', 'pedro'] }],
    ['inconsistent ID', {}, 'friendships/german:pedro'], ['extra field', { extra: true }],
  ]) test(`DENY ${name}`, async () => { await deny(put(db(), path || 'friendships/german:juan', request(patch))) })
  test('DENY response by sender/outsider, changing participants and response extras', async () => {
    await allow(put(db(), 'friendships/german:juan', request()))
    await deny(change(db(), 'friendships/german:juan', { status: 'accepted' }))
    await deny(change(db('pedro'), 'friendships/german:juan', { status: 'accepted' }))
    await deny(change(db('juan'), 'friendships/german:juan', { status: 'accepted', participants: ['juan', 'pedro'] }))
    await deny(change(db('juan'), 'friendships/german:juan', { status: 'accepted', extra: true }))
  })
  test('DENY inverse documents in same atomic batch or after existing reverse', async () => {
    const client = db(), batch = writeBatch(client)
    batch.set(doc(client, 'friendships/german:juan'), request())
    batch.set(doc(client, 'friendships/juan:german'), request({ participants: ['juan', 'german'] }))
    await deny(batch.commit())
    await allow(put(client, 'friendships/juan:german', request({ participants: ['juan', 'german'] })))
    await deny(put(client, 'friendships/german:juan', request()))
  })
  test('DENY outsider get, global list and query for another participant', async () => {
    await allow(put(db(), 'friendships/german:juan', request()))
    await deny(read(db('outsider'), 'friendships/german:juan'))
    await deny(list(db(), 'friendships'))
    await deny(list(db(), 'friendships', where('participants', 'array-contains', 'juan')))
  })
})

describe('Planning consent and snapshots', () => {
  for (const version of [1, 2]) {
    test(`ALLOW atomic consent/snapshot v${version}, owner read, direct friend read and disable`, async () => {
      await seed(env, { 'friendships/german:juan': friendship('german', 'juan') })
      await allow(publish(db('juan'), 'juan', version))
      await allow(read(db('juan'), snapPath('juan')))
      const data = (await allow(read(db(), snapPath('juan')))).data()
      assert.equal('pendingFinalCodes' in data, version === 2)
      await allow(change(db('juan'), 'planningSharing/juan', { enabled: false }))
      // A new client and server read avoid a previously cached authorized document.
      await deny(read(db(), snapPath('juan')))
      await allow(read(db('juan'), snapPath('juan')))
    })
  }
  test('ALLOW own disabled consent without snapshot; DENY enabling without snapshot', async () => {
    await allow(put(db(), 'planningSharing/german', { ...sharing(2, false), updatedAt: serverTimestamp() }))
    await deny(change(db(), 'planningSharing/german', { enabled: true }))
  })
  test('DENY foreign consent/publication, top-level statusMap and extras', async () => {
    await sharedFixture()
    await deny(change(db(), 'planningSharing/juan', { enabled: false }))
    await deny(put(db(), snapPath('juan'), { ...snapshot(), updatedAt: serverTimestamp() }))
    for (const patch of [{ statusMap: {} }, { extra: true }, { approvedCodes: 'A' }, { approvedCodes: ['A', 'A'] }, { availableToCourseCodes: ['A'] }]) {
      await deny(put(db('juan'), snapPath('juan'), { ...snapshot(), ...patch, updatedAt: serverTimestamp() }))
    }
  })
  for (const status of ['none', 'pending', 'rejected']) {
    test(`DENY snapshot with friendship ${status}`, async () => {
      await seed(env, { 'planningSharing/juan': sharing(), [snapPath('juan')]: snapshot(),
        ...(status === 'none' ? {} : { 'friendships/german:juan': friendship('german', 'juan', status) }) })
      await deny(read(db(), snapPath('juan')))
    })
  }
  for (const [name, patch] of [
    ['disabled', { 'planningSharing/juan': sharing(2, false) }],
    ['different reader career', { 'users/german': { activeCareerId: 'other' } }],
    ['different shared career', { 'planningSharing/juan': { ...sharing(), sharedCareerId: 'other' } }],
    ['stale snapshot', { [snapPath('juan')]: { ...snapshot(), sourceUpdatedAt: Timestamp.fromMillis(1) } }],
    ['v2 under v1 consent', { 'planningSharing/juan': sharing(1) }],
  ]) test(`DENY ${name}`, async () => { await sharedFixture('juan', patch); await deny(read(db(), snapPath('juan'))) })
  test('DENY publish v2 with legacy consent and v1 with finals; ALLOW v1 with v2 consent', async () => {
    await sharedFixture('juan', { 'planningSharing/juan': sharing(1) })
    await deny(put(db('juan'), snapPath('juan'), { ...snapshot(2), updatedAt: serverTimestamp() }))
    await deny(put(db('juan'), snapPath('juan'), { ...snapshot(1), pendingFinalCodes: ['C'], updatedAt: serverTimestamp() }))
    await allow(publish(db('juan'), 'juan', 2))
    await allow(put(db('juan'), snapPath('juan'), { ...snapshot(1), updatedAt: serverTimestamp() }))
    await allow(read(db(), snapPath('juan')))
  })
  test('DENY publication without consent and mismatched source time', async () => {
    await deny(put(db(), snapPath('german'), { ...snapshot(), updatedAt: serverTimestamp() }))
    await allow(publish(db(), 'german'))
    await deny(put(db(), snapPath('german'), { ...snapshot(), sourceUpdatedAt: Timestamp.fromMillis(1), updatedAt: serverTimestamp() }))
  })
  test('PERMANENT REGRESSION: German-Juan-Pedro friendship and same plan do not grant transitive academic access', async () => {
    await seed(env, { 'friendships/german:juan': friendship('german', 'juan'),
      'friendships/juan:pedro': friendship('juan', 'pedro'),
      'jointPlans/p': plan('juan', ['german', 'pedro'], ['juan', 'german', 'pedro']),
      'planningSharing/pedro': sharing(), [snapPath('pedro')]: snapshot() })
    await allow(read(db(), 'jointPlans/p'))
    await allow(read(db('juan'), snapPath('pedro')))
    await deny(read(db(), snapPath('pedro')))
    await deny(read(db(), 'planningSharing/pedro'))
    await deny(read(db(), `users/pedro/careers/${CAREER}`))
  })
  test('DENY academic access solely through plan, even when sharing is on', async () => {
    await seed(env, { 'jointPlans/p': plan(), 'planningSharing/juan': sharing(), [snapPath('juan')]: snapshot() })
    await allow(read(db(), 'jointPlans/p'))
    await deny(read(db(), snapPath('juan')))
  })
  test('DENY snapshot access after administrative friendship revocation (no client revocation currently exists)', async () => {
    await sharedFixture(); await allow(read(db(), snapPath('juan')))
    await seed(env, { 'friendships/german:juan': friendship('german', 'juan', 'rejected') })
    await deny(read(db(), snapPath('juan')))
  })
  test('DENY sharing/snapshot collection lists; ALLOW owner snapshot deletion', async () => {
    await sharedFixture()
    await deny(list(db('juan'), 'planningSharing'))
    await deny(list(db('juan'), 'planningSnapshots/juan/careers'))
    await allow(remove(db('juan'), snapPath('juan')))
    await deny(remove(db('juan'), 'planningSharing/juan'))
  })
})

describe('Snapshot code structure', () => {
  for (const version of [1, 2]) {
    const fields = ['approvedCodes', 'availableToCourseCodes', ...(version === 2 ? ['pendingFinalCodes'] : [])]
    for (const field of fields) {
      test(`ALLOW v${version} ${field}: empty, grammar boundaries, non-catalog and 1000 codes`, async () => {
        for (const codes of [[], ['a', 'Z', '0', '.', '-', '_', 'Az09._-', 'X'.repeat(32), 'NOT-A-REAL-CODE'],
          Array.from({ length: 1000 }, (_, i) => `CODE-${i}`)]) {
          await allow(publish(db(), 'german', version, { [field]: codes }))
        }
      })
      test(`DENY v${version} ${field}: invalid types, characters, lengths, duplicates and overflow`, async () => {
        for (const value of [null, true, 123, 1.5, {}, { statusMap: { PRIVATE: true } }, Timestamp.fromMillis(1),
          doc(db(), 'users/german'), '', 'X'.repeat(33), 'A B', ' A', 'A ', 'á', 'Ａ', 'A/B', 'A\\B',
          'A|B', 'A\n', 'A\r', 'A\t', 'A\0', 'A:B', 'A+B']) {
          await deny(publish(db(), 'german', version, { [field]: ['VALID', value] }))
        }
        for (const codes of ['A', {}, null, ['DUP', 'DUP'], Array.from({ length: 1001 }, (_, i) => `CODE-${i}`)]) {
          await deny(publish(db(), 'german', version, { [field]: codes }))
        }
        // Updates and invalid elements at the end of a full list must also be checked.
        await allow(publish(db(), 'german', version))
        await deny(change(db(), snapPath('german'), { [field]: [...Array.from({ length: 999 }, (_, i) => `C-${i}`), 123] }))
      })
    }
    test(`DENY v${version} all applicable pairwise intersections`, async () => {
      for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) {
        await deny(publish(db(), 'german', version, { [fields[i]]: ['SAME'], [fields[j]]: ['SAME'] }))
      }
    })
    test(`ALLOW v${version} all arrays at maximum size and code length`, async () => {
      const patch = Object.fromEntries(fields.map((field, index) => [field,
        Array.from({ length: 1000 }, (_, i) => `${index}-${i}`.padEnd(32, 'X'))]))
      await allow(publish(db(), 'german', version, patch))
    })
  }
})

describe('Plan ID tombstones', () => {
  test('DENY reservation without existing locked own plan and atomic parent deletion', async () => {
    await deny(put(db(), 'jointPlanTombstones/p', { deletedAt: serverTimestamp() }))
    await deny(finalize(db(), 'p'))
    for (const patch of [{}, { closed: true }, { closed: true, deleting: true }]) {
      await planFixture(patch)
      await deny(put(db(), 'jointPlanTombstones/p', { deletedAt: serverTimestamp() }))
      if (!patch.deleting) await deny(finalize(db(), 'p'))
    }
    for (const client of [db('juan'), db('outsider'), db(null), db('german', { email_verified: false }),
      db('german', { firebase: { sign_in_provider: 'password' } })]) await deny(finalize(client, 'p'))
    for (const tombstone of [{}, { deletedAt: TIME }, { deletedAt: serverTimestamp(), ownerId: 'german' }]) {
      await deny(finalize(db(), 'p', tombstone))
    }
    assert.equal((await allow(read(db(), 'jointPlans/p'))).exists(), true)
    await allow(finalize(db(), 'p'))
    await env.withSecurityRulesDisabled(async ctx => {
      assert.equal((await read(ctx.firestore(), 'jointPlans/p')).exists(), false)
      const data = (await read(ctx.firestore(), 'jointPlanTombstones/p')).data()
      assert.deepEqual(Object.keys(data), ['deletedAt'])
      assert.ok(data.deletedAt instanceof Timestamp)
    })
    for (const client of [db(), db('juan'), db('outsider'), db(null)]) {
      await deny(read(client, 'jointPlanTombstones/p'))
      await deny(list(client, 'jointPlanTombstones'))
      await deny(put(client, 'jointPlanTombstones/p', { deletedAt: serverTimestamp() }))
      await deny(remove(client, 'jointPlanTombstones/p'))
    }
    const client = db(), batch = writeBatch(client)
    batch.delete(doc(client, 'jointPlanTombstones/p'))
    batch.set(doc(client, 'jointPlans/p'), { ...plan('german', ['juan'], ['german']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    await deny(batch.commit())
  })
})

describe('Joint plans and roles', () => {
  beforeEach(async () => { await planFixture() })
  test('DENY sixth participant and duplicate invitations; ALLOW five participants at creation', async () => {
    await seed(env, Object.fromEntries(['pedro', 'maria', 'outsider'].map(uid => [`friendships/german:${uid}`, friendship('german', uid)])))
    const invitees = ['juan', 'pedro', 'maria', 'outsider']
    await allow(put(db(), 'jointPlans/five', { ...plan('german', invitees, ['german']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await deny(put(db(), 'jointPlans/six', { ...plan('german', [...invitees, 'sixth'], ['german']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await deny(put(db(), 'jointPlans/duplicate', { ...plan('german', ['juan', 'juan'], ['german']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })
  test('ALLOW creator/member/pending metadata; DENY outsider', async () => {
    for (const uid of ['german', 'juan', 'pedro']) await allow(read(db(uid), 'jointPlans/p'))
    await deny(read(db('outsider'), 'jointPlans/p'))
  })
  test('ALLOW new plan with only owner accepted and direct friends invited', async () => {
    await allow(put(db(), 'jointPlans/new', { ...plan('german', ['juan'], ['german']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })
  test('DENY new plan with arbitrary invitee, forged owner or preaccepted member', async () => {
    for (const patch of [{ inviteeIds: ['outsider'], invitedBy: { outsider: 'german' } }, { ownerId: 'juan' }, { memberIds: ['german', 'juan'] }]) {
      await deny(put(db(), 'jointPlans/new', { ...plan('german', ['juan'], ['german']), ...patch, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    }
  })
  test('ALLOW creator and accepted member rename open plan', async () => {
    for (const uid of ['german', 'juan']) await allow(change(db(uid), 'jointPlans/p', { name: 'Plan nuevo' }))
  })
  test('DENY pending/outsider rename, invite and self escalation', async () => {
    for (const uid of ['pedro', 'outsider']) {
      await deny(change(db(uid), 'jointPlans/p', { name: 'Plan nuevo' }))
      await deny(change(db(uid), 'jointPlans/p', { inviteeIds: ['juan', 'pedro', 'maria'], invitedBy: { juan: 'german', pedro: 'german', maria: uid } }))
    }
    await deny(change(db('outsider'), 'jointPlans/p', { memberIds: ['german', 'juan', 'outsider'], inviteeIds: ['juan', 'pedro', 'outsider'] }))
  })
  test('ALLOW member invites their own friend, unrelated to creator', async () => {
    await allow(change(db('juan'), 'jointPlans/p', { inviteeIds: ['juan', 'pedro', 'maria'], invitedBy: { juan: 'german', pedro: 'german', maria: 'juan' } }))
    await allow(read(db('maria'), 'jointPlans/p'))
    await deny(read(db('maria'), 'jointPlans/p/subjects/A'))
  })
  for (const [name, patch] of [
    ['ownerId', { ownerId: 'juan' }], ['careerId', { careerId: 'other' }],
    ['accept another person', { memberIds: ['german', 'juan', 'pedro'] }],
    ['forged historical invitedBy', { invitedBy: { juan: 'juan', pedro: 'juan' } }],
    ['extra field', { admin: true }],
    ['invite nonfriend', { inviteeIds: ['juan', 'pedro', 'outsider'], invitedBy: { juan: 'german', pedro: 'german', outsider: 'juan' } }],
    ['forged new inviter', { inviteeIds: ['juan', 'pedro', 'maria'], invitedBy: { juan: 'german', pedro: 'german', maria: 'german' } }],
  ]) test(`DENY member changes ${name}`, async () => { await deny(change(db('juan'), 'jointPlans/p', patch)) })
  test('ALLOW pending accepts only self; DENY incompatible career', async () => {
    await seed(env, { 'users/pedro': { activeCareerId: 'other' } })
    await deny(change(db('pedro'), 'jointPlans/p', { memberIds: ['german', 'juan', 'pedro'] }))
    await seed(env, { 'users/pedro': { activeCareerId: CAREER } })
    await allow(change(db('pedro'), 'jointPlans/p', { memberIds: ['german', 'juan', 'pedro'] }))
    await allow(read(db('pedro'), 'jointPlans/p/subjects/A'))
  })
  test('ALLOW pending rejects and member leaves; revoke metadata/subject access', async () => {
    await allow(change(db('pedro'), 'jointPlans/p', { inviteeIds: ['juan'], memberIds: ['german', 'juan'], invitedBy: { juan: 'german' } }))
    await deny(read(db('pedro'), 'jointPlans/p'))
    await allow(change(db('juan'), 'jointPlans/p', { inviteeIds: [], memberIds: ['german'], invitedBy: {} }))
    await deny(read(db('juan'), 'jointPlans/p')); await deny(read(db('juan'), 'jointPlans/p/subjects/A'))
  })
  test('ALLOW owner closes; DENY member close, all reopen/edits and pending join', async () => {
    await deny(change(db('juan'), 'jointPlans/p', { closed: true }))
    await allow(change(db(), 'jointPlans/p', { closed: true }))
    for (const uid of ['german', 'juan']) {
      await allow(read(db(uid), 'jointPlans/p/subjects/A'))
      await deny(change(db(uid), 'jointPlans/p', { closed: false }))
      await deny(change(db(uid), 'jointPlans/p', { name: 'Plan nuevo' }))
      await deny(change(db(uid), 'jointPlans/p/subjects/A', { proposedParticipantIds: ['german', 'pedro'] }))
      await deny(remove(db(uid), 'jointPlans/p/subjects/A'))
    }
    await deny(change(db('pedro'), 'jointPlans/p', { memberIds: ['german', 'juan', 'pedro'] }))
    await allow(change(db('pedro'), 'jointPlans/p', { inviteeIds: ['juan'], invitedBy: { juan: 'german' } }))
  })
  test('ALLOW owner deletion lifecycle; DENY premature or nonowner deletion and reopening lock', async () => {
    await deny(remove(db(), 'jointPlans/p'))
    await deny(change(db(), 'jointPlans/p', { deleting: true }))
    await allow(change(db(), 'jointPlans/p', { closed: true }))
    await deny(remove(db(), 'jointPlans/p'))
    await deny(change(db('juan'), 'jointPlans/p', { deleting: true }))
    await allow(change(db(), 'jointPlans/p', { deleting: true }))
    await deny(change(db(), 'jointPlans/p', { deleting: false }))
    await deny(remove(db('juan'), 'jointPlans/p'))
    await deny(read(db('juan'), 'jointPlans/p/subjects/A'))
    await allow(list(db(), 'jointPlans/p/subjects'))
    await allow(remove(db(), 'jointPlans/p/subjects/A'))
    await deny(remove(db(), 'jointPlans/p'))
    await allow(finalize(db(), 'p'))
  })
  test('ALLOW scoped owner/invitee queries; DENY global and incorrectly scoped queries', async () => {
    assert.equal((await allow(list(db(), 'jointPlans', where('ownerId', '==', 'german')))).size, 1)
    for (const uid of ['juan', 'pedro']) assert.equal((await allow(list(db(uid), 'jointPlans', where('inviteeIds', 'array-contains', uid)))).size, 1)
    await deny(list(db(), 'jointPlans'))
    await deny(list(db('juan'), 'jointPlans', where('ownerId', '==', 'german')))
    await deny(list(db(), 'jointPlans', where('careerId', '==', CAREER)))
  })
})

describe('Plan subjects', () => {
  beforeEach(async () => { await planFixture() })
  test('ALLOW member create/update/delete with immutable attribution and accepted member list', async () => {
    const client = db('juan')
    await allow(put(client, 'jointPlans/p/subjects/B', { ...subject('B', 'juan'), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    const before = (await allow(read(client, 'jointPlans/p/subjects/B'))).data()
    await allow(change(db(), 'jointPlans/p/subjects/B', { proposedParticipantIds: ['german', 'pedro'] }))
    const after = (await allow(read(client, 'jointPlans/p/subjects/B'))).data()
    assert.equal(after.addedByUid, 'juan'); assert.ok(after.createdAt.isEqual(before.createdAt))
    assert.equal((await allow(list(client, 'jointPlans/p/subjects'))).size, 2)
    await allow(remove(client, 'jointPlans/p/subjects/B'))
  })
  for (const uid of ['pedro', 'outsider']) test(`DENY ${uid} subject read/list/create/update/delete`, async () => {
    const client = db(uid)
    await deny(read(client, 'jointPlans/p/subjects/A')); await deny(list(client, 'jointPlans/p/subjects'))
    await deny(put(client, 'jointPlans/p/subjects/B', { ...subject('B', uid), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await deny(change(client, 'jointPlans/p/subjects/A', { proposedParticipantIds: ['german', 'pedro'] }))
    await deny(remove(client, 'jointPlans/p/subjects/A'))
  })
  for (const [name, patch] of [
    ['forged author', { addedByUid: 'juan' }], ['extra field', { statusMap: {} }],
    ['foreign participant', { proposedParticipantIds: ['german', 'outsider'] }],
    ['duplicate participant', { proposedParticipantIds: ['german', 'german'] }],
    ['wrong code', { code: 'OTHER' }],
  ]) test(`DENY new subject ${name}`, async () => {
    await deny(put(db(), 'jointPlans/p/subjects/B', { ...subject('B'), ...patch, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })
  test('DENY changing original author or creation timestamp', async () => {
    await deny(change(db('juan'), 'jointPlans/p/subjects/A', { addedByUid: 'juan' }))
    await deny(change(db('juan'), 'jointPlans/p/subjects/A', { createdAt: serverTimestamp() }))
  })
})

describe('Default deny and collection-group queries', () => {
  for (const path of ['unknown/x', 'users/german/unknown/x', 'planningSnapshots/german', 'jointPlans/p/unknown/x']) {
    test(`DENY read/write/list outside allowed paths: ${path}`, async () => {
      await seed(env, { [path]: { value: true } })
      const client = db()
      await deny(read(client, path)); await deny(put(client, path, { value: false }))
      await deny(remove(client, path)); await deny(list(client, path.split('/').slice(0, -1).join('/')))
    })
  }
  for (const group of ['careers', 'subjects']) test(`DENY global collectionGroup(${group})`, async () => {
    await planFixture(); await sharedFixture()
    await deny(getDocsFromServer(collectionGroup(db(), group)))
  })
})

describe('KNOWN SECURITY GAPS — assertions describe CURRENT OBSERVED BEHAVIOR, not desired policy', () => {
  test('H1 EXPECTED: user can revoke friendship; CURRENT: accepted friendship update/delete DENIED', async () => {
    await seed(env, { 'friendships/german:juan': friendship('german', 'juan') })
    for (const uid of ['german', 'juan']) {
      await deny(change(db(uid), 'friendships/german:juan', { status: 'rejected' }))
      await deny(remove(db(uid), 'friendships/german:juan'))
    }
  })
  test('H3 EXPECTED: bounded discovery; CURRENT: repeated exact candidate email GETs ALLOWED', async () => {
    const client = db('outsider')
    for (const uid of ['german', 'juan', 'pedro', 'maria']) {
      assert.equal((await allow(read(client, `socialEmails/${email(uid)}`))).data().uid, uid)
    }
    assert.equal((await allow(read(client, 'socialEmails/nobody@example.test'))).exists(), false)
  })
})

describe('Closed security gaps: snapshot structure and plan ID reuse', () => {
  for (const [name, patch] of [
    ['object in approvedCodes', { approvedCodes: [{ statusMap: { PRIVATE: 'Cursando' } }] }],
    ['non-catalog values in availableToCourseCodes', { availableToCourseCodes: ['NOT-A-REAL-CODE', 123] }],
    ['object in pendingFinalCodes', { pendingFinalCodes: [{ privateNote: 'synthetic only' }] }],
  ]) test(`H6 REGRESSION DENY: ${name}`, async () => {
    await seed(env, { 'friendships/german:juan': friendship('german', 'juan') })
    await deny(publish(db('juan'), 'juan', 2, patch))
  })
  test('H5 REGRESSION DENY: recreate deleted parent and read orphan subjects as new owner', async () => {
    await seed(env, { 'friendships/german:juan': friendship('german', 'juan'), 'friendships/pedro:maria': friendship('pedro', 'maria') })
    const original = db(), attacker = db('pedro'), path = 'jointPlans/reused'
    await allow(put(original, path, { ...plan('german', ['juan'], ['german']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await allow(put(original, `${path}/subjects/A`, { ...subject(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await deny(read(attacker, `${path}/subjects/A`))
    await allow(change(original, path, { closed: true }))
    await allow(change(original, path, { deleting: true }))
    await deny(remove(original, path))
    await allow(finalize(original, 'reused')) // Deliberately bypass the app's drain.
    await env.withSecurityRulesDisabled(async ctx => {
      assert.equal((await read(ctx.firestore(), path)).exists(), false)
      assert.equal((await read(ctx.firestore(), `${path}/subjects/A`)).exists(), true)
    })
    await deny(read(attacker, `${path}/subjects/A`))
    await deny(put(attacker, path, { ...plan('pedro', ['maria'], ['pedro']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await deny(put(original, path, { ...plan('german', ['juan'], ['german']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await deny(read(attacker, `${path}/subjects/A`))
    await deny(list(attacker, `${path}/subjects`))
  })
})
