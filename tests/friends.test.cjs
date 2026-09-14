const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// Exercise the real service against an in-memory Firestore adapter, not production.
// Authorization rules require separate Emulator/Firestore integration validation.
function setup() {
  const records = new Map()
  const reads = []
  const deniedReads = new Set()
  let transactionQueue = Promise.resolve()
  let failWrite = false
  let listener
  let stopped = false
  const user = { uid: 'alice', email: 'Alice@Example.com', emailVerified: true, displayName: 'Alice', photoURL: '' }
  user.getIdTokenResult = async (refresh) => {
    assert.equal(refresh, true)
    return { claims: { email: user.email, email_verified: user.emailVerified } }
  }
  const auth = { currentUser: user }
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  const snapshot = (ref) => ({ exists: () => records.has(ref), data: () => clone(records.get(ref)) })
  const context = {
    auth, db: {},
    doc: (_db, ...segments) => segments.join('/'),
    collection: (_db, name) => name,
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    getDoc: async (ref) => {
      reads.push(ref)
      if (deniedReads.has(ref)) throw Object.assign(new Error('denied'), { code: 'permission-denied' })
      return snapshot(ref)
    },
    runTransaction: (_db, callback) => {
      const result = transactionQueue.then(async () => {
        const writes = []
        await callback({
          get: async (ref) => {
            assert.equal(writes.length, 0, 'all transaction reads must precede writes')
            reads.push(ref)
            return snapshot(ref)
          },
          set: (ref, data, options) => writes.push([ref, options?.merge ? { ...records.get(ref), ...clone(data) } : clone(data)]),
          update: (ref, data) => writes.push([ref, { ...records.get(ref), ...clone(data) }]),
          delete: (ref) => writes.push([ref, undefined]),
        })
        if (failWrite) throw Object.assign(new Error('denied'), { code: 'permission-denied' })
        writes.forEach(([ref, data]) => data === undefined ? records.delete(ref) : records.set(ref, data))
      })
      transactionQueue = result.catch(() => {})
      return result
    },
    where: (...args) => args,
    query: (...args) => args,
    onSnapshot: (query, success, failure) => {
      listener = { query, success, failure }
      return () => { stopped = true }
    },
  }
  const source = fs.readFileSync(path.join(__dirname, '../src/services/friends.js'), 'utf8')
    .replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '')
    .replace(/export /g, '')
  vm.createContext(context)
  vm.runInContext(source, context)
  return { api: context, records, reads, deniedReads, auth, user, clone,
    fail: (value) => { failWrite = value },
    listener: () => listener, stopped: () => stopped }
}

test('email lookup normalizes case/space, preserves Gmail identity and rejects paths', () => {
  const { api } = setup()
  assert.equal(api.normalizeEmail(' Alice+tag@Example.COM '), 'alice+tag@example.com')
  assert.equal(api.normalizeEmail('a.b@example.com'), 'a.b@example.com')
  for (const invalid of ['', 'alice', 'a/b@example.com', 'a@b/c.com', 'a b@example.com']) {
    assert.throws(() => api.normalizeEmail(invalid))
  }
})

test('pair ID is direction-independent and rejects self requests and ambiguous IDs', () => {
  const { api } = setup()
  assert.equal(api.friendshipId('bob', 'alice'), api.friendshipId('alice', 'bob'))
  assert.throws(() => api.friendshipId('alice', 'alice'))
  assert.throws(() => api.friendshipId('a:b', 'c'))
})

test('registration writes only the minimal social profile and verified-email index', async () => {
  const { api, user, records } = setup()
  await api.syncSocialProfile(user, 'utn-industrial-2023')
  assert.deepEqual([...records.keys()], ['users/alice', 'socialProfiles/alice', 'socialEmails/alice@example.com'])
  assert.deepEqual(Object.keys(records.get('socialProfiles/alice')).sort(), ['careerId', 'name', 'photoURL', 'uid', 'updatedAt'])
  assert.deepEqual(records.get('users/alice'), { socialEmail: 'alice@example.com' })
  assert.deepEqual(records.get('socialEmails/alice@example.com'), { uid: 'alice' })
})

test('search reads exact social documents, never users or academic progress', async () => {
  const { api, records, reads } = setup()
  records.set('socialEmails/bob@example.com', { uid: 'bob' })
  records.set('socialProfiles/bob', { uid: 'bob', name: 'Bob' })
  const result = await api.findUserByEmail(' Bob@Example.com ')
  assert.equal(result.uid, 'bob')
  assert.equal('email' in result, false)
  assert.deepEqual(reads, ['socialEmails/bob@example.com', 'socialProfiles/bob'])
  assert.equal(await api.findUserByEmail('missing@example.com'), null)
})

