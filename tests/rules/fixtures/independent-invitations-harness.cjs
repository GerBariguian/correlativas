const fs=require('node:fs'),sdk=require('firebase/firestore'),h=require('../helpers.cjs')
let source=fs.readFileSync('tests/rules/joint-join-diagnostic.test.cjs','utf8');source=source.slice(0,source.indexOf("for (const variant of ['real', 'join-only'])"));const {fixture}=new Function('require',source+';return {fixture}')(name=>name==='./helpers.cjs'?h:require(name))
const clients=new WeakMap(),db=(e,u)=>{if(!clients.has(e))clients.set(e,new Map());const m=clients.get(e);if(!m.has(u))m.set(u,e.authenticatedContext(u,h.claims(u)).firestore());return m.get(u)}
function inputs(orientation='direct'){
 const entries=fixture(1);delete entries['jointPlans/p'];for(const k of Object.keys(entries))if(k.includes('/activityInbox/'))delete entries[k]
 const ids=['one','two','three','four'];ids.forEach((u,i)=>{const old='friendships/owner:'+u,key=(orientation==='inverse'||orientation==='mixed'&&i%2)?'friendships/'+u+':owner':old;const c='cycle_unique_000'+(i+1);entries[key]={participants:['owner',u].sort(),senderId:'owner',recipientId:u,status:'accepted',cycleId:c};if(key!==old)delete entries[old];entries['usedFriendshipCycles/'+c]={relationshipId:key.slice(12),participants:entries[key].participants}})
 return entries
}
function base(){return {schemaVersion:2,ownerId:'owner',catalogId:'catalog',name:'Plan',inviteeIds:[],memberIds:['owner'],participants:{owner:{careerInstanceId:'i_owner',bindingState:'resolved'}},invitedBy:{},invitationSerial:0,invitationCycles:{},invitationOccurrences:{},joinOccurrence:0,closed:false,deleting:false,createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()}}
const read=(e,u='owner',id='p')=>sdk.getDocFromServer(sdk.doc(db(e,u),'jointPlans',id)).then(s=>s.data())
const fail=reason=>{throw Object.assign(Error(reason),{code:reason})}
function transition(p,actor,uid,cycle){
 if(p.closed||p.deleting||!p.memberIds.includes(actor))fail('unavailable')
 if(p.memberIds.includes(uid))fail('already-member')
 if(p.inviteeIds.includes(uid)&&p.invitationCycles[uid]===cycle)return null
 if(p.inviteeIds.includes(uid)&&p.invitedBy[uid]!==actor)fail('different-inviter')
 if(!p.inviteeIds.includes(uid)&&p.inviteeIds.length>=4)fail('capacity')
 const occurrence=p.invitationSerial+1
 return {...p,inviteeIds:p.inviteeIds.includes(uid)?p.inviteeIds:[...p.inviteeIds,uid],participants:{...p.participants,[uid]:{careerInstanceId:null,bindingState:'unresolved'}},invitedBy:{...p.invitedBy,[uid]:actor},invitationSerial:occurrence,invitationOccurrences:{...p.invitationOccurrences,[uid]:occurrence},invitationCycles:{...p.invitationCycles,[uid]:cycle},updatedAt:sdk.serverTimestamp()}
}
const notice=(id,uid,p)=>({schemaVersion:2,type:'JOINT_PLAN_INVITATION',actorUid:p.invitedBy[uid],createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'jointPlan',id},friendshipCycleId:p.invitationCycles[uid],occurrence:p.invitationOccurrences[uid]})
function write(e,actor,uid,p,id='p',options={}){const d=db(e,actor),b=sdk.writeBatch(d);if(!options.noSource)b.set(sdk.doc(d,'jointPlans',id),p);if(!options.noNotice)b.set(sdk.doc(d,'users',options.recipient||uid,'activityInbox',options.item||`jp_${id}_${p.invitationOccurrences[uid]}`),options.notice||notice(id,uid,p));return b.commit()}
async function activate(e,actor,uid,id='p',trace=[]){
 const d=db(e,actor);return sdk.runTransaction(d,async tx=>{
 trace.push('read');const snap=await tx.get(sdk.doc(d,'jointPlans',id));if(!snap.exists())fail('missing')
 const p=snap.data();const [a,b,c,m]=await Promise.all([tx.get(sdk.doc(d,'friendships',actor+':'+uid)),tx.get(sdk.doc(d,'friendships',uid+':'+actor)),tx.get(sdk.doc(d,'migrationUsers',actor)),tx.get(sdk.doc(d,'users',actor,'careerInstances',p.participants[actor]?.careerInstanceId||'missing'))])
 const f=a.exists()&&!b.exists()?a.data():b.exists()&&!a.exists()?b.data():null
 if(!f||f.status!=='accepted')fail('friendship-unavailable')
 if(c.data()?.authority!=='instances'||m.data()?.lifecycle!=='active'||m.data()?.catalogId!==p.catalogId)fail('binding-unavailable')
 const next=transition(p,actor,uid,f.cycleId);if(!next)return 'already-sent'
 trace.push('write');tx.set(sdk.doc(d,'jointPlans',id),next);tx.set(sdk.doc(d,'users',uid,'activityInbox',`jp_${id}_${next.invitationSerial}`),notice(id,uid,next));return 'sent'
 },{maxAttempts:5}) // No external permission-denied retry.
}
const joinPatch=(p,uid,occ=p.invitationOccurrences[uid])=>({memberIds:[...p.memberIds,uid],participants:{...p.participants,[uid]:{careerInstanceId:'i_'+uid,bindingState:'resolved'}},joinOccurrence:occ,updatedAt:sdk.serverTimestamp()})
async function create(e){await sdk.setDoc(sdk.doc(db(e,'owner'),'jointPlans/p'),base())}
module.exports={sdk,h,db,inputs,base,read,transition,notice,write,activate,joinPatch,create,fail}
