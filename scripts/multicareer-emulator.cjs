// Deliberately local-only transport. No ADC, Admin SDK, .env, CLI project or login.
const HOST = '127.0.0.1:8088'
const PROJECT = 'demo-correlativas-rules'
const { equal } = require('./multicareer-migration.cjs')
const fail = code => { throw Object.assign(new Error(code), { code }) }
function encode(v) {
  if (v === null) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number' && Number.isSafeInteger(v)) return { integerValue: String(v) }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } }
  if (v && Object.keys(v).sort().join(',') === 'nanoseconds,seconds' && Number.isInteger(v.seconds) && Number.isInteger(v.nanoseconds)) {
    return { timestampValue: new Date(v.seconds * 1000).toISOString().replace(/\.000Z$/, '.' + String(v.nanoseconds).padStart(9, '0') + 'Z') }
  }
  if (v && typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, v]) => [k, encode(v)])) } }
  fail('UNSUPPORTED_FIRESTORE_VALUE')
}
function decode(v) {
  if ('nullValue' in v) return null
  for (const key of ['stringValue', 'booleanValue']) if (key in v) return v[key]
  if ('integerValue' in v) { const n = Number(v.integerValue); if (!Number.isSafeInteger(n)) fail('UNSUPPORTED_FIRESTORE_VALUE'); return n }
  if ('timestampValue' in v) {
    const s = v.timestampValue, millis = Date.parse(s)
    if (!Number.isFinite(millis)) fail('UNSUPPORTED_FIRESTORE_VALUE')
    return { seconds: Math.floor(millis / 1000), nanoseconds: Number((s.match(/\.(\d+)Z$/)?.[1] || '').padEnd(9, '0')) }
  }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode)
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]))
  fail('UNSUPPORTED_FIRESTORE_VALUE')
}
function emulatorAdapter({ host, projectId, environment = process.env } = {}) {
  if (host !== HOST || projectId !== PROJECT || environment.FIRESTORE_EMULATOR_HOST !== HOST
    || ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'RULES_TEST_PROJECT'].some(k => environment[k] && environment[k] !== PROJECT)
    || ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN'].some(k => environment[k])) fail('UNSAFE_MIGRATION_ENVIRONMENT')
  const root = `projects/${PROJECT}/databases/(default)/documents`
  async function request(method, body, parent = '') {
    const response = await fetch(`http://${HOST}/v1/${root}${parent ? '/' + parent : ''}:${method}`, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
    if (!response.ok) fail(response.status === 409 ? 'MIGRATION_CONCURRENT_CONFLICT' : 'EMULATOR_REQUEST_FAILED')
    return response.json()
  }
  return { environment: 'emulator', async transaction(operation, uid) {
    if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(uid)) fail('INVALID_INPUT')
    const { transaction } = await request('beginTransaction', { options: { readWrite: {} } })
    if (!transaction) fail('INCOMPLETE_EMULATOR_RESPONSE')
    try {
      const docs = {}
      let now
      const ingest = document => {
        if (!document.name.startsWith(root + '/')) fail('INCOMPLETE_EMULATOR_RESPONSE')
        const path = document.name.slice(root.length + 1)
        // A legacy map with seconds/nanoseconds is not a Firestore timestamp.
        // Do not accidentally convert a corrupt source date while copying.
        if (/^users\/[^/]+\/(careers|careerProjections)\/[^/]+$/.test(path)
          && typeof document.fields?.updatedAt?.timestampValue !== 'string') fail('LEGACY_SOURCE_CONFLICT')
        const data = decode({ mapValue: { fields: document.fields } })
        if (Object.hasOwn(docs, path) && !equal(docs[path], data)) fail('INCOMPLETE_EMULATOR_RESPONSE')
        docs[path] = data
        if (Object.keys(docs).length > 5000) fail('LOCAL_DATASET_TOO_LARGE')
      }
      const query = async (parent, collectionId, { where, allDescendants = false } = {}) => {
        const rows = await request('runQuery', { transaction, structuredQuery: {
          from: [{ collectionId, allDescendants }], ...(where ? { where } : {}) } }, parent)
        if (!Array.isArray(rows) || !rows.length || rows.some(r => r.error)
          || !rows.some(r => r.readTime)) fail('INCOMPLETE_EMULATOR_RESPONSE')
        now ??= decode({ timestampValue: rows.find(r => r.readTime).readTime })
        for (const row of rows) if (row.document) ingest(row.document)
      }
      // Exact root documents, then complete user-scoped collections (even without a parent).
      const paths = [`users/${uid}`, `planningSharing/${uid}`, `socialProfiles/${uid}`, `migrationUsers/${uid}`, `migrationManifests/${uid}`]
      const rows = await request('batchGet', { transaction, documents: paths.map(p => root + '/' + p) })
      const remaining = new Set(paths.map(p => root + '/' + p))
      if (!Array.isArray(rows)) fail('INCOMPLETE_EMULATOR_RESPONSE')
      for (const row of rows) {
        const name = row.found?.name || row.missing
        if (!name || !remaining.delete(name) || row.error) fail('INCOMPLETE_EMULATOR_RESPONSE')
        if (row.found) ingest(row.found)
      }
      if (remaining.size) fail('INCOMPLETE_EMULATOR_RESPONSE')
      for (const collection of ['careers', 'careerProjections', 'careerInstances', 'catalogMemberships']) await query(`users/${uid}`, collection)
      for (const collection of ['academic', 'planning']) await query(`users/${uid}`, collection, { allDescendants: true })
      await query(`planningSnapshots/${uid}`, 'careers')
      for (const field of ['ownerId', 'memberIds', 'inviteeIds']) await query('', 'jointPlans', { where: {
        fieldFilter: { field: { fieldPath: field }, op: field === 'ownerId' ? 'EQUAL' : 'ARRAY_CONTAINS', value: { stringValue: uid } } } })
      const participants = new Set()
      for (const [path, plan] of Object.entries(docs).filter(([path]) => /^jointPlans\/[^/]+$/.test(path))) {
        await query(path, 'subjects')
        for (const participant of [plan.ownerId, ...(plan.memberIds || []), ...(plan.inviteeIds || [])]) {
          if (typeof participant !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(participant)) fail('LEGACY_SOURCE_CONFLICT')
          if (participant !== uid) participants.add(participant)
        }
      }
      for (const participant of participants) for (const collection of ['careerInstances', 'catalogMemberships']) await query(`users/${participant}`, collection)
      const before = structuredClone(docs)
      const { writes, result } = await operation(docs, now)
      const changes = Object.entries(writes).filter(([path, value]) => !equal(before[path], value))
      const allowed = new RegExp(`^(?:migrationUsers/${uid}|migrationManifests/${uid}|users/${uid}(?:/(?:careerInstances|catalogMemberships)/[A-Za-z0-9_-]+(?:/(?:academic/progress|planning/projection))?)?)$`)
      if (changes.some(([path]) => !allowed.test(path))) fail('UNSAFE_MIGRATION_WRITE')
      await request('commit', { transaction, writes: changes.map(([path, data]) => {
        // Keep every unrelated legacy account field in its original Firestore encoding.
        const accountFields = ['schemaVersion', 'activeCareerInstanceId', 'updatedAt']
        const account = path === `users/${uid}`
        const value = account ? Object.fromEntries(accountFields.map(k => [k, data[k]])) : data
        return { update: { name: `${root}/${path}`, fields: encode(value).mapValue.fields },
          ...(account ? { updateMask: { fieldPaths: accountFields } } : {}) }
      }) })
      return result
    } catch (error) {
      await request('rollback', { transaction }).catch(() => {})
      throw error
    }
  } }
}
module.exports = { emulatorAdapter, encode, decode, HOST, PROJECT }
