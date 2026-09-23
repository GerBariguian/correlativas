const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm')
const api = vm.createContext({})
vm.runInContext(fs.readFileSync('src/activityLogic.js','utf8').replace(/export /g,''),api)
for (const [type,id,prefix,kind] of [['FRIEND_REQUEST_RECEIVED','a:b','fr_','friendship'],['FRIEND_REQUEST_ACCEPTED','a:b','fa_','friendship'],['JOINT_PLAN_INVITATION','plan-1','jp_','jointPlan']]) {
  test(`activity deterministic schema: ${type}`,()=>{
    const time=Object.freeze({seconds:1,nanoseconds:0})
    const notice=api.newActivity(type,'actor',id,time)
    assert.equal(api.activityId(type,id),prefix+id)
    assert.equal(api.activityId(type,id),api.activityId(type,id))
    assert.deepEqual(JSON.parse(JSON.stringify(notice)),{schemaVersion:1,type,actorUid:'actor',createdAt:time,target:{kind,id},readAt:null})
    assert.equal(api.newActivity(type,'actor',id,{seconds:2,nanoseconds:0}).readAt,null)
  })
}
test('activity rejects unknown type, path injection and invalid target grammar',()=>{
  for(const [type,id] of [['OTHER','a'],['JOINT_PLAN_INVITATION','a/b'],['FRIEND_REQUEST_RECEIVED','a'],['FRIEND_REQUEST_ACCEPTED','a:b:c'],['JOINT_PLAN_INVITATION','x'.repeat(101)]]) assert.throws(()=>api.activityId(type,id))
  assert.throws(()=>api.newActivity('JOINT_PLAN_INVITATION','a/b','p',{}))
  assert.throws(()=>api.newActivity('JOINT_PLAN_INVITATION','a','p',null))
})
module.exports = api