test('two simultaneous repeated sends create just one pending request', async () => {
  const { api, records } = setup()
  const results = await Promise.allSettled([
    api.sendFriendRequest('alice', 'bob'), api.sendFriendRequest('alice', 'bob'),
  ])
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal(records.size, 1)
  assert.equal(records.get('friendships/alice:bob').status, 'pending')
  assert.deepEqual(records.get('friendships/alice:bob').participants, ['alice', 'bob'])
})

test('crossed request and inverse document cannot create a second relationship', async () => {
  const { api, auth, records } = setup()
  await api.sendFriendRequest('alice', 'bob')
  auth.currentUser = { uid: 'bob', emailVerified: true }
  await assert.rejects(api.sendFriendRequest('bob', 'alice'))
  assert.equal(records.size, 1)
  records.clear()
  records.set('friendships/bob:alice', { status: 'pending' })
  await assert.rejects(api.sendFriendRequest('bob', 'alice'))
  assert.equal(records.size, 1)
})

test('only recipient can respond; response cannot be reversed or duplicated', async () => {
  const { api, auth, records } = setup()
  await api.sendFriendRequest('alice', 'bob')
  await assert.rejects(api.respondToFriendRequest('alice', 'alice:bob', 'accepted'))
  auth.currentUser = { uid: 'charlie', emailVerified: true }
  await assert.rejects(api.respondToFriendRequest('charlie', 'alice:bob', 'rejected'))
  auth.currentUser = { uid: 'bob', emailVerified: true }
  await api.respondToFriendRequest('bob', 'alice:bob', 'accepted')
  assert.equal(records.get('friendships/alice:bob').status, 'accepted')
  await assert.rejects(api.respondToFriendRequest('bob', 'alice:bob', 'rejected'))
  assert.equal(records.get('friendships/alice:bob').senderId, 'alice')
})

test('rejection persists and does not allow resending in this MVP', async () => {
  const { api, auth, records } = setup()
  await api.sendFriendRequest('alice', 'bob')
  auth.currentUser = { uid: 'bob', emailVerified: true }
  await api.respondToFriendRequest('bob', 'alice:bob', 'rejected')
  assert.equal(records.get('friendships/alice:bob').status, 'rejected')
  await assert.rejects(api.sendFriendRequest('bob', 'alice'))
})

test('failed writes leave records unchanged and can be retried', async () => {
  const { api, records, fail } = setup()
  fail(true)
  await assert.rejects(api.sendFriendRequest('alice', 'bob'))
  assert.equal(records.size, 0)
  fail(false)
  await api.sendFriendRequest('alice', 'bob')
  assert.equal(records.size, 1)
})

test('mutations reject old sessions, unverified users and invalid responses', async () => {
  const { api, auth, records } = setup()
  auth.currentUser = { uid: 'bob', emailVerified: true }
  await assert.rejects(api.sendFriendRequest('alice', 'bob'))
  auth.currentUser = { uid: 'alice', emailVerified: false }
  await assert.rejects(api.sendFriendRequest('alice', 'bob'))
  auth.currentUser = { uid: 'alice', emailVerified: true }
  await assert.rejects(api.respondToFriendRequest('alice', 'alice:bob', 'pending'))
  assert.equal(records.size, 0)
})

test('listener scopes query to participant and exposes cleanup', () => {
  const { api, listener, clone, stopped } = setup()
  const stop = api.subscribeFriendships('alice', () => {}, () => {})
  assert.deepEqual(clone(listener().query), ['friendships', ['participants', 'array-contains', 'alice']])
  stop()
  assert.equal(stopped(), true)
})

test('email change removes old index atomically and preserves private profile and friendships', async () => {
  const { api, user, records } = setup()
  records.set('users/alice', { activeCareerId: 'career', updatedAt: 'old', socialEmail: 'old@example.com' })
  records.set('socialEmails/old@example.com', { uid: 'alice' })
  records.set('friendships/alice:bob', { status: 'accepted' })
  records.set('users/alice/careers/career', { statusMap: { subject: 'Aprobada' } })
  await api.syncSocialProfile(user, 'career')
  assert.equal(records.has('socialEmails/old@example.com'), false)
  assert.equal(await api.findUserByEmail('old@example.com'), null)
  assert.equal((await api.findUserByEmail(user.email)).uid, 'alice')
  assert.deepEqual(records.get('users/alice'), { activeCareerId: 'career', updatedAt: 'old', socialEmail: 'alice@example.com' })
  assert.deepEqual(records.get('friendships/alice:bob'), { status: 'accepted' })
  assert.deepEqual(records.get('users/alice/careers/career'), { statusMap: { subject: 'Aprobada' } })
})

