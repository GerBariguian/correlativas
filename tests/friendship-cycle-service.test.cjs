const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const C1='cycle_00000000001',C2='cycle_00000000002',C3='cycle_00000000003',relation='friendships/alice:bob'
const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x))
// Optimistic transaction adapter: retries stale reads and validates ALL staged
// writes before committing. Policy stubs are not evidence of deployed Rules.
function setup(){
  const records=new Map(),reads=[],commits=[];let revision=0,deny=null,hook=null
  const auth={currentUser:{uid:'alice',emailVerified:true}}
  const context={auth,db:{},crypto:require('node:crypto').webcrypto,
    doc:(_, ...parts)=>parts.join('/'),serverTimestamp:()=>({seconds:1,nanoseconds:0}),
    runTransaction:async(_,fn)=>{
      for(let attempt=0;attempt<6;attempt++){
        const seen=revision,writes=[]
        await fn({get:async ref=>{assert.equal(writes.length,0);reads.push(ref);const data=copy(records.get(ref));if(hook)hook();return {exists:()=>data!==undefined,data:()=>data}},
          set:(ref,data)=>writes.push([ref,copy(data)]),
          update:(ref,data)=>writes.push([ref,{...copy(records.get(ref)),...copy(data)}])})
        if(seen!==revision)continue
        for(const [ref] of writes){
          if(deny?.(ref)||ref.startsWith('usedFriendshipCycles/')&&records.has(ref))throw Object.assign(new Error('denied'),{code:'permission-denied'})
        }
        for(const [ref,data] of writes)records.set(ref,data)
        if(writes.length)revision++
        commits.push(writes);return
      }
      throw new Error('conflict')
    }}
  vm.createContext(context)
  const load=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g,'').replace(/export /g,'')
  // Module scopes remain separate (domain/Activity have private helper names).
  for(const [file,names] of [
    ['friendshipCycleLogic.js',['canonicalFriendshipId','validateFriendshipCycleId','decodeFriendshipCycle','buildFriendshipCycleRequest','buildFriendshipCycleResponse','buildFriendshipCycleWithdrawal']],
    ['activityLogic.js',['activityId','newActivity','friendshipCycleActivityId','newFriendshipCycleActivity']],
    ['socialMaintenance.js',['assertSocialCreationAvailable']]]){
    Object.assign(context,vm.runInContext(`(()=>{${load(file)};return {${names.join(',')}}})()`,context))
  }
  vm.runInContext(load('services/friends.js'),context)
  return {a:context,records,reads,commits,auth,as:uid=>{auth.currentUser={uid,emailVerified:true}},deny:f=>{deny=f},hook:f=>{hook=f}}
}
const request=(h,c=C1)=>h.a.sendFriendshipCycleRequest('alice','bob',c)
test('D3 T1/T2 request reserves explicit C1 with atomic Activity',async()=>{
  const h=setup();await request(h);assert.equal(h.commits.length,1);assert.equal(h.commits[0].length,3)
  assert.equal(h.records.get(relation).cycleId,C1)
  assert.equal(h.records.get('usedFriendshipCycles/'+C1).relationshipId,'alice:bob')
  assert.equal(h.records.get('users/bob/activityInbox/fr_'+C1).friendshipCycleId,C1)
})
test('D3 T3 acceptance preserves C1 and atomic notice; replay rejected',async()=>{
  const h=setup();await request(h);h.as('bob');await h.a.respondToFriendshipCycle('bob','alice',C1,'accepted')
  assert.equal(h.commits[1].length,2);assert.equal(h.records.get(relation).cycleId,C1)
  assert.equal(h.records.get('users/alice/activityInbox/fa_'+C1).friendshipCycleId,C1)
  await assert.rejects(h.a.respondToFriendshipCycle('bob','alice',C1,'accepted'))
})
test('D3 T4 rejection cannot reuse C1',async()=>{
  const h=setup();await request(h);h.as('bob');await h.a.respondToFriendshipCycle('bob','alice',C1,'rejected')
  assert.equal(h.commits[1].length,1);h.as('alice');await assert.rejects(request(h));assert.equal(h.records.get(relation).status,'rejected')
})
test('D3 T5/T6 withdrawal history retained; C2 distinct; withdrawal retry no-op',async()=>{
  const h=setup();await request(h);const cert=copy(h.records.get('usedFriendshipCycles/'+C1));const notice=copy(h.records.get('users/bob/activityInbox/fr_'+C1))
  await h.a.withdrawFriendshipCycle('alice','bob',C1);await h.a.withdrawFriendshipCycle('alice','bob',C1);assert.equal(h.commits.at(-1).length,0)
  await request(h,C2);assert.equal(h.records.get(relation).cycleId,C2)
  assert.deepEqual(h.records.get('usedFriendshipCycles/'+C1),cert);assert.deepEqual(h.records.get('users/bob/activityInbox/fr_'+C1),notice)
})
test('D3 T7 stale C1 cannot accept/reject/withdraw C2',async()=>{
  const h=setup();await request(h);await h.a.withdrawFriendshipCycle('alice','bob',C1);await request(h,C2);h.as('bob')
  for(const status of ['accepted','rejected'])await assert.rejects(h.a.respondToFriendshipCycle('bob','alice',C1,status),/STALE/)
  await assert.rejects(h.a.withdrawFriendshipCycle('bob','alice',C1),/STALE/)
  assert.equal(h.records.get(relation).cycleId,C2)
})
test('D3 T8 older reserved C1 denied atomically by reservation policy',async()=>{
  const h=setup();await request(h);await h.a.withdrawFriendshipCycle('alice','bob',C1);await request(h,C2);await h.a.withdrawFriendshipCycle('alice','bob',C2)
  const before=copy([...h.records]);await assert.rejects(request(h),{code:'permission-denied'});assert.deepEqual([...h.records],before)
})
test('D3 T9 concurrent attempts retry: only one current cycle/reservation/notice',async()=>{
  const h=setup();const results=await Promise.allSettled([request(h),request(h,C2)])
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.records.size,3);assert.equal(h.commits.length,1)
})
for(const [label,fragment] of [['T10','activityInbox'],['T11','friendships/']])test('D3 '+label+' failure leaves no partial request',async()=>{
  const h=setup();h.deny(ref=>ref.includes(fragment));await assert.rejects(request(h),{code:'permission-denied'});assert.equal(h.records.size,0)
})
test('D3 acceptance notice failure preserves pending source',async()=>{
  const h=setup();await request(h);h.as('bob');h.deny(ref=>ref.includes('activityInbox'))
  await assert.rejects(h.a.respondToFriendshipCycle('bob','alice',C1,'accepted'));assert.equal(h.records.get(relation).status,'pending');assert.equal(h.records.size,3)
})
test('D3 T12 no session rejects before reads/writes',async()=>{
  const h=setup();h.auth.currentUser=null;await assert.rejects(request(h));assert.equal(h.reads.length,0);assert.equal(h.commits.length,0)
})
test('D3 T13 session replacement during read aborts',async()=>{
  const h=setup();h.hook(()=>h.as('alice'));await assert.rejects(request(h),/sesión/);assert.equal(h.records.size,0)
})
test('D3 T13 session replacement after commit never reports success',async()=>{
  const h=setup(),run=h.a.runTransaction;h.a.runTransaction=async(...args)=>{await run(...args);h.as('bob')}
  await assert.rejects(request(h));assert.equal(h.records.size,3) // committed work cannot be rolled back by a session check
})
test('D3 T14 actor spoof and nonrecipient response rejected',async()=>{
  const h=setup();await assert.rejects(h.a.sendFriendshipCycleRequest('eve','bob',C1));await request(h)
  await assert.rejects(h.a.respondToFriendshipCycle('alice','bob',C1,'accepted'));assert.equal(h.records.get(relation).status,'pending')
})
test('D3 T15/T16 only explicit friendship reads, no fallback on denial',async()=>{
  const h=setup();h.deny(()=>true);await assert.rejects(request(h));assert.deepEqual(h.reads,[relation,'friendships/bob:alice']);assert.equal(h.commits.length,0)
})
test('D3 legacy and inverse records are not converted',async()=>{
  for(const p of [relation,'friendships/bob:alice']){const h=setup();h.records.set(p,{status:'rejected'});await assert.rejects(request(h));assert.equal(h.records.size,1)}
})
test('D3 opaque cryptographic ID without weak fallback',()=>{
  const h=setup(),one=h.a.generateFriendshipCycleId(),two=h.a.generateFriendshipCycleId();assert.match(one,/^[a-f0-9]{32}$/);assert.notEqual(one,two)
  h.a.crypto=undefined;assert.throws(()=>h.a.generateFriendshipCycleId())
})
