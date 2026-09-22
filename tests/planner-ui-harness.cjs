const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const nodes = n => n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(nodes)] : []
const text = n => n && typeof n === 'object' ? (n.children || []).map(text).join(' ').replace(/\s+/g, ' ').trim() : typeof n === 'string' || typeof n === 'number' ? String(n) : ''

function runtime() {
  const { api } = require('./planner-loader.cjs')()
  const slots = [], effects = [], workers = []
  let cursor = 0, pending = [], workerFailure = false
  Object.assign(api, {
    Date, Fragment: 'fragment',
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }]
    },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i] },
    useMemo: fn => fn(),
    useEffect(fn, deps) {
      const i = cursor++
      if (!effects[i] || !deps || deps.some((d, index) => d !== effects[i].deps[index])) pending.push(() => {
        effects[i]?.cleanup?.()
        effects[i] = { deps, cleanup: fn() }
      })
    },
    createPlannerWorker() {
      if (workerFailure) throw new Error('Worker unavailable')
      const worker = { messages: [], terminated: false,
        postMessage(message) { this.messages.push(structuredClone(message)) },
        terminate() { this.terminated = true },
        reply(data) { this.onmessage({ data }) },
        complete() { this.reply(api.runPlannerWorkerRequest(this.messages[0])) },
      }
      workers.push(worker); return worker
    },
    h: (type, props, ...children) => typeof type === 'function' ? type({ ...props, children: children.flat(Infinity) })
      : { type, props: props || {}, children: children.flat(Infinity) },
  })
  function load(file, defaultName) {
    let code = source(file)
    const exports = [...code.matchAll(/export (?:function|const) (\w+)/g)].map(m => m[1])
    if (defaultName) exports.push(defaultName)
    code = code.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"]\s*\r?\n/g, '').replace(/export default /g, '').replace(/export /g, '')
    if (file.endsWith('.jsx')) code = transformSync(file, code, { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }).code
    vm.runInContext(`(() => { ${code}\nObject.assign(globalThis, {${exports.join(',')}}) })()`, api)
  }
  for (const file of ['src/plannerSession.js', 'src/plannerWorkerController.js', 'src/plannerPresentation.js', 'src/workers/plannerWorkerProtocol.js']) load(file)
  load('src/hooks/usePlannerSession.js', 'usePlannerSession')
  load('src/hooks/usePlannerSuggestion.js', 'usePlannerSuggestion')
  load('src/components/Planner.jsx', 'Planner')
  return { api, workers, load,
    failWorkers(value) { workerFailure = value },
    render(fn, flush = true) { cursor = 0; const result = fn(); if (flush) this.flush(); return result },
    flush() { const tasks = pending; pending = []; tasks.forEach(fn => fn()) },
    unmount() { effects.forEach(e => e?.cleanup?.()) },
  }
}
function plannerHarness(subjects, extra = {}) {
  const r = runtime()
  const props = { subjects, statusMap: {}, selectedCodes: [], targetPeriod: { year: 2027, term: '1C' }, desiredCount: 4, scopeKey: 'user:career', ...extra }
  const changes = []
  for (const [field, setter] of [['selectedCodes', 'setSelectedCodes'], ['targetPeriod', 'setTargetPeriod'], ['desiredCount', 'setDesiredCount']]) {
    props[setter] = value => { props[field] = typeof value === 'function' ? value(props[field]) : value; changes.push(field) }
  }
  const render = flush => r.render(() => r.api.Planner(props), flush)
  const button = label => nodes(render()).find(n => n.type === 'button' && (n.props['aria-label'] === label || text(n) === label))
  return { ...r, props, changes, render, button, text: () => text(render()),
    control: id => nodes(render()).find(n => n.props.id === id || n.props['aria-label'] === id),
    click: label => { const b = button(label); if (!b) throw new Error(`Button missing: ${label}`); b.props.onClick() },
    complete: () => r.workers.at(-1).complete(),
  }
}
module.exports = { runtime, plannerHarness, nodes, text, source }