const plain = value => JSON.parse(JSON.stringify(value))
const timestamp = (seconds = 100, nanoseconds = 0) => ({ seconds, nanoseconds })
const fixture = () => plain(api.newActivity('JOINT_PLAN_INVITATION', 'actor', 'p', timestamp()))
const normalized = (data = fixture(), id = 'jp_p') => {
  const result = api.normalizeActivityItem(id, data)
  assert.equal(result.ok, true)
  return result.item
}
for (const [type, id] of [['FRIEND_REQUEST_RECEIVED','a:b'],['FRIEND_REQUEST_ACCEPTED','a:b'],['JOINT_PLAN_INVITATION','p']]) {
  test(`activity normalizes resolved ${type}`, () => {
    const data = api.newActivity(type,'actor',id,timestamp())
    const result = api.normalizeActivityItem(api.activityId(type,id),data)
    assert.equal(result.ok,true)
    assert.equal(result.item.isRead,false)
    assert.deepEqual(plain(result.item.target),plain(data.target))
    assert.equal(result.item.instanceKey,api.getActivityInstanceKey(result.item))
  })
}
for (const [label, patch, diagnostic] of [
  ['schema',{schemaVersion:2},'UNSUPPORTED_SCHEMA'],
  ['type',{type:'OTHER'},'UNKNOWN_TYPE'],
  ['extra',{email:'private@example.invalid'},'INVALID_FIELDS'],
  ['actor empty',{actorUid:''},'INVALID_ACTOR'],
  ['actor whitespace',{actorUid:' '},'INVALID_ACTOR'],
  ['actor primitive',{actorUid:123},'INVALID_ACTOR'],
  ['target kind',{target:{kind:'friendship',id:'p'}},'INVALID_TARGET'],
  ['target empty',{target:{kind:'jointPlan',id:''}},'INVALID_TARGET'],
  ['target extra',{target:{kind:'jointPlan',id:'p',url:'/private'}},'INVALID_TARGET'],
  ['created missing',{createdAt:null},'INVALID_CREATED_AT'],
  ['created sentinel',{createdAt:{}},'INVALID_CREATED_AT'],
  ['created string',{createdAt:'2026-01-01'},'INVALID_CREATED_AT'],
  ['read malformed',{readAt:false},'INVALID_READ_AT'],
]) test(`activity normalization rejects ${label} safely`,()=>{
  assert.deepEqual(plain(api.normalizeActivityItem('jp_p',{...fixture(),...patch})),{ok:false,diagnostic})
})
test('activity rejects each missing field and mismatched slot',()=>{
  for(const field of Object.keys(fixture())) { const data=fixture();delete data[field];assert.equal(api.normalizeActivityItem('jp_p',data).ok,false) }
  assert.equal(api.normalizeActivityItem('jp_other',fixture()).diagnostic,'INVALID_ITEM_ID')
  assert.equal(api.normalizeActivityItem('jp_p',{...fixture(),target:{kind:'jointPlan',id:'other'}}).diagnostic,'INVALID_ITEM_ID')
})
test('activity timestamp boundary preserves nanoseconds and rejects ambiguous values',()=>{
  for(const time of [timestamp(-62135596800),timestamp(253402300799,999999999),timestamp(0,1)]) assert.deepEqual(plain(api.normalizeActivityTimestamp(time)),time)
  for(const time of [timestamp(-62135596801),timestamp(253402300800),timestamp(0,-1),timestamp(0,1e9),timestamp(0,0.5),timestamp(NaN),timestamp(Infinity),timestamp('1'),new Date(),0,null]) assert.equal(api.normalizeActivityTimestamp(time),null)
  class ResolvedTimestamp { constructor(){this.seconds=10;this.nanoseconds=12} }
  assert.deepEqual(plain(api.normalizeActivityTimestamp(new ResolvedTimestamp())),timestamp(10,12))
})
test('activity read state includes readAt equal to createdAt',()=>{
  assert.equal(normalized().isRead,false)
  const item=normalized({...fixture(),readAt:timestamp()})
  assert.equal(item.isRead,true)
  assert.deepEqual(plain(item.readAt),timestamp())
})
test('activity reinvitation distinguishes nanosecond instances without changing slot',()=>{
  const a=normalized(),b=normalized({...fixture(),createdAt:timestamp(100,1)})
  assert.equal(a.itemId,b.itemId)
  assert.notEqual(a.instanceKey,b.instanceKey)
  assert.equal(a.instanceKey,normalized().instanceKey)
})
test('activity sorting uses precise DESC and ordinal slot ASC on ties',()=>{
  const a=normalized(),z=normalized({...fixture(),target:{kind:'jointPlan',id:'z'}},'jp_z')
  const newer=normalized({...fixture(),createdAt:timestamp(100,1)})
  const older=normalized({...fixture(),createdAt:timestamp(99)})
  const input=Object.freeze([older,z,newer,a])
  assert.deepEqual(plain(api.sortActivityItems(input).map(x=>x.instanceKey)),[newer,a,z,older].map(x=>x.instanceKey))
  assert.equal(input[0],older)
})
test('activity filters are closed and badge represents zero, exact cap and overflow',()=>{
  const unread=normalized(),read=normalized({...fixture(),readAt:timestamp()})
  assert.equal(api.filterActivityItems([unread,read],'all').length,2)
  assert.equal(api.filterActivityItems([unread,read],'unread').length,1)
  assert.throws(()=>api.filterActivityItems([],'other'))
  for(const count of [0,1,49,50,51,100]) assert.deepEqual(plain(api.getUnreadBadgeCount([...Array(count).fill(unread),read])),{count:Math.min(count,50),isCapped:count>50})
  assert.deepEqual(plain(api.getUnreadBadgeCount([unread,unread],1)),{count:1,isCapped:true})
  for(const cap of [0,-1,1.5,Infinity,'50']) assert.throws(()=>api.getUnreadBadgeCount([],cap))
})
test('activity horizon includes exact 90 days and now, excludes older and future nanos',()=>{
  const now=timestamp(10000000,500),cutoff=now.seconds-90*86400
  for(const [time,expected] of [[timestamp(cutoff,500),true],[timestamp(cutoff,501),true],[timestamp(cutoff,499),false],[now,true],[timestamp(now.seconds,501),false]]) {
    assert.equal(api.isActivityWithinHorizon(normalized({...fixture(),createdAt:time}),now),expected)
  }
  assert.throws(()=>api.isActivityWithinHorizon(normalized(),null))
})
test('activity normalization detaches immutable inputs and tolerates corrupt neighbors',()=>{
  const data=fixture();Object.freeze(data.target);Object.freeze(data.createdAt);Object.freeze(data)
  const item=normalized(data);item.target.id='changed';item.createdAt.seconds=0
  assert.equal(data.target.id,'p');assert.equal(data.createdAt.seconds,100)
  const hostile={get schemaVersion(){throw new Error('private')}}
  const result=api.normalizeActivityItems([{itemId:'jp_p',data},null,{itemId:'jp_p',data:hostile},{itemId:'jp_p',data:{...data,schemaVersion:2}}])
  assert.equal(result.items.length,1);assert.equal(result.diagnostics.length,3)
  assert.equal(JSON.stringify(result.diagnostics).includes('private'),false)
  assert.deepEqual(plain(api.normalizeActivityItems([])),{items:[],diagnostics:[]})
  assert.equal(api.normalizeActivityItems(null).diagnostics[0].diagnostic,'INVALID_COLLECTION')
  assert.deepEqual(plain(api.sortActivityItems([])),[])
  assert.deepEqual(plain(api.filterActivityItems([],'all')),[])
})
