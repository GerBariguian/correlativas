// Diagnostic calibration: independent lookups per write and per atomic batch.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { initialize, seed, claims } = require('./helpers.cjs')
const { doc, writeBatch } = require('firebase/firestore')
for (const counts of [[10], [11], [7, 7, 6], [7, 7, 7]]) test('access calibration ' + counts.join('+'), async t => {
  let id = 0
  const entries = {}, blocks = counts.map((count, i) => {
    const checks = Array.from({ length: count }, () => {
      const path = `diagnosticLookups/${id++}`; entries[path] = { allowed: true }
      return `get(/databases/$(database)/documents/${path}).data.allowed == true`
    }).join(' && ')
    return `match /diagnosticWrites/w${i} { allow create: if ${checks}; }`
  }).join('\n')
  const env = await initialize(`rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { ${blocks} } }`)
  try {
    await env.clearFirestore(); await seed(env, entries)
    const db = env.authenticatedContext('owner', claims('owner')).firestore(), b = writeBatch(db)
    counts.forEach((_, i) => b.set(doc(db, `diagnosticWrites/w${i}`), { test: true }))
    let result = 'ALLOW'
    try { await b.commit() } catch (e) { assert.equal(e.code, 'permission-denied'); result = 'DENY' }
    t.diagnostic(`${counts.join('+')} distinct document lookups: ${result}`)
    if (counts.length === 1) assert.equal(result, counts[0] <= 10 ? 'ALLOW' : 'DENY')
    // Confirm both sides of the aggregate boundary, not just one successful batch.
    if (counts.length > 1) assert.equal(result, counts.reduce((a, n) => a + n, 0) <= 20 ? 'ALLOW' : 'DENY')
  } finally { await env.cleanup() }
})
