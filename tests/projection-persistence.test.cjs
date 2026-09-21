const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
const clean = s => s.replace(/^import .*$/gm, '').replace(/export /g, '')
const context = { setTimeout, clearTimeout }
vm.createContext(context)
for (const f of ['src/projectionPersistenceLogic.js', 'src/projectionPersistenceController.js']) vm.runInContext(clean(read(f)), context)
const scenario = (capacity = 4) => ({ startPeriod: { year: 2027, term: '1C' }, initialCapacity: capacity, maxPeriods: 40, capacities: [], manualPeriods: [], finalEvents: [] })
const plain = x => JSON.parse(JSON.stringify(x))
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return { promise, resolve, reject } }
function fixture(data = null) {
  let remote = data, count = 0, loadError = null, saveGate = null, resetError = null
  const jobs = new Map(); let id=0
  const clock = { setTimeout(fn, ms) { assert.equal(ms, 800); jobs.set(++id, fn); return id }, clearTimeout(i) { jobs.delete(i) } }
  const repo = {
    async load() { if (loadError) throw new Error(loadError); return remote },
    async save(value, expected, alive) {
      count++
      if (saveGate) await saveGate.promise
      if (!alive()) throw new Error('PROJECTION_SESSION_CHANGED')
      if ((remote?.revisionToken ?? null) !== expected) throw new Error('PROJECTION_CONFLICT')
      remote = { scenario: plain(value), revisionToken: `revision-token-${count}` }
      return remote.revisionToken
    },
    async reset(expected) {
      if (resetError) throw new Error(resetError)
      if ((remote?.revisionToken ?? null) !== expected) throw new Error('PROJECTION_CONFLICT')
      remote = null
    },
  }
  const controller = context.createProjectionController(repo, () => {}, clock)
  return { controller, repo, jobs, clock, count: () => count, remote: () => remote,
    remoteSet: value => { remote=value }, failLoad: e => { loadError=e }, gate: g => { saveGate=g }, failReset: e => { resetError=e },
    async advance() { const list=[...jobs.values()]; jobs.clear(); list.forEach(fn => fn()); await tick() } }
}

test('persistence round-trip preserves manual empty periods and excludes all derived fields', () => {
  const s=scenario(); s.manualPeriods=[{ period:{ year:2028,term:'2C' }, codes:[] }]
  const data={ schemaVersion:1,careerId:'career',revisionToken:'abcdefghijklmnop',scenario:s,updatedAt:{toMillis:()=>1} }
  assert.deepEqual(plain(context.decodeProjection(data,'career').scenario),s)
  for (const field of ['statusMap','timeline','sharing','result']) assert.throws(()=>context.decodeProjection({...data,[field]:{}},'career'))
  assert.throws(()=>context.decodeProjection({...data,schemaVersion:2},'career'), /INCOMPATIBLE/)
  assert.throws(()=>context.decodeProjection(data,'other'))
  assert.throws(()=>context.normalizeProjectionScenario({...s,finalEvents:[{code:'A'}]}))
  assert.throws(()=>context.normalizeProjectionScenario({...s,manualPeriods:[{period:s.startPeriod,codes:['A','A']}]}))
  // Removed catalog codes and past placements remain decisions; the engine diagnoses them.
  assert.equal(context.normalizeProjectionScenario({...s,manualPeriods:[{period:{year:2020,term:'1C'},codes:['REMOVED']}]}).manualPeriods.length,1)
})

test('default timer adapter preserves browser global receiver for scheduling and cancellation', async () => {
  const browser = { jobs: new Map(), nextTimer: 0 }
  vm.createContext(browser)
  vm.runInContext(`
    globalThis.setTimeout = function(callback, delay) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      if (delay !== 800) throw new Error('Wrong debounce')
      jobs.set(++nextTimer, callback); return nextTimer
    }
    globalThis.clearTimeout = function(id) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      jobs.delete(id)
    }
  `, browser)
  // Demonstrate the original failure with receiver-sensitive browser semantics.
  assert.throws(() => vm.runInContext('({ setTimeout }).setTimeout(() => {}, 800)', browser), /Illegal invocation/)
  for (const file of ['src/projectionPersistenceLogic.js', 'src/projectionPersistenceController.js']) vm.runInContext(clean(read(file)), browser)
  const f = fixture(), controller = browser.createProjectionController(f.repo)
  await controller.load(); controller.change(scenario()); await tick()
  assert.equal(f.count(), 1)
  controller.change(scenario(5)); controller.change(scenario(9))
  assert.equal(browser.jobs.size, 1)
  assert.equal(controller.getState().phase, 'saving')
  const callback = [...browser.jobs.values()][0]; browser.jobs.clear(); callback(); await tick()
  assert.equal(f.count(), 2); assert.equal(f.remote().scenario.initialCapacity, 9)
  assert.equal(controller.getState().phase, 'saved')
  controller.change(scenario(7)); controller.dispose(); assert.equal(browser.jobs.size, 0)
})

