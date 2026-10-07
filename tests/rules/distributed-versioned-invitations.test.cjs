// CREATE E feasibility gate before completing INVITE/reinvite. Full actual Rules extended in memory.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const h = require('./helpers.cjs')
const { distributed: versionedInvitations } = require('./fixtures/distributed-versioned-invitations.cjs')
let source = fs.readFileSync('tests/rules/joint-join-diagnostic.test.cjs', 'utf8')
source = source.slice(0, source.indexOf("for (const variant of ['real', 'join-only'])"))
const { fixture } = new Function('require', source + '\nreturn {fixture}')(require)
const CYCLE = 'cycle_00000000001'
function input(count, orientation) {
  const entries = fixture(1), plan = entries['jointPlans/p']
  delete entries['jointPlans/p']
  for (const key of Object.keys(entries).filter(k => k.includes('/activityInbox/'))) delete entries[key]
  plan.inviteeIds = plan.inviteeIds.slice(0, count)
  plan.participants = Object.fromEntries(Object.entries(plan.participants).filter(([id]) => id === 'owner' || plan.inviteeIds.includes(id)))
  plan.invitedBy = Object.fromEntries(plan.inviteeIds.map(id => [id, 'owner']))
  plan.invitationSerial = count
  plan.invitationCycles = Object.fromEntries(plan.inviteeIds.map(id => [id, CYCLE]))
  plan.invitationOccurrences = Object.fromEntries(plan.inviteeIds.map((id, i) => [id, i + 1]))
  plan.createdAt = sdk.serverTimestamp(); plan.updatedAt = sdk.serverTimestamp()
  plan.inviteeIds.forEach((uid, i) => {
    const path = 'friendships/owner:' + uid
    entries[path].cycleId = CYCLE
    if (orientation === 'inverse' || (orientation === 'mixed' && i % 2)) {
      entries['friendships/' + uid + ':owner'] = entries[path]; delete entries[path]
    }
  })
  return { entries, plan }
}
function create(db, plan) {
  const batch = sdk.writeBatch(db)
  batch.set(sdk.doc(db, 'jointPlans/p'), plan)
  for (const uid of plan.inviteeIds) {
    const occurrence = plan.invitationOccurrences[uid]
    batch.set(sdk.doc(db, 'users', uid, 'activityInbox', `jp_p_${occurrence}`), {
      schemaVersion: 2, type: 'JOINT_PLAN_INVITATION', actorUid: 'owner', createdAt: sdk.serverTimestamp(), readAt: null,
      target: { kind: 'jointPlan', id: 'p' }, friendshipCycleId: plan.invitationCycles[uid], occurrence,
    })
  }
  return batch.commit()
}
test('complete CREATE E + versioned notices valid path feasibility', async t => {
  const rules = versionedInvitations(fs.readFileSync('firestore.rules', 'utf8'))
  fs.writeFileSync('.tools/distributed-versioned-invitations-generated.rules', rules)
  const env = await h.initialize(rules)
  try {
    for (const count of [1, 2, 3, 4]) for (const orientation of ['direct', 'inverse', 'mixed']) await t.test(`${count} ${orientation}`, async t => {
      await env.clearFirestore(); const { entries, plan } = input(count, orientation); await h.seed(env, entries)
      let error
      try { await create(env.authenticatedContext('owner', h.claims('owner')).firestore(), plan) } catch (e) { error = e }
      t.diagnostic(JSON.stringify({ count, orientation, allowed: !error, code: error?.code, expressions: /1000 expressions/.test(error?.message || '') }))
      if (error) await env.withSecurityRulesDisabled(async c => {
        assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(), 'jointPlans/p'))).exists(), false)
        for (const uid of plan.inviteeIds) assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), 'users', uid, 'activityInbox'))).size, 0)
      })
      assert.equal(error, undefined)
    })
  } finally { await env.cleanup() }
})

