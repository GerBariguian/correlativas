const { test } = require('node:test')
const assert = require('node:assert/strict')
const { fixture, control, instance, time, career } = require('./academic-onboarding-persistence-harness.cjs')
const permission = () => Object.assign(Error('denied'), { code: 'permission-denied' })
async function edit(f, codes = ['B']) {
  const c = f.controller(), d = await c.load()
  return { c, d: f.api.decideOnboardingSubjects(d, codes, 'Aprobada') }
}
for (const model of ['legacy', 'instances']) {
  test(`${model}: confirmed load, explicit confirmation, partial map and unknown keys`, async () => {
    const f = fixture(model), { c, d } = await edit(f)
    assert.equal(f.writes.length, 0)
    const result = await c.confirm(d)
    assert.equal(result.saved, true)
    assert.deepEqual(result.statusMap, { A: 'Pendiente', OLD: 'Regularizada', B: 'Aprobada' })
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0][0], f.target)
    assert.equal(result.revision, model === 'legacy' ? null : 2)
    await assert.rejects(c.confirm(d), /RELOAD_REQUIRED/)
  })
  test(`${model}: genuinely absent document can be initialized`, async () => {
    const f = fixture(model, null), { c, d } = await edit(f)
    assert.equal((await c.confirm(d)).saved, true)
  })
  test(`${model}: context change during server load discards result`, async () => {
    const f = fixture(model), c = f.controller()
    f.afterRead = () => f.invalidate()
    await assert.rejects(c.load(), /SCOPE/); assert.equal(c.getPhase(), 'error')
    assert.equal(f.writes.length, 0)
  })
  test(`${model}: context change inside transaction prevents writes`, async () => {
    const f = fixture(model), { c, d } = await edit(f)
    f.afterRead = path => { if (path === f.target) f.invalidate() }
    await assert.rejects(c.confirm(d), /SCOPE/); assert.equal(f.writes.length, 0)
  })
  test(`${model}: another tab registering explicit Pending is never overwritten`, async () => {
    const f = fixture(model), { c, d } = await edit(f)
    const current = { ...f.data.get(f.target), statusMap: { A: 'Pendiente', OLD: 'Regularizada', B: 'Pendiente' } }
    if (model === 'instances') current.revision++
    f.change(f.target, current)
    await assert.rejects(c.confirm(d), /CONFLICT/)
    assert.equal(f.data.get(f.target).statusMap.B, 'Pendiente'); assert.equal(f.writes.length, 0)
  })
  test(`${model}: permission read failure never means empty progress`, async () => {
    const f = fixture(model); f.readError = permission(); const c = f.controller()
    await assert.rejects(c.load(), e => e.code === 'permission-denied')
    await assert.rejects(c.confirm({}), /RELOAD_REQUIRED/); assert.equal(f.writes.length, 0)
  })
  test(`${model}: protected explicit pending and malformed existing document`, async () => {
    const f = fixture(model), c = f.controller(), d = await c.load()
    assert.throws(() => f.api.decideOnboardingSubjects(d, ['A'], 'Aprobada'), /PROTECTED/)
    f.change(f.target, { unexpected: true })
    await assert.rejects(c.load()); assert.equal(f.writes.length, 0)
  })
  test(`${model}: empty/starting/later produce no transaction or write`, async () => {
    const f = fixture(model), { c, d } = await edit(f)
    for (const choice of ['starting', 'later']) assert.equal((await c.confirm(d, choice)).saved, false)
    assert.equal((await c.confirm(await c.load())).saved, false)
    assert.equal(f.transactions, 0)
  })
  test(`${model}: double submission allows only one request`, async () => {
    const f = fixture(model), { c, d } = await edit(f)
    const first = c.confirm(d)
    await assert.rejects(c.confirm(d), /BUSY/); await first
    assert.equal(f.transactions, 1)
  })
  test(`${model}: account switch and invalidated context block save`, async () => {
    const f = fixture(model), { c, d } = await edit(f)
    f.auth.currentUser = { uid: 'alice' }
    await assert.rejects(c.confirm(d), /SESSION/); assert.equal(f.writes.length, 0)
    const g = fixture(model), e = await edit(g); g.invalidate()
    await assert.rejects(e.c.confirm(e.d), /SCOPE/); assert.equal(g.writes.length, 0)
  })
  test(`${model}: frozen authority blocks transaction`, async () => {
    const f = fixture(model), { c, d } = await edit(f)
    f.change('migrationUsers/alice', control('frozen'))
    await assert.rejects(c.confirm(d), /AUTHORITY/); assert.equal(f.writes.length, 0)
  })
  test(`${model}: permission failure is propagated; no automatic retry`, async () => {
    const f = fixture(model), { c, d } = await edit(f); f.writeError = permission()
    await assert.rejects(c.confirm(d), e => e.code === 'permission-denied')
    await assert.rejects(c.confirm(d), /RELOAD_REQUIRED/)
    assert.equal(f.transactions, 1); assert.equal(f.writes.length, 0)
    assert.equal(f.api.onboardingSaveError(f.writeError).kind, 'permission')
  })
  test(`${model}: two independent tabs cannot both claim the same absent subject`, async () => {
    const f = fixture(model), a = await edit(f), b = await edit(f)
    const results = await Promise.allSettled([a.c.confirm(a.d), b.c.confirm(b.d)])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.match(results.find(r => r.status === 'rejected').reason.message, /CONFLICT/)
    assert.equal(f.writes.length, 1)
  })
  test(`${model}: unrelated tab update is preserved (legacy) or CAS conflicts (instances)`, async () => {
    const f = fixture(model), { c, d } = await edit(f)
    const changed = { ...f.data.get(f.target), statusMap: { A: 'Pendiente', OLD: 'Regularizada', C: 'Cursando' } }
    if (model === 'instances') changed.revision++
    f.beforeCommit = () => f.change(f.target, changed)
    if (model === 'instances') await assert.rejects(c.confirm(d), /CONFLICT/)
    else assert.equal((await c.confirm(d)).statusMap.C, 'Cursando')
    assert.equal(f.data.get(f.target).statusMap.C, 'Cursando')
  })
  test(`${model}: post-commit context loss never reports success; reload required`, async () => {
    const f = fixture(model), { c, d } = await edit(f)
    f.beforeCommit = () => f.invalidate()
    await assert.rejects(c.confirm(d), /SCOPE/)
    assert.equal(c.getPhase(), 'error')
  })
}
test('instances: archive or catalog binding change blocks onboarding', async () => {
  for (const patch of [{ lifecycle: 'archived', archivedAt: time }, { catalogId: 'other' }]) {
    const f = fixture('instances'), { c, d } = await edit(f)
    f.change('users/alice/careerInstances/ix', { ...instance, ...patch })
    await assert.rejects(c.confirm(d), /INSTANCE_UNAVAILABLE/); assert.equal(f.writes.length, 0)
  }
})
test('legacy: shared snapshot derives from transaction-merged progress atomically', async () => {
  const f = fixture(); f.data.set('planningSharing/alice', { enabled: true, sharedCareerId: 'catalog', consentVersion: 2 })
  const { c, d } = await edit(f); await c.confirm(d)
  assert.equal(f.writes.length, 2)
  assert.deepEqual(f.data.get('planningSnapshots/alice/careers/catalog'), f.api.derivePlanningSnapshot(career, f.data.get(f.target).statusMap, time, time, true))
})
test('legacy: disabled or other career consent never creates a snapshot', async () => {
  for (const sharing of [{ enabled: false }, { enabled: true, sharedCareerId: 'other' }]) {
    const f = fixture(); f.data.set('planningSharing/alice', sharing)
    const { c, d } = await edit(f); await c.confirm(d); assert.equal(f.writes.length, 1)
  }
})
test('legacy: shared snapshot rejection leaves progress unchanged', async () => {
  const f = fixture(); f.data.set('planningSharing/alice', { enabled: true, sharedCareerId: 'catalog' })
  const { c, d } = await edit(f); f.writeError = permission()
  await assert.rejects(c.confirm(d)); assert.equal(f.data.get(f.target).statusMap.B, undefined)
  assert.equal(f.data.has('planningSnapshots/alice/careers/catalog'), false)
})
test('changed user/model/catalog/instance draft rejected', async () => {
  const f = fixture('instances'), { c, d } = await edit(f)
  for (const patch of [{ uid: 'bob' }, { model: 'legacy', id: 'catalog' }, { id: 'iy' }, { catalogId: 'other' }]) {
    await assert.rejects(c.confirm({ ...d, scope: { ...d.scope, ...patch } }), /SCOPE/)
  }
  assert.equal(f.writes.length, 0)
})
