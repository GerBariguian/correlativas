const {test}=require('node:test'),assert=require('node:assert/strict')
const {memory,legacy}=require('./legacy-friendship-upgrade-harness.cjs')
for(const inverse of [false,true]){
 const source='friendships/'+(inverse?'bob:alice':'alice:bob')
 test('upgrade '+source+' exact writes, decoder, pair, no Activity/academic data, retry',async()=>{
  const h=memory(inverse),original=structuredClone(h.docs.get(source))
  const r=await h.api.upgradeAcceptedLegacyFriendship('alice','bob')
  assert.match(r.cycleId,/^[a-f0-9]{32}$/)
  const f=h.api.decodeFriendshipCycle('alice:bob',h.docs.get('friendships/alice:bob'))
  assert.equal(f.status,'accepted');assert.equal(f.senderId,original.senderId);assert.equal(f.recipientId,original.recipientId)
  assert.deepEqual(f.participants,['alice','bob'])
  assert.deepEqual(h.docs.get('usedFriendshipCycles/'+r.cycleId),{relationshipId:'alice:bob',participants:['alice','bob']})
  assert.equal(h.docs.size,2);assert.equal(h.commits[0].length,inverse?3:2)
  const before=[...h.docs];await assert.rejects(h.api.upgradeAcceptedLegacyFriendship('alice','bob'));assert.deepEqual([...h.docs],before)
 })
 for(const state of ['pending','rejected','withdrawn'])test(source+' rejects '+state,async()=>{
  const h=memory(inverse);h.docs.get(source).status=state
  await assert.rejects(h.api.upgradeAcceptedLegacyFriendship('alice','bob'));assert.equal(h.commits.length,0)
 })
 test(source+' duplicate orientations fail untouched',async()=>{
  const h=memory(inverse);h.docs.set('friendships/'+(inverse?'alice:bob':'bob:alice'),legacy(!inverse));const before=[...h.docs]
  await assert.rejects(h.api.upgradeAcceptedLegacyFriendship('alice','bob'));assert.deepEqual([...h.docs],before)
 })
 test(source+' two concurrent upgrades have one winner',async()=>{
  const h=memory(inverse),r=await Promise.allSettled([h.api.upgradeAcceptedLegacyFriendship('alice','bob'),h.api.upgradeAcceptedLegacyFriendship('alice','bob')])
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.commits.length,1);assert.equal(h.docs.size,2)
 })
 for(const denied of ['friendships/alice:bob','usedFriendshipCycles/',...(inverse?['friendships/bob:alice']:[])])test(source+' failure atomic '+denied,async()=>{
  const h=memory(inverse),before=[...h.docs];h.deny(p=>p.startsWith(denied))
  await assert.rejects(h.api.upgradeAcceptedLegacyFriendship('alice','bob'));assert.deepEqual([...h.docs],before)
 })
}
test('session absent/changed and stranger reject without writes',async()=>{
 for(const kind of ['absent','changed','stranger']){
  const h=memory();if(kind==='absent')h.auth.currentUser=null
  if(kind==='changed')h.hook(()=>{h.auth.currentUser={uid:'alice',emailVerified:true}})
  if(kind==='stranger')h.auth.currentUser={uid:'eve',emailVerified:true}
  await assert.rejects(h.api.upgradeAcceptedLegacyFriendship(kind==='stranger'?'eve':'alice','bob'));assert.equal(h.commits.length,0)
 }
})
test('malformed legacy source fields and participant/path spoof rejected',async()=>{
 for(const mutate of [d=>d.cycleId='cycle00000000001',d=>d.extra=true,d=>delete d.createdAt,d=>d.participants.reverse(),d=>d.senderId='eve']){
  const h=memory();mutate(h.docs.get('friendships/alice:bob'));await assert.rejects(h.api.upgradeAcceptedLegacyFriendship('alice','bob'));assert.equal(h.commits.length,0)
 }
})
test('pure upgrade preserves input and rejects invalid cycle identity',()=>{
 const h=memory(),d=legacy(true),before=structuredClone(d)
 const built=h.api.buildAcceptedLegacyFriendshipUpgrade('bob:alice',d,'bob','cycle00000000001')
 assert.deepEqual(d,before);assert.equal(built.friendship.status,'accepted')
 for(const c of ['',null,'short'])assert.throws(()=>h.api.buildAcceptedLegacyFriendshipUpgrade('bob:alice',d,'bob',c))
})
test('reservation collision rejects atomically without permission-denied retry',async()=>{
 const h=memory(),before=[...h.docs];let attempts=0
 h.deny(p=>{if(p.startsWith('usedFriendshipCycles/')){attempts++;return true}return false})
 await assert.rejects(h.api.upgradeAcceptedLegacyFriendship('alice','bob'),{code:'permission-denied'})
 assert.equal(attempts,1);assert.deepEqual([...h.docs],before)
})
