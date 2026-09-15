const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

function presentation() {
  const context = vm.createContext({})
  for (const file of ['src/planningLogic.js', 'src/planningPresentation.js']) {
    vm.runInContext(source(file).replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export /g, ''), context)
  }
  return context
}
const flatten = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(flatten)]

test('subject picker preserves unknown people in all/subset grouping and searches names or codes', () => {
  const p = presentation()
  const subjects = [{ code: 'A', name: 'Álgebra' }, { code: 'B', name: 'Redes' }]
  const ready = (uid) => ({ uid, state: 'ready', snapshot: { availableToCourseCodes: ['A'] } })
  const groups = p.groupCourseChoices(subjects, [ready('a'), ready('b'), { uid: 'c', state: 'disabled' }])
  assert.equal(groups[0].rows.length, 0)
  assert.equal(groups[1].rows[0].total, 3)
  assert.equal(groups[1].rows[0].missing.length, 1)
  assert.equal(groups[2].rows[0].subject.code, 'B')
  assert.equal(p.groupCourseChoices(subjects, [ready('a'), ready('b')])[0].rows.length, 1)
  assert.equal(p.groupCourseChoices(subjects, [], 'redes')[2].rows[0].subject.code, 'B')
  for (const [layer, verb] of [['approved', 'aprobaron'], ['available', 'pueden cursarla'], ['finals', 'tienen final pendiente']]) {
    assert.equal(p.comparisonLabel(groups[1].rows[0], layer), `2/3 ${verb}`)
  }
})

test('review distinguishes invitations, departed people and missing academic information', () => {
  const p = presentation()
  const plan = { ownerId: 'a', inviteeIds: ['b'], memberIds: ['a'] }
  const results = p.coursePeople(plan, 'A', ['a', 'b', 'c'], [
    { uid: 'a', state: 'ready', snapshot: { availableToCourseCodes: [] } },
    { uid: 'b', state: 'disabled' },
    { uid: 'c', state: 'ready', snapshot: { availableToCourseCodes: ['A'] } },
  ])
  assert.equal(results[0].known, true)
  assert.equal(results[0].eligible, false)
  assert.equal(results[1].membership, 'Invitación pendiente')
  assert.equal(results[1].known, false)
  assert.equal(results[2].membership, 'Ya no participa')
  assert.equal(results[2].eligible, false)
  assert.deepEqual(Array.from(p.initialPlannedIds(plan, null, ['a', 'b', 'c', 'a'])), ['a', 'b'])
  assert.deepEqual(Array.from(p.initialPlannedIds(plan, { proposedParticipantIds: ['b', 'c'] }, ['a'])), ['b'])
})

test('shared add dialog reviews first, prevents loading overwrites and saves only on explicit confirmation', async () => {
  const p = presentation(); const user = { uid: 'a' }; const calls = []
  const auth = { currentUser: user }
  const hook = harness('src/components/AddPlanSubjectDialog.jsx', 'AddPlanSubjectDialog', {
    auth, groupCourseChoices: p.groupCourseChoices, initialPlannedIds: p.initialPlannedIds,
    PlanningDialog: 'dialog', AcademicSummary: 'summary', saveJointSubject: async (...args) => calls.push(args),
  })
  let saved = 0
  const plan = { id: 'p', ownerId: 'a', inviteeIds: ['b'], memberIds: ['a', 'b'] }
  const props = { user, career: { subjects: [{ code: 'A', name: 'Álgebra' }] }, request: { code: 'A', matchingIds: ['a', 'b', 'outside'] },
    plans: [plan], plan, titleOf: () => 'Mi plan', nameOf: (uid) => uid, people: [], rows: null, rowsState: 'loading', onSaved: () => saved++, onClose: () => {},
  }
  hook.render(props)
  const render = () => flatten(hook.render(props))
  const saveButton = (nodes) => nodes.find((n) => n.type === 'button' && n.children.includes('Agregar al plan'))
  assert.equal(saveButton(render()).props.disabled, true)
  await saveButton(render()).props.onClick()
  assert.equal(calls.length, 0)
  props.rows = []; props.rowsState = 'ready'; render()
  const nodes = render()
  assert.equal(nodes.filter((n) => n.type === 'input' && n.props.checked).length, 2)
  assert.equal(calls.length, 0)
  await saveButton(nodes).props.onClick()
  assert.equal(calls.length, 1); assert.equal(saved, 1)
  assert.deepEqual(Array.from(calls[0][3]), ['a', 'b'])
  const other = { id: 'other', ownerId: 'a', inviteeIds: ['c'], memberIds: ['a', 'c'] }
  props.plan = other; props.plans = [plan, other]; render()
  assert.equal(render().filter((n) => n.type === 'input' && n.props.checked).length, 1)
  assert.equal(saveButton(render()).props.disabled, true)
  assert.equal(calls.length, 1, 'changing destination never writes or carries outsiders')
  props.plan = plan; render()
  auth.currentUser = null
  await saveButton(render()).props.onClick()
  assert.equal(calls.length, 1)
  hook.stop()
})

