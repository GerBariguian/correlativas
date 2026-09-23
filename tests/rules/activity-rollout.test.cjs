// Invoked ONLY by the isolated Rules runner, never the Node/offline suite.
const { describe, before, after, beforeEach, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { doc, writeBatch, getDocFromServer, getDocsFromServer, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } = require('firebase/firestore')
const { initialize, claims, baseline, seed, friendship, plan, subject, TIME, CAREER, publish, assertSucceeds: allow, assertFails: deny } = require('./helpers.cjs')
const { maintenanceRules } = require('../../scripts/activity-rollout.cjs')
const finalRules = readFileSync('firestore.rules', 'utf8')
const inbox = (uid, id) => `users/${uid}/activityInbox/${id}`
const note = (type, actor, id, time = serverTimestamp()) => ({ schemaVersion: 1, type, actorUid: actor,
  target: { kind: type === 'JOINT_PLAN_INVITATION' ? 'jointPlan' : 'friendship', id }, createdAt: time, readAt: null })

async function snapshot(env, paths) {
  const result = []
  // The SDK resolves this wrapper to void, not the callback's return value.
  await env.withSecurityRulesDisabled(async context => {
    for (const path of paths) {
      const s = await getDocFromServer(doc(context.firestore(), path))
      result.push(s.exists() ? s.data() : null)
    }
  })
  assert.equal(result.length, paths.length)
  return result
}
async function deniedAtomically(env, paths, action) {
  const previous = await snapshot(env, paths)
  await deny(action())
  assert.deepEqual(await snapshot(env, paths), previous)
}

for (const paused of [false, true]) describe(paused ? 'rollout MAINTENANCE = RECOVERY' : 'rollout FINAL', () => {
  let env
  const clients = new Map()
  before(async () => { env = await initialize(paused ? maintenanceRules(finalRules) : finalRules) }, { timeout: 30000 })
  after(async () => { if (env) await env.cleanup() })
  beforeEach(async () => { clients.clear(); await baseline(env) })
  const db = (uid = 'german') => {
    if (!clients.has(uid)) clients.set(uid, env.authenticatedContext(uid, claims(uid)).firestore())
    return clients.get(uid)
  }

  async function creation(kind, modern) {
    const actor = kind === 'accept' ? 'juan' : 'german', client = db(actor), batch = writeBatch(client)
    let paths
    if (kind === 'request') {
      paths = ['friendships/german:juan', inbox('juan', 'fr_german:juan')]
      batch.set(doc(client, paths[0]), { ...friendship('german','juan','pending'), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      if (modern) batch.set(doc(client, paths[1]), note('FRIEND_REQUEST_RECEIVED',actor,'german:juan'))
    } else if (kind === 'accept') {
      await seed(env, { 'friendships/german:juan': friendship('german','juan','pending') })
      paths = ['friendships/german:juan', inbox('german', 'fa_german:juan')]
      batch.update(doc(client, paths[0]), { status: 'accepted', updatedAt: serverTimestamp() })
      if (modern) batch.set(doc(client, paths[1]), note('FRIEND_REQUEST_ACCEPTED',actor,'german:juan'))
    } else if (kind === 'plan') {
      await seed(env, { 'friendships/german:juan': friendship('german','juan') })
      paths = ['jointPlans/p', inbox('juan','jp_p')]
      batch.set(doc(client, paths[0]), { ...plan('german',['juan'],['german']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      if (modern) batch.set(doc(client, paths[1]), note('JOINT_PLAN_INVITATION',actor,'p'))
    } else {
      await seed(env, { 'jointPlans/p': plan('german',['juan'],['german']), 'friendships/german:pedro': friendship('german','pedro') })
      paths = ['jointPlans/p', inbox('pedro','jp_p')]
      batch.update(doc(client, paths[0]), { inviteeIds: ['juan','pedro'], invitedBy: { juan:'german',pedro:'german' }, updatedAt: serverTimestamp() })
      if (modern) batch.set(doc(client, paths[1]), note('JOINT_PLAN_INVITATION',actor,'p'))
    }
    if (paused || !modern) await deniedAtomically(env, paths, () => batch.commit())
    else { await allow(batch.commit()); assert.ok((await snapshot(env, paths)).every(Boolean)) }
  }
  for (const kind of ['request','accept','plan','invite']) for (const modern of [false,true]) {
    test(`${kind}: ${modern ? 'v1.15' : 'old tab'} ${paused || !modern ? 'denied without partial writes' : 'allowed atomically'}`, async () => creation(kind, modern))
  }
  test('standalone inbox and forged actor never become valid through maintenance/recovery', async () => {
    const client = db(), path = inbox('juan','fr_german:juan')
    await deniedAtomically(env,[path,'friendships/german:juan'],()=>setDoc(doc(client,path),note('FRIEND_REQUEST_RECEIVED','german','german:juan')))
    const batch=writeBatch(client)
    batch.set(doc(client,'friendships/german:juan'),{...friendship('german','juan','pending'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
    batch.set(doc(client,path),note('FRIEND_REQUEST_RECEIVED','pedro','german:juan'))
    await deniedAtomically(env,[path,'friendships/german:juan'],()=>batch.commit())
  })
  test('replay cannot recreate a deleted notification for an existing source', async () => {
    await seed(env,{'friendships/german:juan':friendship('german','juan','pending')})
    const path=inbox('juan','fr_german:juan')
    await deniedAtomically(env,[path,'friendships/german:juan'],()=>setDoc(doc(db(),path),note('FRIEND_REQUEST_RECEIVED','german','german:juan')))
  })
  test('friend request rejection remains allowed and keeps its historical notice', async () => {
    const path=inbox('juan','fr_german:juan'), value=note('FRIEND_REQUEST_RECEIVED','german','german:juan',TIME)
    await seed(env,{'friendships/german:juan':friendship('german','juan','pending'),[path]:value})
    await allow(updateDoc(doc(db('juan'),'friendships/german:juan'),{status:'rejected',updatedAt:serverTimestamp()}))
    assert.deepEqual((await snapshot(env,[path]))[0],value)
  })
  for (const joined of [false,true]) for (const modern of [false,true]) test(`${joined ? 'leave' : 'reject plan'}: ${modern ? 'atomic cleanup allowed' : 'old omission denied when notice exists'}`, async () => {
    const paths=['jointPlans/p',inbox('juan','jp_p')]
    await seed(env,{[paths[0]]:plan('german',['juan'],joined?['german','juan']:['german']),[paths[1]]:note('JOINT_PLAN_INVITATION','german','p',TIME)})
    const client=db('juan'),batch=writeBatch(client)
    batch.update(doc(client,paths[0]),{inviteeIds:[],memberIds:['german'],invitedBy:{},updatedAt:serverTimestamp()})
    if(modern)batch.delete(doc(client,paths[1]))
    if(modern){await allow(batch.commit());assert.equal((await snapshot(env,paths))[1],null)}
    else await deniedAtomically(env,paths,()=>batch.commit())
  })
  test('legacy exit with no notice is already consistent and need not be blocked',async()=>{
    await seed(env,{'jointPlans/p':plan('german',['juan'],['german'])})
    await allow(updateDoc(doc(db('juan'),'jointPlans/p'),{inviteeIds:[],memberIds:['german'],invitedBy:{},updatedAt:serverTimestamp()}))
  })
  test('reinvitation after atomic withdrawal is paused in recovery and allowed only in final',async()=>{
    const paths=['jointPlans/p',inbox('juan','jp_p')]
    await seed(env,{[paths[0]]:plan('german',['juan'],['german']),[paths[1]]:note('JOINT_PLAN_INVITATION','german','p',TIME),
      'friendships/german:juan':friendship('german','juan')})
    const guest=db('juan'),leave=writeBatch(guest)
    leave.update(doc(guest,paths[0]),{inviteeIds:[],memberIds:['german'],invitedBy:{},updatedAt:serverTimestamp()})
    leave.delete(doc(guest,paths[1]));await allow(leave.commit())
    const owner=db(),again=writeBatch(owner)
    again.update(doc(owner,paths[0]),{inviteeIds:['juan'],invitedBy:{juan:'german'},updatedAt:serverTimestamp()})
    again.set(doc(owner,paths[1]),note('JOINT_PLAN_INVITATION','german','p'))
    if(paused)await deniedAtomically(env,paths,()=>again.commit())
    else {await allow(again.commit());const notice=(await snapshot(env,paths))[1];assert.equal(notice.readAt,null);assert.ok(notice.createdAt.toMillis()>TIME.toMillis())}
  })
  test('existing invitation acceptance, rename, subjects and close remain authorized',async()=>{
    await seed(env,{'jointPlans/p':plan('german',['juan'],['german'])})
    await allow(updateDoc(doc(db('juan'),'jointPlans/p'),{memberIds:['german','juan'],updatedAt:serverTimestamp()}))
    await allow(updateDoc(doc(db(),'jointPlans/p'),{name:'Updated',updatedAt:serverTimestamp()}))
    await allow(setDoc(doc(db(),'jointPlans/p/subjects/A'),{...subject(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()}))
    await allow(updateDoc(doc(db(),'jointPlans/p'),{closed:true,updatedAt:serverTimestamp()}))
    await allow(updateDoc(doc(db(),'jointPlans/p'),{deleting:true,updatedAt:serverTimestamp()}))
    await allow(deleteDoc(doc(db(),'jointPlans/p/subjects/A')))
  })
  test('maximum final deletion requires cleanup; rollback also permits a missing slot',async()=>{
    const ids=['juan','pedro','maria','outsider'], entries={'jointPlans/p':{...plan('german',ids,['german']),closed:true}}
    for(const uid of ids.slice(1))entries[inbox(uid,'jp_p')]=note('JOINT_PLAN_INVITATION','german','p',TIME)
    await seed(env,entries)
    await allow(updateDoc(doc(db(),'jointPlans/p'),{deleting:true,updatedAt:serverTimestamp()}))
    const paths=['jointPlans/p','jointPlanTombstones/p',...ids.map(uid=>inbox(uid,'jp_p'))]
    const old=writeBatch(db());old.delete(doc(db(),paths[0]));old.set(doc(db(),paths[1]),{deletedAt:serverTimestamp()})
    await deniedAtomically(env,paths,()=>old.commit())
    const batch=writeBatch(db());batch.delete(doc(db(),paths[0]));batch.set(doc(db(),paths[1]),{deletedAt:serverTimestamp()})
    for(const path of paths.slice(2))batch.delete(doc(db(),path))
    await allow(batch.commit())
    const result=await snapshot(env,paths);assert.equal(result[0],null);assert.ok(result[1]);assert.ok(result.slice(2).every(x=>x===null))
  })
  test('own progress, projection, sharing and private inbox reads/readAt remain available',async()=>{
    const client=db(),path=inbox('german','fa_german:juan')
    await seed(env,{[path]:note('FRIEND_REQUEST_ACCEPTED','juan','german:juan',TIME)})
    await allow(updateDoc(doc(client,`users/german/careers/${CAREER}`),{statusMap:{A:'Regularizada'},updatedAt:TIME}))
    await allow(setDoc(doc(client,`users/german/careerProjections/${CAREER}`),{
      schemaVersion:2,careerId:CAREER,revisionToken:'abcdefghijklmnop',updatedAt:serverTimestamp(),
      scenario:{startPeriod:{year:2027,term:'1C'},initialCapacity:4,maxPeriods:10,capacities:[],manualPeriods:[],finalEvents:[]},
    }))
    await allow(publish(client,'german'))
    await allow(getDocsFromServer(collection(client,'users/german/activityInbox')))
    await deny(getDocFromServer(doc(db('juan'),path)))
    await allow(updateDoc(doc(client,path),{readAt:serverTimestamp()}))
    await deny(updateDoc(doc(client,path),{readAt:null}))
  })
})

test('rollout recovery after real final writes pauses new events, preserves existing inbox and can reopen strict final',async()=>{
  let env
  try {
    env=await initialize(finalRules);await baseline(env)
    let client=env.authenticatedContext('german',claims('german')).firestore(), batch=writeBatch(client)
    const source='friendships/german:juan',received=inbox('juan','fr_german:juan'),accepted=inbox('german','fa_german:juan')
    batch.set(doc(client,source),{...friendship('german','juan','pending'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
    batch.set(doc(client,received),note('FRIEND_REQUEST_RECEIVED','german','german:juan'));await allow(batch.commit())
    const before=await snapshot(env,[source,received,accepted]);await env.cleanup()
    env=await initialize(maintenanceRules(finalRules))
    assert.deepEqual(await snapshot(env,[source,received,accepted]),before)
    client=env.authenticatedContext('juan',claims('juan')).firestore();batch=writeBatch(client)
    batch.update(doc(client,source),{status:'accepted',updatedAt:serverTimestamp()});batch.set(doc(client,accepted),note('FRIEND_REQUEST_ACCEPTED','juan','german:juan'))
    await deniedAtomically(env,[source,received,accepted],()=>batch.commit())
    await deniedAtomically(env,[source,received,accepted],()=>updateDoc(doc(client,source),{status:'accepted',updatedAt:serverTimestamp()}))
    await env.cleanup();env=await initialize(finalRules)
    client=env.authenticatedContext('juan',claims('juan')).firestore();batch=writeBatch(client)
    batch.update(doc(client,source),{status:'accepted',updatedAt:serverTimestamp()});batch.set(doc(client,accepted),note('FRIEND_REQUEST_ACCEPTED','juan','german:juan'))
    await allow(batch.commit());assert.ok((await snapshot(env,[accepted]))[0])
  } finally { if(env)await env.cleanup() }
})
