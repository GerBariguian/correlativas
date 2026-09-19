const { test } = require('node:test')
const assert = require('node:assert/strict')
const { audit, createTransport } = require('../scripts/audit-orphan-subjects.cjs')
const T = '2026-09-19T12:00:00.123456Z'
const ROOT = 'projects/demo-audit/databases/(default)/documents'
const TOKEN = 'synthetic-secret-never-log'
const document = path => ({ name: `${ROOT}/${path}` })
const rows = paths => paths.length ? paths.map(path => ({ document: document(path), readTime: T })) : [{ readTime: T }]
function fixture({ subjects = [], tombstones = [], absent = [], override } = {}) {
  const calls = []
  const options = { projectId: 'demo-audit', databaseId: '(default)', token: TOKEN,
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body), call = { url, init, body }
      calls.push(call)
      assert.equal(new URL(url).origin, 'https://firestore.googleapis.com')
      assert.equal(init.method, 'POST')
      assert.equal(init.redirect, 'error')
      assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`)
      const changed = override?.(call, calls.length)
      if (changed) return changed
      let data
      if (url.endsWith(':runQuery')) {
        assert.deepEqual(body.structuredQuery.select, { fields: [{ fieldPath: '__name__' }] })
        if (body.structuredQuery.limit) data = rows([])
        else {
          assert.equal(body.readTime, T)
          data = rows(body.structuredQuery.from[0].collectionId === 'subjects' ? subjects : tombstones)
        }
      } else {
        assert.ok(url.endsWith(':batchGet'))
        assert.deepEqual(body.mask, { fieldPaths: [] })
        assert.equal(body.readTime, T)
        data = body.documents.map(name => absent.includes(name.split('/').at(-1))
          ? { missing: name, readTime: T } : { found: { name }, readTime: T }).reverse()
      }
      return Response.json(data)
    } }
  return { options, calls }
}
test('complete zero subjects and existing parents both yield A', async () => {
  for (const subjects of [[], ['jointPlans/p/subjects/A']]) {
    const { options } = fixture({ subjects })
    const report = await audit(options)
    assert.equal(report.resultado, 'A'); assert.equal(report.scanComplete, true)
    assert.equal(report.planesHuerfanos, 0)
  }
})
test('orphans yield B; parents deduplicate, foreign scopes counted, tombstones crossed at T', async () => {
  const { options, calls } = fixture({ subjects: ['jointPlans/p/subjects/A', 'jointPlans/p/subjects/B',
    'jointPlans/q/subjects/C', 'other/x/subjects/A', 'other/x/jointPlans/p/subjects/Z'],
  absent: ['p', 'q'], tombstones: ['jointPlanTombstones/p'] })
  const result = await audit(options)
  assert.equal(result.resultado, 'B'); assert.equal(result.padresUnicos, 2)
  assert.equal(result.subjectsFueraDeAlcance, 2); assert.equal(result.subjectsHuerfanos, 3)
  assert.equal(result.tombstonesExistentes, 1)
  assert.deepEqual(result.huerfanos.map(x => x.tombstoneExistsAtT), [true, false])
  assert.equal(result.huerfanos[0].subjectCount, 2)
  assert.deepEqual(result.huerfanos[0].subjectPaths, ['jointPlans/p/subjects/A', 'jointPlans/p/subjects/B'])
  assert.equal(calls.filter(x => x.url.endsWith(':batchGet'))[0].body.documents.length, 2)
  assert.ok(calls.slice(1).every(x => x.body.readTime === T))
})
test('parent batches exhaust more than 100 unique parents', async () => {
  const { options, calls } = fixture({ subjects: Array.from({ length: 205 }, (_, i) => `jointPlans/p${i}/subjects/A`) })
  const result = await audit(options)
  assert.equal(result.resultado, 'A'); assert.equal(result.padresComprobados, 205)
  assert.equal(calls.filter(c => c.url.endsWith(':batchGet')).length, 3)
})
test('unanswered parent yields C, never zero proved', async () => {
  const { options } = fixture({ subjects: ['jointPlans/p/subjects/A', 'jointPlans/q/subjects/B'],
    override: ({ url }) => url.endsWith(':batchGet') && Response.json([{ found: document('jointPlans/p'), readTime: T }]) })
  const report = await audit(options)
  assert.equal(report.resultado, 'C'); assert.equal(report.padresSinResolver, 1)
})
for (const [name, response] of [
  ['permission', () => new Response('denied', { status: 403 })],
  ['truncated JSON', () => new Response('[{"readTime":')],
  ['empty stream', () => Response.json([])],
  ['wrong time', () => Response.json([{ readTime: '2026-09-19T12:00:01Z' }])],
  ['wrong project', () => Response.json([{ document: { name: 'projects/foreign/databases/(default)/documents/jointPlans/p/subjects/A' }, readTime: T }])],
  ['wrong database', () => Response.json([{ document: { name: 'projects/demo-audit/databases/other/documents/jointPlans/p/subjects/A' }, readTime: T }])],
  ['unexpected fields', () => Response.json([{ document: { ...document('jointPlans/p/subjects/A'), fields: { statusMap: {} } }, readTime: T }])],
  ['duplicates', () => Response.json(rows(['jointPlans/p/subjects/A', 'jointPlans/p/subjects/A']))],
  ['partial marker', () => Response.json([{ readTime: T, done: false }])],
  ['unexpected pagination', () => Response.json([{ readTime: T, nextPageToken: 'more' }])],
  ['redirect', () => new Response(null, { status: 302, headers: { Location: 'https://example.com' } })],
  ['body connection failure', () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(TOKEN)) } }))],
  ['timeout and token echo', () => { throw new Error(`timeout ${TOKEN}`) }],
]) test(`${name} yields C without token exposure`, async () => {
  const { options } = fixture({ override: (_, index) => index === 2 && response() })
  const report = await audit(options)
  assert.equal(report.resultado, 'C'); assert.equal(report.scanComplete, false)
  assert.ok(!JSON.stringify(report).includes(TOKEN))
})
test('error after confirmed orphan remains incomplete C with confirmed evidence', async () => {
  const { options } = fixture({ subjects: ['jointPlans/p/subjects/A'], absent: ['p'],
    override: (_, index) => index === 4 && new Response('failure', { status: 503 }) })
  const report = await audit(options)
  assert.equal(report.resultado, 'C'); assert.equal(report.planesHuerfanos, 1)
  assert.equal(report.huerfanos[0].tombstoneExistsAtT, null)
})
test('secret echoed in a document path is redacted', async () => {
  const { options } = fixture({ subjects: [`jointPlans/p/subjects/${TOKEN}`], absent: ['p'] })
  assert.ok(!JSON.stringify(await audit(options)).includes(TOKEN))
})
test('configuration and host failures perform no HTTP requests', async () => {
  for (const patch of [{ projectId: '' }, { databaseId: '' }, { token: '' },
    { origin: 'http://firestore.googleapis.com' }, { origin: 'https://example.com' },
    { origin: 'https://firestore.googleapis.com.evil.test' }]) {
    const { options, calls } = fixture()
    assert.equal((await audit({ ...options, ...patch })).resultado, 'C')
    assert.equal(calls.length, 0)
  }
})
test('transport rejects any method outside the two read RPCs', async () => {
  const { options, calls } = fixture()
  await assert.rejects(createTransport(options).read('unknown', {}))
  assert.equal(calls.length, 0)
})
test('parent response from another database is rejected', async () => {
  const { options } = fixture({ subjects: ['jointPlans/p/subjects/A'],
    override: ({ url }) => url.endsWith(':batchGet') && Response.json([{ missing:
      'projects/demo-audit/databases/other/documents/jointPlans/p', readTime: T }]) })
  assert.equal((await audit(options)).resultado, 'C')
})
test('tombstone response from another project is rejected', async () => {
  const { options } = fixture({ override: (_, index) => index === 3 && Response.json([{ document:
    { name: 'projects/foreign/databases/(default)/documents/jointPlanTombstones/p' }, readTime: T }]) })
  assert.equal((await audit(options)).resultado, 'C')
})