function writes(plan) {
  return [['jointPlans/p', plan], ...plan.inviteeIds.map(uid => ['users/' + uid + '/activityInbox/jp_p_' + plan.invitationOccurrences[uid], {
    schemaVersion: 2, type: 'JOINT_PLAN_INVITATION', actorUid: 'owner', createdAt: sdk.serverTimestamp(), readAt: null,
    target: { kind: 'jointPlan', id: 'p' }, friendshipCycleId: plan.invitationCycles[uid], occurrence: plan.invitationOccurrences[uid],
  }])]
}
async function commit(env, list, uid = 'owner') {
  const db = env.authenticatedContext(uid, h.claims(uid)).firestore(), b = sdk.writeBatch(db)
  for (const [path, data] of list) b.set(sdk.doc(db, path), data)
  return b.commit()
}
const negatives = {
  'parent without notices': x => { x.w = x.w.slice(0, 1) },
  'notices without parent': x => { x.w = x.w.slice(1) },
  'missing one notice': x => { x.w.pop() },
  'extra notice': x => { x.w.push(['users/one/activityInbox/jp_p_99', { ...x.w[1][1], occurrence: 99 }]) },
  'wrong recipient': x => { x.w[1][0] = 'users/two/activityInbox/jp_p_1' },
  'wrong actor': x => { x.w[1][1].actorUid = 'two' },
  'wrong plan': x => { x.w[1][1].target.id = 'other' },
  'wrong occurrence': x => { x.w[1][1].occurrence = 2 },
  'wrong cycle': x => { x.w[1][1].friendshipCycleId = 'cycle_00000000002' },
  'stale cycle both source and notice': x => { x.plan.invitationCycles.one = 'cycle_00000000002'; x.w[1][1].friendshipCycleId = 'cycle_00000000002' },
  'reused occurrence across recipients': x => { x.plan.invitationOccurrences.two = 1; x.w[2][0] = 'users/two/activityInbox/jp_p_1'; x.w[2][1].occurrence = 1 },
  'spoof inviter despite owner friendship': x => { x.plan.invitedBy.one = 'two'; x.w[1][1].actorUid = 'two' },
  'friendship absent': x => { delete x.entries['friendships/owner:one'] },
  'friendship withdrawn': x => { x.entries['friendships/owner:one'].status = 'withdrawn' },
  'two orientations': x => { x.entries['friendships/one:owner'] = { ...x.entries['friendships/owner:one'] } },
  'resolved invited binding': x => { x.plan.participants.one = { bindingState: 'resolved', careerInstanceId: 'i_one' } },
  'extra binding field': x => { x.plan.participants.one.extra = true },
  'missing binding': x => { delete x.plan.participants.one },
  'archived owner': x => { x.entries['users/owner/careerInstances/i_owner'].lifecycle = 'archived' },
  'frozen owner': x => { x.entries['migrationUsers/owner'].authority = 'frozen' },
  'frozen recipient': x => { x.entries['migrationUsers/one'].authority = 'frozen' },
  'wrong catalog': x => { x.plan.catalogId = 'other' },
  'over capacity': x => { x.plan.inviteeIds.push('five'); x.plan.participants.five = { bindingState: 'unresolved', careerInstanceId: null }; x.plan.invitedBy.five = 'owner'; x.plan.invitationSerial = 5; x.plan.invitationCycles.five = CYCLE; x.plan.invitationOccurrences.five = 5 },
  'historical notice cannot cover invitation': x => { x.entries[x.w[1][0]] = { ...x.w[1][1], createdAt: h.TIME }; x.w.splice(1,1) },
  'historical notice overwrite': x => { x.entries[x.w[1][0]] = { ...x.w[1][1], createdAt: h.TIME } },
  'cross-plan path': x => { x.w[1][0] = 'users/one/activityInbox/jp_other_1' },
  'cross-invitee swapped notices': x => { const p=x.w[1][0]; x.w[1][0]=x.w[2][0]; x.w[2][0]=p },
  'one notice for two invitations': x => { x.w.splice(2,1); x.plan.invitationOccurrences.two = 1 },
  'nonzero initial serial': x => { x.plan.invitationSerial = 8 },
  'extra source field': x => { x.plan.extra = true },
  'extra notice field': x => { x.w[1][1].extra = true },
  'wrong timestamp': x => { x.w[1][1].createdAt = h.TIME },
  'pre-read notice': x => { x.w[1][1].readAt = h.TIME },
  'duplicate invitee': x => { x.plan.inviteeIds[1] = 'one' },
  'closed create': x => { x.plan.closed = true },
  'owner spoof': x => { x.plan.ownerId = 'two' },
}
test('distributed CREATE negative corpus, exact rollback', async t => {
  const env = await h.initialize(versionedInvitations(fs.readFileSync('firestore.rules','utf8')))
  try {
    for (const [name, mutate] of Object.entries(negatives)) await t.test(name, async t => {
      await env.clearFirestore(); const x = input(4,'direct'); x.w = writes(x.plan); mutate(x); await h.seed(env,x.entries)
      let error; try { await commit(env,x.w) } catch(e) { error=e }
      assert.equal(error?.code,'permission-denied'); t.diagnostic(JSON.stringify({name, expressions:/1000 expressions/.test(error.message)}))
      await env.withSecurityRulesDisabled(async c => {
        for (const [path] of x.w) {
          const snap=await sdk.getDocFromServer(sdk.doc(c.firestore(),path))
          assert.equal(snap.exists(), Object.hasOwn(x.entries,path), path)
          if(snap.exists()) assert.deepEqual(snap.data(), x.entries[path])
        }
      })
    })
  } finally { await env.cleanup() }
})
test('concurrent identical CREATE preserves exactly one atomic result', async t => {
  const env = await h.initialize(versionedInvitations(fs.readFileSync('firestore.rules','utf8')))
  try {
    for(let i=0;i<8;i++) await t.test('race '+i,async()=>{
      await env.clearFirestore();const x=input(4,i%2?'inverse':'direct');await h.seed(env,x.entries)
      const r=await Promise.allSettled([commit(env,writes(x.plan)),commit(env,writes(x.plan))])
      assert.equal(r.filter(v=>v.status==='fulfilled').length,1)
      assert.equal(r.find(v=>v.status==='rejected').reason.code,'permission-denied')
      await env.withSecurityRulesDisabled(async c=>{
        assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),'jointPlans/p'))).exists(),true)
        for(const u of x.plan.inviteeIds)assert.equal((await sdk.getDocs(sdk.collection(c.firestore(),'users',u,'activityInbox'))).size,1)
      })
    })
  } finally {await env.cleanup()}
})
test('distributed CREATE independent access padding', async t => {
  for(const operation of ['parent','child','aggregate']) await t.test(operation,async t=>{
    const results=[]
    for(let n=0;n<=7;n++) {
      let rules=versionedInvitations(fs.readFileSync('firestore.rules','utf8'))
      const pad=Array.from({length:n},(_,i)=>`get(/databases/$(database)/documents/paddingDocs/p${i}).data.allowed == true`).join(' && ') || 'true'
      if(operation==='parent') rules=rules.replace('&& request.resource.data.invitationSerial ==',()=>`&& (${pad}) && request.resource.data.invitationSerial ==`)
      if(operation==='child') rules=rules.replace('&& !exists(path) && validCreationRecipient(p);',()=>`&& !exists(path) && validCreationRecipient(p) && (uid != 'one' || (${pad}));`)
      if(operation==='aggregate') rules=rules.replace('function signedIn()',()=>`match /paddingWrite/p { allow create: if ${pad}; } function signedIn()`)
      const env=await h.initialize(rules)
      try {
        await env.clearFirestore();const x=input(4,'mixed');for(let i=0;i<n;i++)x.entries['paddingDocs/p'+i]={allowed:true};await h.seed(env,x.entries)
        const list=writes(x.plan);if(operation==='aggregate')list.push(['paddingWrite/p',{ok:true}])
        let error;try{await commit(env,list)}catch(e){error=e}
        if(error)assert.equal(error.code,'permission-denied')
        results.push({n,allowed:!error,expressions:/1000 expressions/.test(error?.message||'')})
      }finally{await env.cleanup()}
    }
    t.diagnostic(JSON.stringify({operation,results}))
    assert.equal(results[0].allowed,true)
    assert.equal(results.some(r=>!r.allowed),true)
  })
})

