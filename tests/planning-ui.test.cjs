const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

// Minimal hook scheduler: invokes the actual hooks and checks stale callback/cleanup behavior.
function harness(file, name, dependencies = {}) {
  const slots = []
  let cursor = 0
  let effects = []
  const api = { ...dependencies,
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
  if (file.endsWith('.jsx')) code = transformSync(file, code, { jsx: { runtime: 'classic', pragma: 'h' } }).code
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
  const args = [user, 'career', ['alice'], 'p', 0]
  hook.render(...args)
  lists.find((x) => x.owner === 'bob').data([])
  const plan = { id: 'p', careerId: 'career', ownerId: 'alice', memberIds: ['alice', 'bob'], inviteeIds: ['bob'], closed: false, updatedAt: 1 }
  lists.find((x) => x.owner === 'alice').data([plan])
  hook.render(...args)
  rows[0].data([{ code: 'A' }])
  assert.equal(hook.render(...args).rows.length, 1)
  lists.find((x) => x.owner === 'alice').data([])
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
