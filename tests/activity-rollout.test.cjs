const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const { maintenanceRules, artifacts } = require('../scripts/activity-rollout.cjs')
const read = file => fs.readFileSync(file, 'utf8')
const clean = s => s.replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export default /g, '').replace(/export /g, '')
const finalRules = read('firestore.rules')

test('rollout maintenance/recovery differs from strict final Rules by exactly one false literal', () => {
  const maintenance = maintenanceRules(finalRules)
  assert.equal(maintenance.replace('return false; // ACTIVITY_ROLLOUT_GATE', 'return true; // ACTIVITY_ROLLOUT_GATE'), finalRules)
  assert.match(finalRules, /return activityCreationEnabled\(\)\s*&& !exists/)
  assert.match(finalRules, /allow create: if socialUser\(\) && activityCreationEnabled\(\) && validNotice/)
  for (const text of ["invitationRequired(ids[index], planId)", "invitationRequired(added[0], planId)", "noticeRequired(data.recipientId, 'fr_'", "noticeRequired(resource.data.senderId, 'fa_'", 'invitationRemoved(uid, planId)', 'removedInvitationAt(3)']) assert.ok(maintenance.includes(text), text)
})
test('rollout generator fails closed on missing, duplicate or already paused gate', () => {
  assert.throws(() => maintenanceRules(''), /exactly one/)
  assert.throws(() => maintenanceRules(finalRules + finalRules), /exactly one/)
  assert.throws(() => maintenanceRules(maintenanceRules(finalRules)), /exactly one/)
})
test('rollout artifacts are reproducible, self-contained, use exact indexes and contain no project or credentials', () => {
  const indexes = read('firestore.indexes.json'), a = artifacts(finalRules, indexes)
  assert.deepEqual(a, artifacts(finalRules, indexes))
  assert.equal(a['firestore.final.rules'], finalRules)
  assert.equal(a['firestore.indexes.json'], indexes)
  for (const state of ['final', 'maintenance']) assert.deepEqual(JSON.parse(a[`firebase.${state}.json`]), {
    firestore: { rules: `firestore.${state}.rules`, indexes: 'firestore.indexes.json' },
  })
  const hashes = JSON.parse(a['manifest.json'])
  for (const [name, hash] of Object.entries(hashes)) assert.equal(hash, require('node:crypto').createHash('sha256').update(a[name]).digest('hex'))
})
function services(paused) {
  let calls = 0
  const sdk = { doc: () => 'ref', collection: () => 'collection', serverTimestamp: () => ({}),
    runTransaction: async () => { calls++; throw new Error('TRANSACTION_REACHED') } }
  const code = ['src/socialMaintenance.js', 'src/activityLogic.js', 'src/jointPlanLogic.js', 'src/services/friends.js', 'src/services/jointPlans.js'].map(file => clean(read(file))).join('\n')
  const api = new Function('__SOCIAL_MAINTENANCE__', 'sdk', 'db', 'auth', `const {doc,collection,serverTimestamp,runTransaction}=sdk;\n${code}\nreturn {sendFriendRequest,respondToFriendRequest,createJointPlan,inviteJointParticipant,updatePlanMembership,deleteJointPlan,renameJointPlan,closeJointPlan,socialMaintenanceMessage,friendsError}`)(paused, sdk, {}, { currentUser: { uid: 'a', emailVerified: true } })
  return { api, calls: () => calls }
}
const blocked = api => [
  () => api.sendFriendRequest('a', 'b'),
  () => api.respondToFriendRequest('a', 'b:a', 'accepted'),
  () => api.createJointPlan('a', 'career', ['b'], 'Plan'),
  () => api.inviteJointParticipant('a', 'p', 'b'),
]
test('rollout maintenance services block all four new-event actions before SDK work, never report success', async () => {
  const h = services(true)
  for (const action of blocked(h.api)) {
    await assert.rejects(action(), error => h.api.friendsError(error) === h.api.socialMaintenanceMessage)
  }
  assert.equal(h.calls(), 0)
})
test('rollout normal services retain the four transaction entry points', async () => {
  const h = services(false)
  for (const action of blocked(h.api)) await assert.rejects(action(), /TRANSACTION_REACHED/)
  assert.equal(h.calls(), 4)
})
test('rollout maintenance does not locally disable rejection, membership, cleanup, rename or close', async () => {
  const h = services(true), a = h.api
  for (const action of [() => a.respondToFriendRequest('a','b:a','rejected'), () => a.updatePlanMembership('a','p',false),
    () => a.updatePlanMembership('a','p',true), () => a.deleteJointPlan('a','p'), () => a.renameJointPlan('a','p','Name'), () => a.closeJointPlan('a','p')]) {
    await assert.rejects(action(), /TRANSACTION_REACHED/)
  }
  assert.equal(h.calls(), 6)
})
function render(file, name, paused, props, states = []) {
  let index = 0
  const api = { Fragment: 'fragment', socialMaintenance: paused, socialMaintenanceMessage: 'Social maintenance', auth: { currentUser: props?.user }, careers: [],
    useState: initial => [index < states.length ? states[index++] : (index++, initial), () => {}],
    useRef: value => ({ current: value }), useEffect: () => {},
    ProgressSharingSettings: 'sharing', DeleteJointPlan: 'delete', PlanningDialog: 'dialog', AcademicSummary: 'summary',
    invitedBy: () => 'a', fallbackPlanName: () => 'Plan', h: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) }
  vm.createContext(api)
  vm.runInContext(transformSync(file, clean(read(file)), { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }).code, api)
  return api[name](props)
}
const nodes = n => n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(nodes)] : []
const text = n => n && typeof n === 'object' ? (n.children || []).map(text).join('') : typeof n === 'string' ? n : ''
test('rollout maintenance notice is accessible, explicit and absent from normal UI', () => {
  const path = 'src/components/SocialMaintenanceNotice.jsx'
  assert.equal(render(path,'SocialMaintenanceNotice',false),null)
  const n = render(path,'SocialMaintenanceNotice',true)
  assert.equal(n.type,'aside'); assert.equal(n.props.role,'status'); assert.equal(text(n),'Social maintenance')
  assert.ok(read('src/main.jsx').includes('<SocialMaintenanceNotice />'))
})
test('rollout Friends UI disables send/accept only, preserves reject and search', () => {
  for (const paused of [false,true]) {
    const tree = render('src/components/FriendsPage.jsx','FriendsPage',paused,{user:{uid:'a'},socialProfile:{ready:true},careerId:'c'},
      ['', {uid:'new'},true,[{id:'b:a',senderId:'b',recipientId:'a',participants:['b','a'],status:'pending'}],{},false,'','',false,0])
    const buttons = nodes(tree).filter(n=>n.type==='button')
    for (const label of ['Enviar solicitud','Aceptar']) assert.equal(Boolean(buttons.find(n=>text(n).trim()===label).props.disabled),paused)
    for (const label of ['Rechazar','Buscar']) assert.equal(Boolean(buttons.find(n=>text(n).trim()===label).props.disabled),false)
  }
})
test('rollout JointPlan UI disables creation/invitation while preserving existing-plan operations', () => {
  for (const paused of [false,true]) {
    const plan={id:'p',ownerId:'a',memberIds:['a'],inviteeIds:['b'],closed:false}
    const props={user:{uid:'a'},career:{subjects:[]},data:{plans:[plan],selected:plan,rows:[],rowsState:'ready',state:'ready'},people:[],friends:{ids:['b'],state:'ready'},nameOf:x=>x,titleOf:()=> 'Plan',planId:'p'}
    const tree=render('src/components/JointPlanPanel.jsx','JointPlanPanel',paused,props)
    const buttons=nodes(tree).filter(n=>n.type==='button')
    for(const label of ['Nuevo plan','Agregar participante']) assert.equal(Boolean(buttons.find(n=>text(n)===label).props.disabled),paused)
    for(const label of ['Renombrar','Cerrar plan','Agregar materia']) assert.equal(Boolean(buttons.find(n=>text(n)===label).props.disabled),false)
    const dialog=render('src/components/JointPlanPanel.jsx','JointPlanPanel',paused,{...props,showCreate:true},['',['b'],false,'','',null])
    assert.equal(Boolean(nodes(dialog).find(n=>n.type==='button'&&text(n)==='Crear plan e invitar').props.disabled),paused)
  }
})
test('rollout build flag is explicit, validated, build-only and independent from Emulator isolation', () => {
  const config = new Function('process', read('vite.config.js').replace('export default ', '') + ';return config')
  assert.deepEqual(config({env:{}})({command:'build',mode:'production'}),{define:{__SOCIAL_MAINTENANCE__:false}})
  assert.deepEqual(config({env:{CORRELATIVAS_SOCIAL_MAINTENANCE:'1'}})({command:'build',mode:'production'}),{define:{__SOCIAL_MAINTENANCE__:true}})
  assert.throws(()=>config({env:{CORRELATIVAS_SOCIAL_MAINTENANCE:'0'}})({command:'build',mode:'production'}),/INVALID/)
  assert.throws(()=>config({env:{CORRELATIVAS_SOCIAL_MAINTENANCE:'1'}})({command:'serve',mode:'production'}),/BUILD_ONLY/)
  assert.throws(()=>config({env:{CORRELATIVAS_SOCIAL_MAINTENANCE:'1'}})({command:'build',mode:'emulator'}),/EMULATOR_BUILD_FORBIDDEN/)
  assert.match(read('scripts/build-social-maintenance.cjs'), /'build', '--mode', 'production'/)
})
