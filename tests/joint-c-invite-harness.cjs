const fs=require('node:fs'),path=require('node:path')
const P='inviteplan000001x',X='occurrence000001x',Y='occurrence000002y',C='cycle00000000001',C2='cycle00000000002',root=`jointPlans/${P}`,time={seconds:1700000000,nanoseconds:0}
function load(sdk,auth,db){
 const scope={...sdk,auth,db}
 for(const file of ['careerInstanceLogic.js','careerInstancePersistenceLogic.js','userDataAuthorityLogic.js','friendshipCycleLogic.js','activityLogic.js','socialMaintenance.js','jointPlanLogic.js','services/jointPlans.js']){
  const raw=fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8')
  const names=[...raw.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map(x=>x[1])
  const code=raw.replace(/^import .*\r?\n/gm,'').replace(/export /g,'')
  Object.assign(scope,new Function(...Object.keys(scope),code+`;return {${names.join(',')}}`)(...Object.values(scope)))
 }
 return scope
}
function fixture(){
 const d={[root]:{schemaVersion:3,origin:'native',ownerId:'alice',ownerInstanceId:'ia',catalogId:'catalog',closed:false,deleting:false,createdAt:time}}
 for(let n=1;n<=4;n++)d[`${root}/slots/slot${n}`]={status:'empty',uid:null,revision:0,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:time}
 for(const uid of ['alice','bob','carol','dave','eve','frank']){
  d[`migrationUsers/${uid}`]={schemaVersion:1,generation:'multicareer-v1',authority:'instances',phase:'complete',origin:'legacy',manifestId:uid,updatedAt:time}
  d[`users/${uid}/careerInstances/${uid==='alice'?'ia':'i_'+uid}`]={schemaVersion:1,catalogId:'catalog',lifecycle:'active',createdAt:time,updatedAt:time,archivedAt:null}
  if(uid!=='alice')d[`friendships/alice:${uid}`]={participants:['alice',uid],senderId:'alice',recipientId:uid,status:'accepted',cycleId:C}
 }
 return d
}
module.exports={load,fixture,P,X,Y,C,C2,root,time}