test('calibration controls: isolate rejection alternatives without weakening valid predicates', async t => {
  for(const [operation,count,max] of [['parent',1,8],['child',1,8],['aggregate',4,2]]) await t.test(operation,async t=>{
    const results=[]
    for(let n=0;n<=max;n++) {
      let rules=versionedInvitations(fs.readFileSync('firestore.rules','utf8'))
      // Diagnostic only: suppress unrelated create/update allow branches on failure.
      rules=rules.replace('allow create: if socialUser() && validPlan()', 'allow create: if false && socialUser() && validPlan()')
        .replace('allow create: if socialUser() && activityCreationEnabled() && validNotice()', 'allow create: if false && socialUser() && activityCreationEnabled() && validNotice()')
        .replaceAll('allow update: if ', 'allow update: if false && ')
      const pad=Array.from({length:n},(_,i)=>`get(/databases/$(database)/documents/calibration/p${i}).data.allowed == true`).join(' && ') || 'true'
      if(operation==='parent')rules=rules.replace('&& request.resource.data.invitationSerial ==',()=>`&& (${pad}) && request.resource.data.invitationSerial ==`)
      if(operation==='child')rules=rules.replace('&& !exists(path) && validCreationRecipient(p);',()=>`&& !exists(path) && validCreationRecipient(p) && (${pad});`)
      if(operation==='aggregate')rules=rules.replace('function signedIn()',()=>`match /paddingWrite/p { allow create: if ${pad}; } function signedIn()`)
      const env=await h.initialize(rules)
      try{
        await env.clearFirestore();const x=input(count,'inverse');for(let i=0;i<n;i++)x.entries['calibration/p'+i]={allowed:true};await h.seed(env,x.entries)
        const list=writes(x.plan);if(operation==='aggregate')list.push(['paddingWrite/p',{ok:true}])
        let error;try{await commit(env,list)}catch(e){error=e}
        results.push({n,allowed:!error,expressions:/1000 expressions/.test(error?.message||''), message:error?.message})
      }finally{await env.cleanup()}
    }
    t.diagnostic(JSON.stringify({control:operation,count,results})); const boundary={parent:7,child:5,aggregate:0}[operation]; assert.deepEqual(results.map(r=>r.allowed),results.map(r=>r.n<=boundary)); assert.equal(results.some(r=>r.expressions),false)
  })
})