for (const failingMethod of ['setTimeout', 'clearTimeout']) {
  test(`timer ${failingMethod} failure preserves draft, exits Saving, and permits retry`, async () => {
    const f = fixture(); await f.controller.load(); f.controller.change(scenario()); await tick()
    if (failingMethod === 'clearTimeout') f.controller.change(scenario(5))
    f.clock[failingMethod] = () => { throw new TypeError('Illegal invocation') }
    assert.doesNotThrow(() => f.controller.change(scenario(9)))
    assert.equal(f.controller.getState().phase, 'error')
    assert.equal(f.controller.getState().scenario.initialCapacity, 9)
    await f.advance() // A cancellation failure must not allow an obsolete callback to write.
    assert.equal(f.count(), 1)
    await f.controller.retry()
    assert.equal(f.controller.getState().phase, 'saved')
    assert.equal(f.remote().scenario.initialCapacity, 9)
  })
}
test('loading absent document and drafts never write; first generation saves once and no-op never writes', async()=>{
  const f=fixture(); await f.controller.load()
  assert.equal(f.controller.getState().phase,'empty'); assert.equal(f.count(),0)
  f.controller.change(scenario()); await tick()
  assert.equal(f.count(),1); assert.equal(f.controller.getState().phase,'saved')
  f.controller.change(scenario()); await f.advance(); assert.equal(f.count(),1)
})
test('load failures do not become absence or defaults; retry and existing documents load without writes', async()=>{
  const f=fixture(); f.failLoad('permission'); await f.controller.load()
  assert.equal(f.controller.getState().phase,'load-error')
  f.controller.change(scenario()); assert.equal(f.count(),0)
  f.failLoad(null); await f.controller.retry(); assert.equal(f.controller.getState().phase,'empty')
  for(const error of ['INVALID_PROJECTION_DOCUMENT','INCOMPATIBLE_PROJECTION_VERSION']) {
    const broken=fixture(); broken.failLoad(error); await broken.controller.load()
    assert.equal(broken.controller.getState().error,error); assert.equal(broken.count(),0)
  }
  const loaded=fixture({scenario:scenario(),revisionToken:'existing-revision'}); await loaded.controller.load()
  assert.equal(loaded.controller.getState().phase,'saved'); assert.equal(loaded.count(),0)
})
test('debounce coalesces edits and survives route navigation without a controller disposal', async()=>{
  const f=fixture(); await f.controller.load(); f.controller.change(scenario()); await tick()
  for(const n of [3,5,7]) f.controller.change(scenario(n))
  assert.equal(f.count(),1); assert.equal(f.jobs.size,1)
  // Route unmount does not own this controller. The App-level context remains alive.
  await f.advance(); assert.equal(f.count(),2); assert.equal(f.remote().scenario.initialCapacity,7)
})
test('one in-flight write retains only latest local change and confirms saved only after acknowledgement', async()=>{
  const f=fixture(), gate=deferred(); await f.controller.load(); f.gate(gate)
  f.controller.change(scenario()); f.controller.change(scenario(5)); f.controller.change(scenario(9))
  await f.advance(); assert.equal(f.count(),1); assert.equal(f.controller.getState().phase,'saving')
  gate.resolve(); await tick(); await f.advance()
  assert.equal(f.count(),2); assert.equal(f.remote().scenario.initialCapacity,9)
  assert.equal(f.controller.getState().phase,'saved')
})
test('concurrent remote revision blocks save, keeps local draft and never silently overwrites', async()=>{
  const f=fixture(); await f.controller.load(); f.controller.change(scenario()); await tick()
  f.remoteSet({scenario:scenario(2),revisionToken:'other-device'})
  f.controller.change(scenario(7)); await f.advance()
  assert.equal(f.controller.getState().phase,'conflict')
  assert.equal(f.controller.getState().scenario.initialCapacity,7)
  assert.equal(f.remote().scenario.initialCapacity,2)
  f.controller.change(scenario(8)); await f.advance(); assert.equal(f.count(),2)
})
test('session disposal cancels debounce and suppresses late results; careers have independent queues', async()=>{
  const a=fixture(),b=fixture(); await a.controller.load(); await b.controller.load()
  const gate=deferred(); a.gate(gate); a.controller.change(scenario(3)); a.controller.dispose()
  b.controller.change(scenario(7)); gate.resolve(); await tick()
  assert.equal(a.remote(),null); assert.equal(b.remote().scenario.initialCapacity,7)
  b.controller.change(scenario(8)); b.controller.dispose(); await b.advance()
  assert.equal(b.remote().scenario.initialCapacity,7)
})
test('reset orders in-flight save and cancels pending autosave, so deleted document stays absent', async()=>{
  const f=fixture(),gate=deferred(); await f.controller.load(); f.gate(gate)
  f.controller.change(scenario()); f.controller.change(scenario(7))
  const reset=f.controller.reset(); gate.resolve(); await reset; await f.advance()
  assert.equal(f.remote(),null); assert.equal(f.controller.getState().phase,'empty'); assert.equal(f.count(),1)
})
test('reset failure or conflict preserves scenario and never reports success', async()=>{
  for(const error of ['offline','PROJECTION_CONFLICT']) {
    const f=fixture(); await f.controller.load(); f.controller.change(scenario()); await tick()
    f.failReset(error); await f.controller.reset()
    assert.ok(f.controller.getState().scenario); assert.ok(f.remote())
    assert.equal(f.controller.getState().phase,error==='offline'?'error':'conflict')
  }
})
test('save failure keeps local draft and retry confirms it without automatic approval', async()=>{
  const f=fixture(),gate=deferred(); await f.controller.load(); f.gate(gate)
  f.controller.change(scenario()); gate.reject(new Error('offline')); await tick()
  assert.equal(f.controller.getState().phase,'error'); assert.ok(f.controller.getState().scenario)
  f.gate(null); await f.controller.retry(); assert.equal(f.controller.getState().phase,'saved')
})

