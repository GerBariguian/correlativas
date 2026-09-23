const {test}=require('node:test'),assert=require('node:assert/strict')
const {loadSession}=require('./activity-harness.cjs')
const {createActivitySession,normalizeActivityItem}=loadSession()
const item=(seconds=100)=>normalizeActivityItem('jp_p',{schemaVersion:1,type:'JOINT_PLAN_INVITATION',actorUid:'actor',createdAt:{seconds,nanoseconds:0},target:{kind:'jointPlan',id:'p'},readAt:null}).item
function harness() {
 const calls=[],timers=[];let seconds=100,result=Promise.resolve('marked')
 const session=createActivitySession({repository:uid=>({subscribe:(mode,next,error)=>{const c={uid,mode,next,error,stopped:false};calls.push(c);return()=>c.stopped=true},markRead:()=>result}),now:()=>({seconds,nanoseconds:0}),schedule:f=>{timers.push(f);return timers.length-1},cancel:id=>timers[id]=null})
 return {session,calls,timers,time:v=>seconds=v,result:v=>result=v}
}
const ready=(items=[item()],diagnostics=[])=>({status:'ready',items,diagnostics,atLimit:false})
test('activity session shares listeners across consumers and repeated same-user updates',()=>{
 const h=harness(),u={uid:'a'};h.session.setUser(u)
 assert.equal(h.session.getState().recent.status,'loading');assert.equal(h.session.getState().badge,null)
 const a=h.session.observe(()=>{}),b=h.session.observe(()=>{});h.session.setUser(u)
 assert.equal(h.calls.length,2);a();b();assert.equal(h.calls.length,2)
 h.calls[0].next(ready());h.calls[1].next(ready());assert.deepEqual(h.session.getState().badge,{count:1,isCapped:false})
 h.session.dispose();assert.ok(h.calls.every(c=>c.stopped));assert.equal(h.timers[0],null)
})
test('activity session A to B, logout and same uid new session reject late callbacks',()=>{
 const h=harness();h.session.setUser({uid:'a'});h.calls[0].next(ready())
 h.session.setUser({uid:'b'});assert.equal(h.session.getState().recent.items.length,0)
 h.calls[0].next(ready());h.calls[1].error('permission-denied');assert.equal(h.session.getState().recent.status,'loading')
 h.calls[2].next(ready());h.session.setUser({uid:'b'});assert.equal(h.calls.length,6)
 h.session.setUser(null);h.calls[4].next(ready());assert.equal(h.session.getState().recent.status,'idle');assert.equal(h.session.getState().badge,null)
 assert.ok(h.calls.every(c=>c.stopped));h.session.dispose()
})
test('activity session errors are independent and retry replaces subscriptions',()=>{
 const h=harness();h.session.setUser({uid:'a'});h.calls[0].error('permission-denied');h.calls[1].next(ready())
 assert.equal(h.session.getState().recent.status,'error');assert.equal(h.session.getState().badge.count,1)
 h.calls[1].error('unavailable');assert.equal(h.session.getState().badge,null)
 h.session.retry();assert.equal(h.calls.length,4);assert.equal(h.calls[0].stopped,true);assert.equal(h.session.getState().recent.error,null);h.session.dispose()
})
test('activity session unknown badge on corruption, cap and local horizon expiry without new listeners',()=>{
 const h=harness();h.session.setUser({uid:'a'});h.calls[1].next(ready([item()],[{diagnostic:'INVALID_FIELDS'}]));assert.equal(h.session.getState().badge,null)
 h.calls[1].next(ready(Array(51).fill(item())));assert.deepEqual(h.session.getState().badge,{count:50,isCapped:true})
 h.time(100+90*86400+1);h.timers[0]();assert.deepEqual(h.session.getState().badge,{count:0,isCapped:false});assert.equal(h.calls.length,2);h.session.dispose()
})
test('activity session asynchronous mark completion cannot cross session boundary',async()=>{
 const h=harness();h.session.setUser({uid:'a'});let resolve;h.result(new Promise(r=>resolve=r))
 const pending=h.session.markRead(item());h.session.setUser({uid:'b'});resolve('marked');assert.deepEqual(await pending,{status:'cancelled'})
 for(const status of ['marked','alreadyRead','missing','stale']){h.result(Promise.resolve(status));assert.deepEqual(await h.session.markRead(item()),{status})}
 h.result(Promise.reject({code:'unavailable',message:'secret'}));assert.deepEqual(await h.session.markRead(item()),{status:'error',error:'unavailable'})
 h.session.dispose();assert.deepEqual(await h.session.markRead(item()),{status:'error',error:'unauthenticated'})
})
test('activity session clock skew does not claim an exact badge from a truncated future window',()=>{
 const h=harness();h.session.setUser({uid:'a'});h.calls[1].next(ready([item(101)]));assert.equal(h.session.getState().badge,null)
 h.time(101);h.timers[0]();assert.deepEqual(h.session.getState().badge,{count:1,isCapped:false});h.session.dispose()
})