test('legacy public email is migrated and removed, including a different private pointer', async () => {
  const { api, user, records } = setup()
  records.set('socialProfiles/alice', { uid: 'alice', email: 'legacy@example.com' })
  records.set('socialEmails/legacy@example.com', { uid: 'alice' })
  records.set('users/alice', { socialEmail: 'previous@example.com' })
  records.set('socialEmails/previous@example.com', { uid: 'alice' })
  await api.syncSocialProfile(user, 'career')
  assert.equal(records.has('socialEmails/legacy@example.com'), false)
  assert.equal(records.has('socialEmails/previous@example.com'), false)
  assert.equal('email' in records.get('socialProfiles/alice'), false)
})

test('migration never deletes an index belonging to another user', async () => {
  const { api, user, records } = setup()
  records.set('users/alice', { socialEmail: 'bob@example.com' })
  records.set('socialProfiles/alice', { email: 'other@example.com' })
  records.set('socialEmails/bob@example.com', { uid: 'bob' })
  records.set('socialEmails/other@example.com', { uid: 'other' })
  await api.syncSocialProfile(user, 'career')
  assert.deepEqual(records.get('socialEmails/bob@example.com'), { uid: 'bob' })
  assert.deepEqual(records.get('socialEmails/other@example.com'), { uid: 'other' })
})

test('new email already indexed by another UID fails without deleting the previous index', async () => {
  const { api, user, records } = setup()
  records.set('users/alice', { socialEmail: 'old@example.com' })
  records.set('socialEmails/old@example.com', { uid: 'alice' })
  records.set('socialEmails/alice@example.com', { uid: 'bob' })
  const before = JSON.stringify([...records])
  await assert.rejects(api.syncSocialProfile(user, 'career'), /otra cuenta/)
  assert.equal(JSON.stringify([...records]), before)
})

test('failed email migration preserves old index; retry finishes and repeated sync is idempotent', async () => {
  const { api, user, records, fail } = setup()
  records.set('users/alice', { socialEmail: 'old@example.com' })
  records.set('socialEmails/old@example.com', { uid: 'alice' })
  fail(true)
  await assert.rejects(api.syncSocialProfile(user, 'career'))
  assert.equal(records.has('socialEmails/old@example.com'), true)
  assert.equal(records.has('socialEmails/alice@example.com'), false)
  fail(false)
  await api.syncSocialProfile(user, 'career')
  const after = JSON.stringify([...records])
  await api.syncSocialProfile(user, 'career')
  assert.equal(JSON.stringify([...records]), after)
})

test('uses freshly verified token email instead of stale user.email', async () => {
  const { api, user, records } = setup()
  user.getIdTokenResult = async (refresh) => {
    assert.equal(refresh, true)
    return { claims: { email: 'new@example.com', email_verified: true } }
  }
  await api.syncSocialProfile(user, 'career')
  assert.equal(records.get('users/alice').socialEmail, 'new@example.com')
  assert.equal(records.has('socialEmails/alice@example.com'), false)
  user.getIdTokenResult = async () => ({ claims: { email: 'unverified@example.com', email_verified: false } })
  await assert.rejects(api.syncSocialProfile(user, 'career'))
  assert.equal(records.has('socialEmails/unverified@example.com'), false)
})

test('session change during token refresh aborts migration', async () => {
  const { api, user, auth, records } = setup()
  user.getIdTokenResult = async () => {
    auth.currentUser = { uid: 'bob', emailVerified: true }
    return { claims: { email: user.email, email_verified: true } }
  }
  await assert.rejects(api.syncSocialProfile(user, 'career'))
  assert.equal(records.size, 0)
})

test('invalidated index returns no match; unreadable legacy friend does not hide other friends', async () => {
  const { api, records, deniedReads } = setup()
  deniedReads.add('socialEmails/old@example.com')
  assert.equal(await api.findUserByEmail('old@example.com'), null)
  deniedReads.add('socialProfiles/bob')
  records.set('socialProfiles/charlie', { uid: 'charlie', name: 'Charlie' })
  const profiles = await api.loadSocialProfiles(['bob', 'charlie'])
  assert.equal(profiles.bob, null)
  assert.equal(profiles.charlie.name, 'Charlie')
})

test('service never returns legacy email or other extra fields in profiles', async () => {
  const { api, records } = setup()
  records.set('socialProfiles/bob', { uid: 'bob', name: 'Bob', email: 'private@example.com', statusMap: {} })
  records.set('socialEmails/bob@example.com', { uid: 'bob' })
  const found = await api.findUserByEmail('bob@example.com')
  const profiles = await api.loadSocialProfiles(['bob'])
  for (const profile of [found, profiles.bob]) {
    assert.equal('email' in profile, false)
    assert.equal('statusMap' in profile, false)
  }
})
