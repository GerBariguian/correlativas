const {test}=require('node:test'),assert=require('node:assert/strict')
const {loadRepository}=require('./activity-harness.cjs')
const data=(seconds=100,readAt=null)=>({schemaVersion:1,type:'JOINT_PLAN_INVITATION',actorUid:'actor',createdAt:{seconds,nanoseconds:0},target:{kind:'jointPlan',id:'p'},readAt})
function harness() {
 const auth={currentUser:{uid:'a',emailVerified:true}},listeners=[],writes=[]
 let record=data(),afterRead=()=>{},callbacks=1
 class Timestamp {constructor(seconds,nanoseconds){Object.assign(this,{seconds,nanoseconds})}static now(){return new Timestamp(10000000,12)}}
 const sdk={Timestamp,collection:(_,...path)=>path.join('/'),doc:(_,...path)=>path.join('/'),where:(...args)=>['where',...args],orderBy:(...args)=>['orderBy',...args],documentId:()=>'__name__',limit:n=>['limit',n],query:(...args)=>args,serverTimestamp:()=>({server:true}),
 onSnapshot:(q,options,next,error)=>{const l={q,options,next,error,stopped:false};listeners.push(l);return()=>{l.stopped=true}},
 runTransaction:async(_,callback)=>{let result;for(let i=0;i<callbacks;i++){const pending=[];result=await callback({get:async()=>{const copy=record;afterRead();return {exists:()=>!!copy,data:()=>copy}},update:(...args)=>pending.push(args)});if(i===callbacks-1)writes.push(...pending)}return result}}
 const api=loadRepository(sdk,{},auth)
 return {auth,listeners,writes,api,repo:api.activityRepository('a'),set:v=>record=v,after:f=>afterRead=f,retries:n=>callbacks=n}
}
function snapshot(records,metadata={fromCache:false,hasPendingWrites:false}) {return {docs:records.map(([id,value])=>({id,data:()=>value})),size:records.length,metadata}}
test('activity repository owns two bounded queries and adapts timestamps',()=>{
 const h=harness();h.repo.subscribe('recent',()=>{},()=>{});h.repo.subscribe('unread',()=>{},()=>{})
 assert.equal(h.listeners[0].q[0],'users/a/activityInbox')
 assert.deepEqual(h.listeners.map(l=>l.q.at(-1)),[['limit',30],['limit',51]])
 assert.deepEqual(h.listeners[0].q.slice(-3,-1),[['orderBy','createdAt','desc'],['orderBy','__name__','asc']])
 assert.equal(h.listeners[0].q[1][3].seconds,10000000-90*86400)
 assert.equal(h.listeners[1].q[2][1],'readAt')
 assert.deepEqual(h.api.activityNow(),{seconds:10000000,nanoseconds:12})
})
test('activity repository normalizes, orders, drops invalid data and stops callbacks',()=>{
 const h=harness(),values=[],errors=[];const stop=h.repo.subscribe('recent',x=>values.push(x),x=>errors.push(x))
 h.listeners[0].next(snapshot([['jp_p',data()],['jp_z',{...data(),target:{kind:'jointPlan',id:'z'}}],['bad',{email:'secret'}]]))
 assert.deepEqual(values[0].items.map(x=>x.itemId),['jp_p','jp_z']);assert.equal(values[0].diagnostics.length,1)
 assert.equal(JSON.stringify(values[0]).includes('secret'),false)
 h.listeners[0].error({code:'permission-denied',message:'secret'});assert.deepEqual(errors,['permission-denied'])
 stop();h.listeners[0].next(snapshot([]));h.listeners[0].error({code:'unavailable'});assert.equal(values.length,1);assert.equal(errors.length,1)
 assert.equal(h.listeners[0].stopped,true)
})
test('activity repository cache and pending writes are loading, not empty ready',()=>{
 const h=harness(),values=[];h.repo.subscribe('recent',v=>values.push(v),()=>{})
 for(const metadata of [{fromCache:true},{fromCache:false,hasPendingWrites:true}])h.listeners[0].next(snapshot([['jp_p',data()]],metadata))
 assert.ok(values.every(v=>v.status==='loading'&&v.items.length===0))
})
test('activity repository rejects wrong uid and replacement session including same uid',async()=>{
 const h=harness();assert.throws(()=>h.api.activityRepository('b'))
 h.auth.currentUser={uid:'a',emailVerified:true};assert.throws(()=>h.repo.subscribe('recent',()=>{},()=>{}))
 await assert.rejects(h.repo.markRead('jp_p','x'),{code:'unauthenticated'});assert.equal(h.writes.length,0)
})
for(const [name,record,expected,key] of [['marked',data(),'marked','["jp_p",100,0]'],['already',data(100,{seconds:101,nanoseconds:0}),'alreadyRead','["jp_p",100,0]'],['missing',null,'missing','["jp_p",100,0]'],['reinvited',data(101),'stale','["jp_p",100,0]']])test(`activity mark read ${name}`,async()=>{
 const h=harness();h.set(record);assert.equal(await h.repo.markRead('jp_p',key),expected)
 assert.equal(h.writes.length,expected==='marked'?1:0)
 if(h.writes.length)assert.deepEqual(h.writes[0],['users/a/activityInbox/jp_p',{readAt:{server:true}}])
})
test('activity mark read aborts session replacement during read and rejects invalid document',async()=>{
 const h=harness();h.after(()=>h.auth.currentUser=null);await assert.rejects(h.repo.markRead('jp_p','x'),{code:'unauthenticated'});assert.equal(h.writes.length,0)
 const other=harness();other.set({});await assert.rejects(other.repo.markRead('jp_p','x'),{code:'invalid-document'})
 await assert.rejects(other.repo.markRead('../p','x'),{code:'invalid-argument'})
})
test('activity transaction retry rechecks replacement slot',async()=>{
 const h=harness();h.retries(2);h.after(()=>h.set(data(101)))
 assert.equal(await h.repo.markRead('jp_p','["jp_p",100,0]'),'stale');assert.equal(h.writes.length,0)
})

test('activity denied stale write reconciles read-only but never hides a live permission failure',async()=>{
 for(const changed of ['read','missing','stale','unchanged']) {
  const h=harness()
  // Exercise the real repository with an SDK adapter that rejects the first commit.
  const sdk=require('firebase/firestore');let calls=0,writes=0,current=data()
  const wrapped={...sdk,doc:(_,...path)=>path.join('/'),runTransaction:async(_,callback)=>{
   calls++;const result=await callback({get:async()=>({exists:()=>current!==null,data:()=>current}),update:()=>writes++})
   if(calls===1){current=changed==='read'?data(100,{seconds:101,nanoseconds:0}):changed==='missing'?null:changed==='stale'?data(101):data();throw {code:'permission-denied'}}
   return result
  }}
  const repo=loadRepository(wrapped,{},h.auth).activityRepository('a')
  if(changed==='unchanged')await assert.rejects(repo.markRead('jp_p','["jp_p",100,0]'),{code:'permission-denied'})
  else assert.equal(await repo.markRead('jp_p','["jp_p",100,0]'),{read:'alreadyRead',missing:'missing',stale:'stale'}[changed])
  assert.equal(calls,2);assert.equal(writes,1)
 }
})