test('reset retry retries deletion rather than saving the abandoned draft', async()=>{
  const f=fixture(); await f.controller.load(); f.controller.change(scenario()); await tick()
  f.failReset('offline'); await f.controller.reset(); assert.ok(f.remote())
  f.failReset(null); await f.controller.retry()
  assert.equal(f.remote(),null); assert.equal(f.controller.getState().phase,'empty')
})

test('reentering reloads clean remote state but never replaces dirty or conflicted local decisions', async()=>{
  const f=fixture(); await f.controller.load(); f.controller.change(scenario()); await tick()
  f.remoteSet({scenario:scenario(8),revisionToken:'remote-revision'}); await f.controller.load()
  assert.equal(f.controller.getState().scenario.initialCapacity,8)
  f.controller.change(scenario(6)); await f.controller.load()
  assert.equal(f.controller.getState().scenario.initialCapacity,6)
})

test('actual hook retains debounces across navigation/careers and disposes old authenticated session', async()=>{
  const fixtures=new Map(), slots=[], effects=[]; let cursor=0, pending=[]
  const api={
    useRef(value) { const i=cursor++; return slots[i]??(slots[i]={current:value}) },
    useState(value) { const i=cursor++; if(!(i in slots)) slots[i]=value; return [slots[i],fn=>{slots[i]=typeof fn==='function'?fn(slots[i]):fn}] },
    useEffect(fn,deps) { const i=cursor++; if(!effects[i]||deps.some((d,j)=>d!==effects[i].deps[j])) pending.push({i,fn,deps}) },
    projectionRepository(uid,career) { const key=`${uid}:${career}`; if(!fixtures.has(key)) fixtures.set(key,fixture()); return fixtures.get(key).repo },
    createProjectionController(repo,notify) {
      const f=[...fixtures.values()].find(f=>f.repo===repo)
      return context.createProjectionController(repo,notify,f.clock)
    },
  }
  vm.createContext(api)
  vm.runInContext(read('src/hooks/useCareerProjection.js').replace(/^import .*$/gm,'').replace('export default ',''),api)
  const render=(user,career,visible)=>{
    cursor=0;pending=[]; const value=api.useCareerProjection(user,career,visible)
    const work=pending; work.forEach(({i})=>effects[i]?.cleanup?.())
    work.forEach(({i,fn,deps})=>{effects[i]={deps,cleanup:fn()}})
    return value
  }
  const a={uid:'a'},b={uid:'b'}
  render(a,'one',true); await tick(); let value=render(a,'one',true)
  value.change(scenario()); await tick(); value=render(a,'one',true); value.change(scenario(7))
  render(a,'one',false); await fixtures.get('a:one').advance()
  assert.equal(fixtures.get('a:one').remote().scenario.initialCapacity,7)
  render(a,'two',true); await tick(); render(a,'two',true).change(scenario(3)); await tick()
  assert.equal(fixtures.get('a:two').remote().scenario.initialCapacity,3)
  render(a,'two',true).change(scenario(9))
  render(b,'two',true); await tick(); await fixtures.get('a:two').advance()
  assert.equal(fixtures.get('a:two').remote().scenario.initialCapacity,3)
  assert.equal(render(b,'two',true).scenario,null)
})

