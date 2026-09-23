const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing')
const { doc, writeBatch, Timestamp, serverTimestamp } = require('firebase/firestore')
const PROJECT = 'demo-correlativas-rules'
const HOST = '127.0.0.1:8088'
const CAREER = 'test-career'
const TIME = Timestamp.fromMillis(1700000000000)
const ids = ['german', 'juan', 'pedro', 'maria', 'outsider']
const email = uid => `${uid}@example.test`
function claims(uid, overrides = {}) {
  return { email: email(uid), email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...overrides }
}
async function initialize(rules) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== HOST || process.env.RULES_TEST_PROJECT !== PROJECT
    || (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT)) {
    throw new Error('Local-only guard: run npm.cmd run test:rules (demo project and loopback emulator required).')
  }
  // Fail promptly rather than falling back to any remote service.
  const response = await fetch(`http://${HOST}/`, { signal: AbortSignal.timeout(3000) })
  if (!response.ok) throw new Error('Local emulator is not ready')
  return initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8088,
    rules: rules ?? readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } })
}
const profile = uid => ({ uid, name: uid, photoURL: '', careerId: CAREER, updatedAt: TIME })
const friendship = (a, b, status = 'accepted') => ({ participants: [a, b], senderId: a, recipientId: b,
  status, createdAt: TIME, updatedAt: TIME })
const plan = (ownerId = 'german', inviteeIds = ['juan', 'pedro'], memberIds = ['german', 'juan']) => ({
  ownerId, careerId: CAREER, name: 'Plan seguro', inviteeIds, memberIds,
  invitedBy: Object.fromEntries(inviteeIds.map(uid => [uid, ownerId])), closed: false,
  createdAt: TIME, updatedAt: TIME,
})
const subject = (code = 'A', actor = 'german') => ({ code, proposedParticipantIds: ['german', 'juan'],
  addedByUid: actor, createdAt: TIME, updatedAt: TIME })
const sharing = (version = 2, enabled = true) => ({ enabled, sharedCareerId: CAREER, consentVersion: version, updatedAt: TIME })
const snapshot = (version = 2) => ({ approvedCodes: ['A'], availableToCourseCodes: ['B'],
  ...(version === 2 ? { pendingFinalCodes: ['C'] } : {}), sourceUpdatedAt: TIME, updatedAt: TIME,
  schemaVersion: version, logicVersion: '1', catalogVersion: 'test-catalog:1' })
async function seed(env, entries) {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), batch = writeBatch(db)
    for (const [path, value] of Object.entries(entries)) batch.set(doc(db, path), value)
    await batch.commit()
  })
}
async function baseline(env) {
  await env.clearFirestore()
  const entries = {}
  for (const uid of ids) {
    entries[`users/${uid}`] = { activeCareerId: CAREER, socialEmail: email(uid), updatedAt: TIME }
    entries[`users/${uid}/careers/${CAREER}`] = { statusMap: { A: 'Aprobada', B: 'Pendiente', C: 'Regularizada' }, updatedAt: TIME }
    entries[`socialProfiles/${uid}`] = profile(uid)
    entries[`socialEmails/${email(uid)}`] = { uid }
  }
  await seed(env, entries)
}
async function publish(db, uid, version = 2, patch = {}) {
  const batch = writeBatch(db)
  batch.set(doc(db, `planningSharing/${uid}`), { ...sharing(version), updatedAt: serverTimestamp() })
  batch.set(doc(db, `planningSnapshots/${uid}/careers/${CAREER}`), { ...snapshot(version), ...patch, updatedAt: serverTimestamp() })
  return batch.commit()
}
module.exports = { initialize, claims, email, ids, CAREER, TIME, profile, friendship, plan, subject,
  sharing, snapshot, seed, baseline, publish, assertSucceeds, assertFails }