test('plan academic context never reads a nonfriend and releases listeners when its context changes', () => {
  const user = { uid: 'a' }; const listeners = []
  const hook = harness('src/hooks/usePlanAcademicContext.js', 'usePlanAcademicContext', {
    auth: { currentUser: user }, subscribePlanningComparison: (uid, career, callback) => {
      const item = { uid, callback }; listeners.push(item); return () => { item.stopped = true }
    },
  })
  const career = { id: 'c' }; const mine = [{ uid: 'a', state: 'ready' }]
  let result = hook.render(user, career, ['a', 'b', 'c'], ['b'], mine, 0)
  assert.deepEqual(listeners.map((l) => l.uid), ['b'])
  assert.equal(result[2].state, 'unrelated')
  listeners[0].callback({ state: 'ready', snapshot: {} })
  assert.equal(hook.render(user, career, ['a', 'b', 'c'], ['b'], mine, 0)[1].state, 'ready')
  result = hook.render(user, career, ['a', 'c'], [], mine, 0)
  assert.equal(listeners[0].stopped, true)
  listeners[0].callback({ state: 'ready' })
  assert.equal(result.length, 2)
  hook.stop()
})

// Minimal hook scheduler: invokes the actual hooks and checks stale callback/cleanup behavior.
function harness(file, name, dependencies = {}) {
  const slots = []
  let cursor = 0
  let effects = []
  const api = { ...dependencies,
    Fragment: 'fragment',
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }]
    },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value } },
    useEffect(callback, deps) {
      const i = cursor++
      if (!slots[i] || deps.some((dep, n) => !Object.is(dep, slots[i].deps[n]))) {
        effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: callback() } })
      }
    },
    h: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
  }
  vm.createContext(api)
  let code = source(file).replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export default /g, '').replace(/export /g, '')
  if (file.endsWith('.jsx')) code = transformSync(file, code, { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }).code
  vm.runInContext(code, api)
  return { api, render(...args) { cursor = 0; const value = api[name](...args); const pending = effects; effects = []; pending.forEach((effect) => effect()); return value },
    stop() { slots.forEach((slot) => slot?.cleanup?.()) } }
}

test('multi hook clears a removed friend immediately and ignores late snapshot/profile callbacks', async () => {
  const user = { uid: 'alice' }; const auth = { currentUser: user }
  const friendships = []; const snapshots = []; const profiles = []
  const hook = harness('src/hooks/usePlanningParticipants.js', 'usePlanningParticipants', { auth,
    subscribeFriendships: (uid, data, error) => { const item = { data, error }; friendships.push(item); return () => { item.stopped = true } },
    loadSocialProfiles: () => new Promise((resolve) => profiles.push(resolve)),
    subscribePlanningComparison: (uid, career, data) => { const item = { uid, data }; snapshots.push(item); return () => { item.stopped = true } },
  })
  const career = { id: 'career' }
  hook.render(user, career, ['bob'])
  const load = friendships[0].data([{ status: 'accepted', participants: ['alice', 'bob'] }])
  hook.render(user, career, ['bob'])
  snapshots[0].data({ state: 'ready', snapshot: { approvedCodes: ['A'] } })
  assert.equal(hook.render(user, career, ['bob']).participants[0].state, 'ready')
  assert.equal(hook.render(user, career, []).participants.length, 0)
  assert.equal(snapshots[0].stopped, true)
  snapshots[0].data({ state: 'ready', snapshot: { approvedCodes: ['late'] } })
  friendships[0].error()
  profiles[0]({ bob: { name: 'Old result' } }); await load
  assert.equal(hook.render(user, career, ['bob']).participants[0].state, 'unavailable')
  assert.equal(hook.render(user, career, ['bob']).friends.state, 'error')
  hook.stop()
})

test('joint hook discards subjects immediately on leave and stops all listeners on signout/unmount', () => {
  const user = { uid: 'bob' }; const auth = { currentUser: user }; const lists = []; const rows = []
  const hook = harness('src/hooks/useJointPlans.js', 'useJointPlans', { auth,
    subscribeJointPlans: (uid, owner, data) => { const item = { owner, data }; lists.push(item); return () => { item.stopped = true } },
    subscribeJointSubjects: (id, data) => { const item = { data }; rows.push(item); return () => { item.stopped = true } },
  })
  const args = [user, 'career', 'p', 0]
  hook.render(...args)
  lists.find((x) => x.owner === 'bob').data([])
  const plan = { id: 'p', careerId: 'career', ownerId: 'alice', memberIds: ['alice', 'bob'], inviteeIds: ['bob'], closed: false, updatedAt: 1 }
  lists.find((x) => x.owner === 'invitations').data([plan])
  hook.render(...args)
  rows[0].data([{ code: 'A' }])
  assert.equal(hook.render(...args).rows.length, 1)
  lists.find((x) => x.owner === 'invitations').data([])
  assert.equal(hook.render(...args).rows, null)
  assert.equal(rows[0].stopped, true)
  rows[0].data([{ code: 'late' }])
  assert.equal(hook.render(...args).rows, null)
  auth.currentUser = null; hook.stop()
  assert.ok(lists.every((x) => x.stopped))
})

