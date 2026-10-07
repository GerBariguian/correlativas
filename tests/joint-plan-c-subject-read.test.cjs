const {test}=require('node:test'),assert=require('node:assert/strict')
const {load,P,X,Y,root,time}=require('./joint-c-invite-harness.cjs')
const B=root+'/subjects/A',E=B+'/memberEdges/bob:'+X
function setup(){
 const records=new Map(),reads=[],auth={currentUser:{uid:'alice'}};let fail=null,hook=()=>{}
 const snap=(p,d)=>({id:p.split('/').at(-1),exists:()=>d!==undefined,data:()=>structuredClone(d)})
 const access=(kind,p)=>{reads.push({kind,p});assert.ok(p.startsWith(root+'/subjects'));if(fail)throw fail;hook()}
 const api=load({doc:(_, ...p)=>p.join('/'),collection:(_, ...p)=>p.join('/'),getDocFromServer:async p=>{access('get',p);return snap(p,records.get(p))},getDocsFromServer:async p=>{access('list',p);return {docs:[...records].filter(([k])=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/')).map(([k,d])=>snap(k,d))}}},auth,{})
 const ref={slotId:'slot1',instanceId:'ib',occurrence:X,slotRevision:1}
 const base=api.newJointCSubjectBase(P,'A','bob',ref,time)
 const edge=api.newJointCMemberEdge(P,'A','bob',ref,'bob',ref,time)
 return {records,reads,auth,api,base,edge,hook:f=>hook=f,fail:e=>fail=e,
 getBase:()=>api.readJointCSubjectBase('alice',P,'A'),listBases:()=>api.listJointCSubjectBases('alice',P),getEdge:()=>api.readJointCMemberEdge('alice',P,'A','bob',X),listEdges:()=>api.listJointCMemberEdges('alice',P,'A')}
}
for(const op of ['getBase','listBases','getEdge','listEdges']){
 test('S3-D '+op+' empty/missing',async()=>{const h=setup();assert.deepEqual(await h[op](),op.startsWith('get')?null:[])})
 test('S3-D '+op+' session absent before read',async()=>{const h=setup();h.auth.currentUser=null;await assert.rejects(h[op]());assert.equal(h.reads.length,0)})
 test('S3-D '+op+' session replacement during read',async()=>{const h=setup();h.hook(()=>h.auth.currentUser={uid:'alice'});await assert.rejects(h[op]())})
 for(const code of ['permission-denied','unavailable'])test('S3-D '+op+' propagates '+code,async()=>{const h=setup(),error=Object.assign(Error(code),{code});h.fail(error);await assert.rejects(h[op](),e=>e===error);assert.equal(h.reads.length,1)})
 test('S3-D '+op+' invalid document rejects, not empty/partial',async()=>{const h=setup();h.records.set(B,h.base);h.records.set(E,h.edge);h.records.set(op.endsWith('Base')||op==='listBases'?B:E,{schemaVersion:31});await assert.rejects(h[op]())})
}
test('S3-D valid base exact GET and list preserve identity',async()=>{const h=setup();h.records.set(B,h.base);h.records.set(root+'/subjects/B',{...h.base,code:'B'});assert.deepEqual((await h.getBase()).base,h.base);assert.deepEqual((await h.listBases()).map(x=>x.code),['A','B']);assert.deepEqual(h.reads,[{kind:'get',p:B},{kind:'list',p:root+'/subjects'}])})
test('S3-D A1 B1 A2 exact GET and list remain distinct without private inference',async()=>{const h=setup();h.records.set(E,h.edge);h.records.set(B+'/memberEdges/carol:'+Y,{...h.edge,uid:'carol',targetRef:{...h.edge.targetRef,occurrence:Y}});h.records.set(B+'/memberEdges/bob:'+Y,{...h.edge,targetRef:{...h.edge.targetRef,occurrence:Y,slotRevision:3}});assert.deepEqual((await h.getEdge()).edge,h.edge);const rows=await h.listEdges();assert.equal(rows.length,3);assert.equal(new Set(rows.map(x=>x.edgeId)).size,3);assert.equal(rows.filter(x=>x.edge.uid==='bob').length,2);assert.ok(rows.every(x=>!('operational' in x)&&!('authorized' in x)));assert.deepEqual(h.reads,[{kind:'get',p:E},{kind:'list',p:B+'/memberEdges'}])})
test('S3-D malformed edge path cannot hide payload identity',async()=>{const h=setup();h.records.set(B+'/memberEdges/bob:'+X+':extra',h.edge);await assert.rejects(h.listEdges())})
test('S3-D path payload mismatch and partial lists rejected',async()=>{const h=setup();h.records.set(B,h.base);h.records.set(root+'/subjects/B',h.base);await assert.rejects(h.listBases());h.records.set(E,{...h.edge,uid:'carol'});await assert.rejects(h.getEdge())})
test('S3-D selection not consulted and decoded data detached',async()=>{const h=setup();Object.defineProperty(h.auth.currentUser,'activeCareerInstanceId',{get(){throw Error('selection')}});h.records.set(E,h.edge);const out=await h.getEdge();out.edge.targetRef.instanceId='changed';assert.equal(h.edge.targetRef.instanceId,'ib')})
