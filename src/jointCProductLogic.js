// UI orchestration only. Every mutation still uses the accredited service/Rules.
export const JOINT_C_UNAVAILABLE = 'Esta actividad ya no está disponible.'
export function compatibleJointInstances(instances, catalogId) {
  return instances.filter(i => i.catalogId === catalogId && i.lifecycle === 'active')
}
export function jointCParticipants(plan, slots) {
  return [{ uid:plan.ownerId, reference:{slotId:'owner',instanceId:plan.ownerInstanceId,occurrence:'owner',slotRevision:0} },
    ...slots.filter(s=>s.slot.status==='member').map(({slotId,slot})=>({uid:slot.uid,reference:{slotId,instanceId:slot.binding,occurrence:slot.occurrence,slotRevision:slot.revision}}))]
}
export function currentJointEdge(edge, people) {
  return people.some(p=>p.uid===edge.uid && Object.keys(p.reference).every(k=>p.reference[k]===edge.targetRef[k]))
}
export function jointCProduct(uid, api, check) {
  async function invoke(name,...args) { check(); const r=await api[name](uid,...args);check();return r }
  async function independent(items, operation) {
    const results=[]
    for(const item of items){check();try{await operation(item);check();results.push({uid:item.uid,status:'success'})}
      catch {check();results.push({uid:item.uid,status:'unavailable'})}}
    return results
  }
  async function plan(planId) {
    const found=await invoke('readJointCPlan',planId)
    if(!found || found.plan.deleting)throw Error('UNAVAILABLE')
    const slots=[]
    for(const slotId of ['slot1','slot2','slot3','slot4']){
      try{const s=await invoke('readJointCSlot',planId,slotId);if(s)slots.push(s)}catch{check()}
    }
    return {...found,slots,people:jointCParticipants(found.plan,slots)}
  }
  async function invitation(planId, occurrenceId) {
    const p=await invoke('readJointCPlan',planId),o=await invoke('readJointCInvitationOccurrence',planId,occurrenceId)
    if(!p || p.plan.closed || p.plan.deleting || !o || o.occurrence.uid!==uid)throw Error('UNAVAILABLE')
    const {occurrence}=o,s=await invoke('readJointCSlot',planId,occurrence.slotId)
    if(!s || s.slot.status!=='pending' || s.slot.uid!==uid || s.slot.occurrence!==occurrenceId
      || s.slot.revision!==occurrence.revision || s.slot.invitedBy!==occurrence.invitedBy || s.slot.cycle!==occurrence.cycle)throw Error('UNAVAILABLE')
    const f=await invoke('readFriendship',occurrence.invitedBy)
    if(!f || f.status!=='accepted' || f.cycleId!==occurrence.cycle)throw Error('UNAVAILABLE')
    return {...p,occurrenceId,occurrence,slot:s.slot,slotId:s.slotId}
  }
  return {
    discover:()=>invoke('discoverJointCPlans'), plan, invitation,
    create(instance,name = 'Plan conjunto'){if(!instance || instance.lifecycle!=='active')throw Error('EXPLICIT_INSTANCE_REQUIRED');return invoke('createJointCPlan',instance.careerInstanceId,instance.catalogId,name)},
    invite(planId,recipients){
      if(recipients.length>4 || new Set(recipients).size!==recipients.length)throw Error('INVALID_RECIPIENTS')
      return independent(recipients.map(uid=>({uid})),async target=>{
        const f=await invoke('readFriendship',target.uid)
        if(!f || f.status!=='accepted')throw Error('UNAVAILABLE')
        // Explicit product step. Never hidden in the invitation service or a read.
        const cycleId=f.cycleId || (await invoke('upgradeAcceptedLegacyFriendship',target.uid)).cycleId
        const p=await plan(planId)
        const existing=p.slots.find(s=>s.slot.uid===target.uid)
        const chosen=existing || p.slots.find(s=>s.slot.status==='empty')
        if(!chosen || (existing && (existing.slot.status!=='pending' || existing.slot.cycle===cycleId)))throw Error('UNAVAILABLE')
        await invoke('inviteJointCParticipant',planId,chosen.slotId,target.uid,api.newOccurrenceId(),cycleId,chosen.slot.revision,chosen.slot.occurrence)
      })
    },
    async join(planId,occurrenceId,instance,instances){
      const p=await invitation(planId,occurrenceId)
      if(!instance || !compatibleJointInstances(instances,p.plan.catalogId).some(i=>i.careerInstanceId===instance))throw Error('EXPLICIT_COMPATIBLE_INSTANCE_REQUIRED')
      return invoke('joinJointCPlan',planId,occurrenceId,instance)
    },
    release:(planId,s)=>invoke('releaseJointCSlot',planId,s.slotId,s.slot.occurrence,s.slot.revision),
    async subjects(planId){const bases=await invoke('listJointCSubjectBases',planId);return Promise.all(bases.map(async b=>({...b,edges:await invoke('listJointCMemberEdges',planId,b.code)})))},
    async assign(planId,code,actor,targets){
      await invoke('ensureJointCSubjectBase',planId,code,actor)
      return independent(targets,t=>invoke('createJointCMemberEdge',planId,code,actor,t.uid,t.reference))
    },
    transition:(planId,code,actor,edge,state)=>invoke(state==='assigned'?'reassignJointCMemberEdge':'unassignJointCMemberEdge',planId,code,actor,edge.uid,edge.targetRef,edge.revision),
    rename:(planId,name)=>invoke('renameJointCPlan',planId,name),
    close:planId=>invoke('closeJointCPlan',planId),delete:planId=>invoke('deleteJointCPlan',planId),
  }
}

export async function resolveVersionedActivity(uid,item,api,check) {
  const unavailable={notice:JOINT_C_UNAVAILABLE}
  try{
    check()
    if(item.schemaVersion===3){
      const p=await jointCProduct(uid,api,check).invitation(item.planId,item.occurrence)
      if(p.occurrence.cycle!==item.cycle || p.occurrence.invitedBy!==item.actorUid)return unavailable
      return {destination:'joint',planId:item.planId,occurrenceId:item.occurrence,catalogId:p.plan.catalogId,model:'C'}
    }
    if(item.target?.kind==='friendship'){
      const pair=item.target.id.split(':');if(!pair.includes(uid))return unavailable
      const f=await api.readFriendship(uid,pair.find(x=>x!==uid));check()
      if(!f || (item.schemaVersion===2 ? f.cycleId!==item.friendshipCycleId : !!f.cycleId))return unavailable
      const request=['FRIEND_REQUEST','FRIEND_REQUEST_RECEIVED'].includes(item.type)
      if(request ? f.status!=='pending'||f.recipientId!==uid||f.senderId!==item.actorUid
        : f.status!=='accepted'||f.senderId!==uid||f.recipientId!==item.actorUid)return unavailable
      return {destination:'friends'}
    }
    // Legacy invitations remain historical only; never map them to C.
    return unavailable
  }catch{check();return unavailable}
}