test('delete progress requires explicit confirmation, focuses cancel and blocks duplicate submissions', async () => {
  const hook = harness('src/components/DeleteCareerProgress.jsx', 'DeleteCareerProgress')
  let calls = 0; let finish; let opened = 0; let closed = 0; let focused = false
  const tree = hook.render({ careerName: 'Career / plan', reset: () => { calls++; return new Promise((resolve) => { finish = resolve }) } })
  function all(node) { return !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(all)] }
  const nodes = all(tree)
  const dialog = nodes.find((node) => node.type === 'dialog')
  const buttons = nodes.filter((node) => node.type === 'button')
  dialog.props.ref.current = { showModal: () => opened++, close: () => closed++ }
  buttons[1].props.ref.current = { focus: () => { focused = true } }
  buttons[0].props.onClick()
  assert.equal(opened, 1); assert.equal(focused, true); assert.equal(calls, 0)
  buttons[1].props.onClick(); assert.equal(calls, 0)
  buttons[0].props.onClick()
  const pending = buttons[2].props.onClick()
  buttons[2].props.onClick()
  let blockedEscape = false
  dialog.props.onCancel({ preventDefault: () => { blockedEscape = true } })
  assert.equal(blockedEscape, true); assert.equal(calls, 1)
  finish(); await pending
  assert.equal(closed, 2)
  assert.ok(nodes.some((node) => node.children.includes('Sí, borrar progreso')))
})

test('App reset retains its original transform and is exposed only in the subjects panel', () => {
  const app = source('src/App.jsx')
  assert.match(app, /function reset\(\) \{\s*return persistStatus\(\(\) => initialStatus\)\s*\}/)
  assert.match(app, /<SubjectsPanel\s+key=\{activeCareerId\}\s+reset=\{reset\}/)
  assert.doesNotMatch(source('src/components/Header.jsx'), /Reiniciar|reset=|onClick=\{reset\}/)
})

test('delete plan requires confirmation, blocks duplicates and keeps the dialog open on failure', async () => {
  const hook = harness('src/components/DeleteJointPlan.jsx', 'DeleteJointPlan')
  let calls = 0; let finish; let opened = 0; let closed = 0; let focused = false
  const tree = hook.render({ name: '2C 2027', busy: false, onDelete: () => { calls++; return new Promise((resolve) => { finish = resolve }) } })
  const flatten = (node) => !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten)]
  const nodes = flatten(tree)
  const dialog = nodes.find((node) => node.type === 'dialog')
  const buttons = nodes.filter((node) => node.type === 'button')
  dialog.props.ref.current = { showModal: () => opened++, close: () => closed++ }
  buttons[1].props.ref.current = { focus: () => { focused = true } }
  buttons[0].props.onClick()
  assert.equal(calls, 0); assert.equal(opened, 1); assert.equal(focused, true)
  const failed = buttons[2].props.onClick()
  buttons[2].props.onClick()
  assert.equal(calls, 1)
  finish(false); await failed; assert.equal(closed, 0)
  const success = buttons[2].props.onClick()
  let prevented = false
  dialog.props.onCancel({ preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
  finish(true); await success; assert.equal(closed, 1)
  assert.ok(nodes.some((node) => node.children.includes('Sí, eliminar plan')))
})

test('closed membership keeps the subjects subscription, deletion lock clears it', () => {
  const user = { uid: 'bob' }; const lists = []; const rows = []
  const hook = harness('src/hooks/useJointPlans.js', 'useJointPlans', { auth: { currentUser: user },
    subscribeJointPlans: (uid, owner, data) => { lists.push({ owner, data }); return () => {} },
    subscribeJointSubjects: (id, data) => { const item = { data }; rows.push(item); return () => { item.stopped = true } },
  })
  const args = [user, 'career', 'p', 0]
  hook.render(...args)
  const plan = { id: 'p', careerId: 'career', ownerId: 'alice', inviteeIds: ['bob'], memberIds: ['alice', 'bob'], closed: true, updatedAt: 1 }
  lists[0].data([]); lists[1].data([plan])
  hook.render(...args)
  rows[0].data([{ code: 'A' }])
  assert.equal(hook.render(...args).rows.length, 1)
  lists[1].data([{ ...plan, deleting: true }])
  assert.equal(hook.render(...args).rows, null)
  assert.equal(rows[0].stopped, true)
  hook.stop()
})
