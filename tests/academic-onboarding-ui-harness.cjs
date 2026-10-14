const fs = require('node:fs'), vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const nodes = n => n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(nodes)] : []
const text = n => n && typeof n === 'object' ? (n.children || []).map(text).join(' ').replace(/\s+/g, ' ').trim() : typeof n === 'string' || typeof n === 'number' ? String(n) : ''
function harness(file, name, dependencies = {}) {
  const slots = []; let cursor = 0, effects = []
  const api = { ...dependencies, Fragment: 'fragment',
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value } },
    useMemo(fn, ds) { const i = cursor++; if (!slots[i] || ds.some((d, j) => !Object.is(d, slots[i].deps[j]))) slots[i] = { deps: ds, value: fn() }; return slots[i].value },
    useEffect(fn, ds) { const i = cursor++; if (!slots[i] || ds.some((d, j) => !Object.is(d, slots[i].deps[j]))) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps: ds, cleanup: fn() } }) },
    h: (type, props, ...children) => typeof type === 'function' ? type({ ...props, children: children.flat(Infinity) }) : { type, props: props || {}, children: children.flat(Infinity) },
  }
  const source = fs.readFileSync(file, 'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/^import ['"][^'"]+['"]\s*$/gm, '').replace(/export default /g, '').replace(/export /g, '')
  vm.createContext(api)
  vm.runInContext(transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }).code, api)
  return { render(...args) { cursor = 0; const tree = api[name](...args), run = effects; effects = []; run.forEach(fn => fn()); return tree },
    stop() { slots.forEach(slot => slot?.cleanup?.()) } }
}
module.exports = { harness, nodes, text }
