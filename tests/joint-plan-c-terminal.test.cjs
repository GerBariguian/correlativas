const {test}=require('node:test'),assert=require('node:assert/strict'),{load,fixture,P,root}=require('./joint-c-invite-harness.cjs')
test('S5 rename owner changes only normalized name; unnamed C remains compatible',async()=>{
 const h=setup(),before=structuredClone(h.docs)
 await h.api.renameJointCPlan('alice',P,'  Mi   plan ')
 assert.deepEqual(h.docs,{...before,[root]:{...before[root],name:'Mi plan'}})
 assert.deepEqual(h.reads,[root]);assert.equal(h.writes[0].length,1)
 assert.equal(h.api.newJointCPlan('alice','ia','catalog',1).name,'Plan conjunto')
 assert.equal(h.api.decodeJointCPlan(before[root]).name,undefined)
})
test('S5 rename rejects invalid names, extra schema, closed/deleting, nonowner and missing session',async()=>{
 for(const name of ['', '   ', '\t', 'x'.repeat(81), null, 'a\nb']){
  const h=setup();await assert.rejects(h.api.renameJointCPlan('alice',P,name));assert.equal(h.writes.length,0)
  assert.throws(()=>h.api.decodeJointCPlan({...h.docs[root],name}))
 }
 for(const patch of [{closed:true},{closed:true,deleting:true},{ownerId:'bob'},{extra:true}]){
  const h=setup();Object.assign(h.docs[root],patch);await assert.rejects(h.api.renameJointCPlan('alice',P,'Valid'));assert.equal(h.writes.length,0)
 }
 const h=setup();h.auth.currentUser=null;await assert.rejects(h.api.renameJointCPlan('alice',P,'Valid'))
})
function setup(){const docs=fixture(),writes=[],reads=[],auth={currentUser:{uid:'alice'}};let deny=false
 const sdk={doc:(_, ...p)=>p.join('/'),serverTimestamp:()=>({seconds:1,nanoseconds:0}),runTransaction:async(_,fn)=>{
  const staged=[];await fn({get:async p=>{reads.push(p);return {exists:()=>!!docs[p],data:()=>structuredClone(docs[p])}},update:(p,d)=>staged.push([p,{...docs[p],...d}]),set:(p,d)=>staged.push([p,d])})
  if(deny)throw Error('permission-denied');for(const [p,d]of staged)docs[p]=d;writes.push(staged)
 }}
 return {docs,writes,reads,auth,api:load(sdk,auth,{}),deny:()=>{deny=true}}
}
test('S5 close writes parent only, preserves all identities and children',async()=>{const h=setup(),before=structuredClone(h.docs);await h.api.closeJointCPlan('alice',P);assert.deepEqual(h.docs[root],{...before[root],closed:true});assert.equal(h.writes[0].length,1);await assert.rejects(h.api.closeJointCPlan('alice',P))})
for(const closed of [false,true])test('S5 delete from '+(closed?'closed':'active')+' writes exactly parent+tombstone',async()=>{const h=setup();h.docs[root].closed=closed;await h.api.deleteJointCPlan('alice',P);assert.equal(h.docs[root].deleting,true);assert.equal(h.writes[0].length,2);assert.ok(h.docs[root+'/slots/slot1']);assert.deepEqual(h.reads,[root]);await assert.rejects(h.api.deleteJointCPlan('alice',P))})
test('S5 failed atomic commit has no partial terminal state',async()=>{const h=setup(),before=structuredClone(h.docs);h.deny();await assert.rejects(h.api.deleteJointCPlan('alice',P));assert.deepEqual(h.docs,before)})
test('S5 session, nonowner and legacy reject',async()=>{for(const kind of ['session','owner','legacy']){const h=setup();if(kind==='session')h.auth.currentUser=null;if(kind==='owner')h.docs[root].ownerId='bob';if(kind==='legacy')delete h.docs[root].schemaVersion;await assert.rejects(h.api.deleteJointCPlan('alice',P));assert.equal(h.writes.length,0)}})