test('progress listener emits only server-confirmed progress and never writes academic data', ()=>{
  let listener, errors, stopped=false; const updates=[]
  const api={ doc:(_db,...p)=>p.join('/'),db:{},onSnapshot:(ref,options,next,error)=>{
    assert.equal(ref,'users/a/careers/c'); assert.equal(options.includeMetadataChanges,true)
    listener=next;errors=error; return()=>{stopped=true}
  }}
  vm.createContext(api); vm.runInContext(clean(read('src/services/firestore.js')),api)
  const stop=api.subscribeUserStatus('a','c',map=>updates.push(map),()=>updates.push('error'))
  const snap=(cache,pending,exists=true)=>({metadata:{fromCache:cache,hasPendingWrites:pending},exists:()=>exists,data:()=>({statusMap:{A:'Aprobada'}})})
  listener(snap(true,false)); listener(snap(false,true)); assert.equal(updates.length,0)
  listener(snap(false,false)); assert.deepEqual(updates[0],{A:'Aprobada'})
  listener(snap(false,false,false)); assert.equal(updates[1],null)
  errors(new Error('permission')); assert.equal(updates[2],'error'); stop(); assert.equal(stopped,true)
})

test('actual repository uses exact private path, transaction revision and session checks', async()=>{
  const store=new Map(), user={uid:'a'}, auth={currentUser:user}; let token=0
  const api={...context, auth, db:{}, crypto:{randomUUID:()=>`revision-token-${++token}`},
    doc:(_db,...parts)=>parts.join('/'), serverTimestamp:()=>({toMillis:()=>1}),
    getDocFromServer:async ref=>({exists:()=>store.has(ref),data:()=>store.get(ref)}),
    runTransaction:async(_db,fn)=>fn({get:async ref=>({exists:()=>store.has(ref),data:()=>store.get(ref)}),set:(ref,data)=>store.set(ref,data),delete:ref=>store.delete(ref)}) }
  vm.createContext(api)
  vm.runInContext(clean(read('src/services/careerProjections.js')),api)
  const repo=api.projectionRepository('a','career'),other=api.projectionRepository('a','other')
  assert.equal(await repo.load(),null)
  const rev=await repo.save(scenario(),null)
  assert.equal(store.size,1); assert.ok(store.has('users/a/careerProjections/career'))
  await assert.rejects(repo.save(scenario(7),null),/CONFLICT/)
  await other.save(scenario(9),null); assert.equal(store.size,2)
  assert.equal((await repo.load()).scenario.initialCapacity,4)
  await assert.rejects(repo.reset('wrong'),/CONFLICT/)
  await repo.reset(rev); assert.equal(await repo.load(),null); assert.equal(store.size,1)
  auth.currentUser={uid:'b'}
  await assert.rejects(repo.load(),/SESSION/); await assert.rejects(repo.save(scenario(),null),/SESSION/)
})
