import { doc, getDocFromServer } from 'firebase/firestore'
import { auth, db } from '../firebase'
import * as plans from './jointPlans'
import { joinJointCPlan, releaseJointCSlot } from './jointJoin'
import { upgradeAcceptedLegacyFriendship, generateFriendshipCycleId } from './friends'
import { canonicalFriendshipId, decodeFriendshipCycle } from '../friendshipCycleLogic'
import { jointCProduct, resolveVersionedActivity } from '../jointCProductLogic'

function session(uid){const user=auth.currentUser;return ()=>{if(!user || user.uid!==uid || auth.currentUser!==user)throw Error('SESSION_CHANGED')}}
// Own social relationship only. Never reads another user's academic data.
async function readFriendship(uid,otherUid){
 const check=session(uid);check();const id=canonicalFriendshipId(uid,otherUid)
 const a=await getDocFromServer(doc(db,'friendships',id)),b=await getDocFromServer(doc(db,'friendships',id.split(':').reverse().join(':')))
 check();if(a.exists()===b.exists())return null
 const data=(a.exists()?a:b).data()
 if(data.cycleId)return decodeFriendshipCycle(id,data)
 return data // Upgrade service validates legacy structure before any mutation.
}
const api={...plans,readFriendship,upgradeAcceptedLegacyFriendship,newOccurrenceId:generateFriendshipCycleId,
 joinJointCPlan:(uid,...args)=>joinJointCPlan({db,auth},uid,...args),
 releaseJointCSlot:(uid,...args)=>releaseJointCSlot({db,auth},uid,...args)}
export function jointCProductSession(uid){const check=session(uid);check();return jointCProduct(uid,api,check)}
export function resolveActivityDestination(uid,item){const check=session(uid);check();return resolveVersionedActivity(uid,item,api,check)}
