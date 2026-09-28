const fs = require('node:fs'), vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const nodes = n => n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(nodes)] : []
const text = n => n && typeof n === 'object' ? (n.children || []).map(text).join(' ') : typeof n === 'string' ? n : ''
function harness(file, name, dependencies = {}) {
  const slots = []; let cursor = 0
  const api = { ...dependencies, Fragment: 'fragment',
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value }] },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value } },
    h: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
  }
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, '').replace(/export default /g, '')
  vm.createContext(api)
  vm.runInContext(transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }).code, api)
  return { render(props) { cursor = 0; return api[name](props) } }
}
module.exports = { harness, nodes, text }
