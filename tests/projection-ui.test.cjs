const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
const clean = text => text.replace(/import[^\n]*\n/g, '').replace(/export default /g, '').replace(/export /g, '')
const subject = (code, extra = {}) => ({ code, name: `Materia ${code}`, prereqs: [], ...extra })
const props = (subjects, statusMap = {}) => ({ career: { id: 'test', name: 'Carrera', plan: '1', subjects }, statusMap })
function harness(input, confirm = () => false) {
  const slots = []; let cursor = 0; let calls = 0
  const api = {
    Date, Fragment: 'fragment', window: { confirm },
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }]
    },
    useRef(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = { current: initial }
      return slots[i]
    },
    useMemo: fn => fn(),
    h: (type, props, ...children) => typeof type === 'function' ? type({ ...props, children: children.flat(Infinity) })
      : { type, props: props || {}, children: children.flat(Infinity) },
  }
  vm.createContext(api)
  for (const file of ['src/logic.js', 'src/projectionLogic.js']) vm.runInContext(clean(source(file)), api)
  const engine = api.projectCareer
  api.projectCareer = input => { calls++; return engine(input) }
  for (const file of ['src/components/FinalPlanningPanel.jsx', 'src/components/CareerProjectionPage.jsx']) {
    vm.runInContext(transformSync(file, clean(source(file)),
      { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }).code, api)
  }
  const render = () => { cursor = 0; return api.CareerProjectionPage(input) }
  const nodes = node => node && typeof node === 'object' ? [node, ...(node.children || []).flatMap(nodes)] : []
  const text = node => node && typeof node === 'object' ? (node.children || []).map(text).join(' ').replace(/\s+/g, ' ').trim() : typeof node === 'string' || typeof node === 'number' ? String(node) : ''
  const generate = () => nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  return { render, nodes, text, generate, calls: () => calls,
    load(value) { nodes(render()).find(n => n.props.id === 'projection-load').props.onChange({ target: { value: String(value) } }) },
    start(year, term = '1C') {
      nodes(render()).find(n => n.props.type === 'number' && n.props.id !== 'projection-load').props.onChange({ target: { value: String(year) } })
      nodes(render()).find(n => n.type === 'select').props.onChange({ target: { value: term } })
    },
    edit(action, code, period) {
      const label = `${action} Materia ${code} ${action === 'Quitar' ? 'de' : 'a'} ${period}`
      nodes(render()).find(n => n.props['aria-label'] === label).props.onClick()
    },
  }
}

test('setup waits for explicit generation, defaults to four and displays estimated dates', () => {
  const h = harness(props([subject('A')]))
  const initial = h.render()
  assert.match(h.text(initial), /¿Con qué carga querés comenzar/)
  assert.equal(h.nodes(initial).find(n => n.props.id === 'projection-load').props.value, 4)
  assert.equal(h.calls(), 0)
  h.start(2030); h.generate()
  const text = h.text(h.render())
  assert.match(text, /Fin estimado de cursadas 1C 2030/)
  assert.match(text, /pendiente de planificar finales/)
  assert.match(text, /Al cierre: Regularizada/)
  assert.doesNotMatch(text, /Al cierre: Aprobada/)
})

function persistedInput(subjects, statusMap = {}, scenario = null) {
  const input = props(subjects, statusMap)
  const changes = [], resets = []
  input.persistence = { phase: scenario ? 'saved' : 'empty', scenario,
    change(next) { changes.push(next); this.scenario = next; this.phase = 'saving' },
    reset() { resets.push(true) }, retry() {} }
  return { input, changes, resets }
}
const savedScenario = () => ({ startPeriod: { year: 2027, term: '1C' }, initialCapacity: 4, maxPeriods: 40, capacities: [], manualPeriods: [], finalEvents: [] })
const chooseFilter = (h, label) => h.nodes(h.render()).find(n => n.type === 'button' && h.text(n).startsWith(`${label} (`)).props.onClick()
const editFinal = (h, name) => {
  let button = h.nodes(h.render()).find(n => ['Planificar final de ', 'Cambiar período del final de '].some(prefix => n.props['aria-label'] === prefix + name))
  if (!button) { chooseFilter(h, 'Todos'); button = h.nodes(h.render()).find(n => n.props['aria-label'] === `Planificar final de ${name}`) }
  button.props.onClick()
}
const finalTerm = (h, name, period) => h.nodes(h.render()).find(n => n.props['aria-label'] === `${period} para el final de ${name}`)
const removeFinal = (h, name) => h.nodes(h.render()).find(n => n.props['aria-label'] === `Quitar período del final de ${name}`).props.onClick()
const finalsPanel = h => h.nodes(h.render()).find(n => n.type === 'details' && n.props.className === 'side-card projection-finals')
const finalRows = h => h.nodes(finalsPanel(h)).find(n => n.props.className === 'projection-subjects projection-final-list').children.filter(n => n?.type === 'li')

test('final filters overlap, default to relevant, prioritize review, and never save', () => {
  const s=savedScenario()
  s.finalEvents=[{code:'Z',period:s.startPeriod},{code:'F',period:s.startPeriod},{code:'D',period:s.startPeriod}]
  const {input,changes}=persistedInput([subject('A'),subject('F'),subject('Z',{finalPrereqs:['A']}),subject('D'),subject('G')],
    {A:'Regularizada',Z:'Regularizada',D:'Aprobada'},s),h=harness(input)
  const before=JSON.stringify(s)
  assert.deepEqual(finalRows(h).map(n=>n.props.key),['Z','A','F','D'])
  assert.match(h.text(finalsPanel(h)),/1 requieren revisión · 1 planificados/)
  const expected={ 'Relevantes':4, 'Requiere revisión':1, 'Planificados':1, 'Pendientes reales':2, 'Futuros':2, 'Ya aprobados':1, 'Todos':5 }
  for(const [label,count] of Object.entries(expected)) {
    chooseFilter(h,label)
    assert.equal(finalRows(h).length,count)
    const buttons=h.nodes(finalsPanel(h)).filter(n=>n.props['aria-pressed']!==undefined)
    assert.equal(buttons.filter(n=>n.props['aria-pressed']).length,1)
    assert.ok(buttons.some(n=>h.text(n).replace(/\(\s*(\d+)\s*\)/g,'($1)')===`${label} (${count})`&&n.props['aria-pressed']))
  }
  assert.equal(changes.length,0); assert.equal(JSON.stringify(s),before)
  assert.ok(!h.nodes(finalsPanel(h)).some(n=>n.type==='input'))
})

test('year navigation is local, all engine years remain accessible, and only period decisions save', () => {
  const s=savedScenario(); s.maxPeriods=40
  const {input,changes}=persistedInput([subject('A')],{A:'Regularizada'},s),h=harness(input)
  editFinal(h,'Materia A')
  const select=h.nodes(h.render()).find(n=>n.props['aria-label']==='Año del final de Materia A')
  assert.deepEqual(select.children.map(n=>n.props.value),Array.from({length:20},(_,i)=>2027+i))
  select.props.onChange({target:{value:'2046'}})
  assert.equal(changes.length,0)
  finalTerm(h,'Materia A','2C 2046').props.onClick()
  assert.equal(changes.length,1)
  assert.equal(changes[0].finalEvents[0].period.year,2046)
  assert.equal(changes[0].finalEvents[0].period.term,'2C')
  removeFinal(h,'Materia A')
  assert.equal(changes.length,2); assert.equal(changes[1].finalEvents.length,0)
})

test('editing row survives category changes and even removal from engine rows without stale eligibility', () => {
  const s=savedScenario(); s.finalEvents=[{code:'A',period:s.startPeriod}]
  const {input,changes}=persistedInput([subject('A')],{A:'Regularizada'},s),h=harness(input)
  chooseFilter(h,'Planificados'); editFinal(h,'Materia A')
  const editorId=h.nodes(h.render()).find(n=>n.props['aria-expanded']===true).props['aria-controls']
  input.statusMap={A:'Aprobada'}
  assert.equal(finalRows(h).length,1)
  assert.match(h.text(finalsPanel(h)),/Ya aprobado en tu progreso|Intención inactiva/)
  assert.ok(h.nodes(h.render()).some(n=>n.props.id===editorId))
  assert.equal(changes.length,0)
  removeFinal(h,'Materia A')
  assert.equal(finalRows(h).length,1)
  assert.match(h.text(finalsPanel(h)),/Fuera de la lista actual/)
  assert.ok(!h.nodes(h.render()).some(n=>n.props['aria-label']?.startsWith('Cuatrimestre del final')))
  let focused=0
  finalsPanel(h).props.ref.current={querySelector:()=>({focus(){focused++}})}
  h.nodes(h.render()).find(n=>n.type==='button'&&h.text(n)==='Cerrar editor').props.onClick()
  assert.equal(focused,1); assert.equal(finalRows(h).length,0)
  assert.match(h.text(finalsPanel(h)),/No hay finales pendientes o planificados/)
  assert.equal(changes.length,1)
})

test('empty filters offer all rows and retain full long subject names', () => {
  const name='Una materia con un nombre académico muy largo que debe permanecer completo incluso en mobile'
  const {input,changes}=persistedInput([subject('A',{name})],{},savedScenario()),h=harness(input)
  assert.equal(finalRows(h).length,0)
  assert.match(h.text(finalsPanel(h)),/No hay finales en este filtro/)
  h.nodes(h.render()).find(n=>n.type==='button'&&h.text(n)==='Ver todos').props.onClick()
  assert.equal(finalRows(h).length,1)
  assert.ok(h.text(finalsPanel(h)).includes(name))
  assert.equal(changes.length,0)
})

test('timeline counts inactive separately, opens finals and focuses its native keyboard summary', () => {
  const s=savedScenario(); s.finalEvents=[{code:'A',period:s.startPeriod},{code:'C',period:s.startPeriod},{code:'D',period:s.startPeriod}]
  const {input,changes}=persistedInput([subject('A'),subject('B'),subject('C',{finalPrereqs:['B']}),subject('D')],
    {A:'Aprobada',C:'Regularizada'},s),h=harness(input)
  const tree=h.render(),timeline=h.nodes(tree).find(n=>n.props.className==='projection-period-finals')
  assert.match(h.text(timeline.children[0]),/Finales planificados: 2 · 1 requieren revisión · 1 inactivos/)
  assert.match(h.text(timeline),/Materia A · Ya aprobado en tu progreso/)
  assert.match(h.text(timeline),/Materia D · Aprobación supuesta al cierre/)
  const panel=finalsPanel(h); let focused=0
  const dom={open:false,querySelector(selector){assert.equal(selector,'summary'); return {focus(){focused++}}}}
  panel.props.ref.current=dom
  const go=h.nodes(timeline).find(n=>n.type==='button'&&h.text(n)==='Ir a Finales')
  assert.equal(go.props.type,'button'); go.props.onClick()
  assert.equal(dom.open,true); assert.equal(focused,1); assert.equal(changes.length,0)
  assert.equal(panel.children[0].type,'summary')
  assert.ok(!h.nodes(timeline).some(n=>n.type==='select'))
})

test('editor uses native keyboard controls, aligned accessible names and visible disabled-period reasons', () => {
  const s=savedScenario(); s.maxPeriods=2
  const {input}=persistedInput([subject('AN',{durationPeriods:2,allowedStartTerms:['1C']})],{},s),h=harness(input)
  chooseFilter(h,'Futuros'); editFinal(h,'Materia AN')
  const trigger=h.nodes(h.render()).find(n=>n.props['aria-label']==='Planificar final de Materia AN')
  assert.equal(trigger.type,'button'); assert.equal(trigger.props['aria-expanded'],true)
  assert.ok(h.nodes(h.render()).some(n=>n.props.id===trigger.props['aria-controls']))
  const disabled=finalTerm(h,'Materia AN','1C 2027')
  const reason=h.nodes(h.render()).find(n=>n.props.id===disabled.props['aria-describedby'])
  assert.match(h.text(reason),/Todavía no estaría regularizada/)
  assert.equal(disabled.props.disabled,true)
  const yearTree=h.render()
  const year=h.nodes(yearTree).find(n=>n.props['aria-label']==='Año del final de Materia AN')
  assert.equal(year.type,'select')
  assert.ok(h.nodes(yearTree).some(n=>n.type==='label'&&n.children.includes(year)))
  finalTerm(h,'Materia AN','2C 2027').props.onClick()
  const changed=h.nodes(h.render()).find(n=>n.props['aria-label']==='Cambiar período del final de Materia AN')
  assert.equal(h.text(changed),'Cambiar período'); assert.equal(changed.props['aria-controls'],trigger.props['aria-controls'])
  assert.ok(h.nodes(h.render()).filter(n=>n.type==='button').every(n=>n.props.tabIndex!==-1))
})

test('identical period diagnostics display once and both options reference the complete message', () => {
  const s=savedScenario(); s.maxPeriods=4
  s.manualPeriods=[{period:{year:2027,term:'1C'},codes:[]},{period:{year:2027,term:'2C'},codes:[]}]
  const {input,changes}=persistedInput([subject('A')],{},s),h=harness(input)
  editFinal(h,'Materia A')
  const editor=h.nodes(h.render()).find(n=>n.props.className==='projection-final-editor')
  const reasons=h.nodes(editor).filter(n=>n.type==='p'&&h.text(n)==='Todavía no estaría regularizada al cierre.')
  assert.equal(reasons.length,1)
  for(const term of ['1C','2C']) {
    const button=finalTerm(h,'Materia A',`${term} 2027`)
    assert.equal(button.props.disabled,true)
    assert.equal(button.props['aria-describedby'],reasons[0].props.id)
  }
  assert.match(h.text(editor),/^Período del final Año/)
  assert.doesNotMatch(h.text(finalsPanel(h)),/Un final puede aparecer en más de un filtro/)
  assert.equal(changes.length,0)
})

test('different period diagnostics remain individually associated without losing missing approvals', () => {
  const s=savedScenario(); s.maxPeriods=2
  const {input,changes}=persistedInput([subject('B'),subject('AN',{durationPeriods:2,allowedStartTerms:['1C'],finalPrereqs:['B']})],{B:'Regularizada'},s),h=harness(input)
  editFinal(h,'Materia AN')
  const first=finalTerm(h,'Materia AN','1C 2027'),second=finalTerm(h,'Materia AN','2C 2027')
  assert.notEqual(first.props['aria-describedby'],second.props['aria-describedby'])
  const tree=h.render()
  const reason=button=>h.nodes(tree).find(n=>n.props.id===button.props['aria-describedby'])
  assert.match(h.text(reason(first)),/Todavía no estaría regularizada al cierre/)
  assert.match(h.text(reason(second)),/Faltan aprobaciones requeridas para rendir\. Falta aprobar: Materia B\./)
  assert.equal(first.props.disabled,true); assert.equal(second.props.disabled,true)
  assert.equal(changes.length,0)
})

test('header owns sync controls, keeps error and conflict messages, and finals precede timeline', () => {
  const {input,changes}=persistedInput([subject('A')],{},savedScenario()),h=harness(input)
  let tree=h.render(),nodes=h.nodes(tree)
  const intro=nodes.find(n=>n.props.className==='side-card projection-intro')
  assert.match(h.text(intro),/Proyectar carrera Guardado Reiniciar proyección/)
  assert.ok(nodes.indexOf(nodes.find(n=>n.props.className==='side-card projection-finals'))<nodes.indexOf(nodes.find(n=>n.props.className==='projection-timeline')))
  let retries=0; input.persistence.retry=()=>{retries++}; input.persistence.phase='error'
  tree=h.render()
  assert.match(h.text(tree),/No se pudo guardar/)
  h.nodes(tree).find(n=>n.type==='button'&&h.text(n)==='Reintentar sincronización').props.onClick()
  assert.equal(retries,1)
  input.persistence.phase='conflict'
  assert.match(h.text(h.render()),/borrador local se conserva; no se sobrescribió la versión remota/)
  input.persistence.phase='resetting'
  assert.ok(h.nodes(h.render()).filter(n=>n.props.className==='projection-content').every(n=>n.props.disabled))
  assert.equal(changes.length,0)
})

test('real pending final editor saves only intention and hypothetical approval unlocks next-period course', () => {
  const s=savedScenario(); s.maxPeriods=4
  const {input,changes}=persistedInput([subject('A'),subject('B',{approvedPrereqs:['A']})],Object.freeze({A:'Regularizada'}),s)
  const h=harness(input); assert.match(h.text(h.render()),/Final pendiente real/)
  editFinal(h,'Materia A')
  assert.equal(finalTerm(h,'Materia A','1C 2027').props.disabled,false)
  finalTerm(h,'Materia A','1C 2027').props.onClick()
  assert.equal(changes.length,1); assert.equal(changes[0].finalEvents[0].code,'A')
  const text=h.text(h.render())
  assert.match(text,/Final planificado/); assert.match(text,/Finales planificados: 1/)
  assert.match(text,/Aprobación supuesta/); assert.equal(input.statusMap.A,'Regularizada')
  assert.match(text,/2C 2027/)
  removeFinal(h,'Materia A')
  assert.equal(changes.length,2); assert.equal(changes[1].finalEvents.length,0)
})

test('future annual final selector disables first close, enables second and labels academic completion conditionally', () => {
  const s=savedScenario(); s.maxPeriods=4
  const {input,changes}=persistedInput([subject('AN',{durationPeriods:2,allowedStartTerms:['1C']})],Object.freeze({}),s)
  const h=harness(input); chooseFilter(h,'Futuros'); assert.match(h.text(h.render()),/Final futuro/)
  editFinal(h,'Materia AN')
  assert.equal(finalTerm(h,'Materia AN','1C 2027').props.disabled,true)
  assert.equal(finalTerm(h,'Materia AN','2C 2027').props.disabled,false)
  finalTerm(h,'Materia AN','1C 2027').props.onClick(); assert.equal(changes.length,0)
  finalTerm(h,'Materia AN','2C 2027').props.onClick()
  const text=h.text(h.render())
  assert.match(text,/Finalización académica estimada: 2C 2027, si aprobás los finales planificados/)
  assert.doesNotMatch(text,/¡Carrera completada!|Carrera ya completada|Al cierre: Aprobada/)
  assert.ok(h.nodes(h.render()).some(n=>n.props['aria-label']==='Cambiar período del final de Materia AN'))
})

test('actual approval and reversal reevaluate preserved final without invoking autosave', () => {
  const s=savedScenario(); s.finalEvents=[{code:'A',period:s.startPeriod}]
  const {input,changes}=persistedInput([subject('A')],{A:'Regularizada'},s),h=harness(input)
  assert.match(h.text(h.render()),/Final planificado/)
  input.statusMap=Object.freeze({A:'Aprobada'})
  assert.match(h.text(h.render()),/Ya aprobado en tu progreso/)
  assert.match(h.text(h.render()),/Intención inactiva/)
  assert.match(h.text(h.render()),/¡Carrera completada!/)
  input.statusMap=Object.freeze({A:'Regularizada'})
  assert.match(h.text(h.render()),/Final planificado/)
  assert.equal(changes.length,0); assert.equal(input.persistence.scenario.finalEvents.length,1)
})

test('general finals editor retains removed, out-of-horizon and blocked events with explicit removal', () => {
  const s=savedScenario(); s.maxPeriods=2
  s.finalEvents=[{code:'GONE',period:s.startPeriod},{code:'A',period:{year:2030,term:'1C'}},{code:'B',period:s.startPeriod}]
  const {input,changes}=persistedInput([subject('A'),subject('B',{finalPrereqs:['A']})],{A:'Regularizada',B:'Regularizada'},s)
  const h=harness(input),text=h.text(h.render())
  assert.match(text,/Requiere revisión/); assert.match(text,/ya no está en el catálogo/)
  assert.match(text,/fuera del horizonte/); assert.match(text,/Falta aprobar: Materia A/)
  editFinal(h,'GONE'); removeFinal(h,'GONE')
  assert.equal(changes.length,1); assert.equal(changes[0].finalEvents.length,2)
})

test('moving a projected course leaves its final in place with review diagnostic', () => {
  const s=savedScenario(); s.finalEvents=[{code:'A',period:s.startPeriod}]
  const {input,changes}=persistedInput([subject('A')],{},s),h=harness(input)
  h.edit('Quitar','A','1C 2027')
  assert.equal(changes.length,1); assert.equal(changes[0].finalEvents[0].period.year,2027)
  assert.match(h.text(h.render()),/Requiere revisión/)
  assert.match(h.text(h.render()),/Todavía no estaría regularizada/)
})

test('non-calendar activity never appears as a new final candidate or receives a fictional completion', () => {
  const s=savedScenario()
  const {input}=persistedInput([subject('A'),subject('PPS',{projectionKind:'activity'})],{},s),h=harness(input)
  const tree=h.render()
  assert.ok(!h.nodes(tree).some(n=>n.props['aria-label']==='Planificar final de Materia PPS'))
  assert.match(h.text(tree),/Finalización pendiente de finales y acreditaciones/)
})
test('persisted UI keeps initial drafts local, generates once, and never autosaves on render or academic recalculation', () => {
  const {input,changes} = persistedInput([subject('A'),subject('B')])
  const h = harness(input); h.start(2027); h.load(3); h.render()
  assert.equal(changes.length,0)
  h.generate(); assert.equal(changes.length,1)
  h.render(); input.statusMap = { A:'Aprobada' }
  const text=h.text(h.render()); assert.equal(changes.length,1)
  assert.match(text,/Guardando/); assert.doesNotMatch(text,/Al cierre: Cursando/)
  input.persistence.phase='saved'; assert.match(h.text(h.render()),/Guardado/)
})
test('invalid first persisted generation shows diagnostics and never calls persistence', () => {
  const {input,changes} = persistedInput([subject('A'),subject('B',{prereqs:['A']})],{B:'Cursando'})
  const h=harness(input); h.generate()
  assert.equal(changes.length,0); assert.match(h.text(h.render()),/No se guardó/)
  assert.match(h.text(h.render()),/Falta regularizar/)
})
test('restored configuration and edits preserve empty manual periods and fixed dates', () => {
  const s=savedScenario(); s.manualPeriods=[{period:{year:2028,term:'1C'},codes:[]}]
  const {input,changes}=persistedInput([subject('A')],{},s),h=harness(input)
  assert.equal(h.nodes(h.render()).find(n=>n.props.id==='projection-load').props.value,4)
  h.load(7)
  assert.equal(changes.length,1); assert.equal(changes[0].manualPeriods.length,1)
  assert.deepEqual(changes[0].manualPeriods[0].codes,[])
  assert.equal(input.persistence.scenario.startPeriod.year,2027)
})
test('persisted decisions invalidated by current progress or removed codes remain explicit and releasable', () => {
  for(const statusMap of [{A:'Aprobada'},{A:'Cursando'}]) {
    const s=savedScenario(); s.manualPeriods=[{period:s.startPeriod,codes:['A']}]
    const {input,changes}=persistedInput([subject('A'),subject('B')],Object.freeze(statusMap),s),h=harness(input)
    const text=h.text(h.render())
    assert.match(text,/revisión|estado actual/); assert.equal(changes.length,0)
    assert.deepEqual(s.manualPeriods[0].codes,['A'])
  }
  const s=savedScenario(); s.manualPeriods=[{period:s.startPeriod,codes:['REMOVED']}]
  const {input,changes}=persistedInput([subject('A')],{},s),h=harness(input)
  assert.match(h.text(h.render()),/REMOVED/)
  h.nodes(h.render()).find(n=>n.type==='button'&&h.text(n).startsWith('Liberar selección')).props.onClick()
  assert.equal(changes[0].manualPeriods.length,0)
})
test('reset requires confirmation, cancellation does nothing, and conflict does not offer destructive reset', () => {
  for(const confirm of [false,true]) {
    const {input,resets}=persistedInput([subject('A')],{},savedScenario()),h=harness(input,()=>confirm)
    h.nodes(h.render()).find(n=>n.type==='button'&&h.text(n)==='Reiniciar proyección').props.onClick()
    assert.equal(resets.length,confirm?1:0)
    input.persistence.phase='conflict'
    assert.equal(h.nodes(h.render()).find(n=>n.type==='button'&&h.text(n)==='Reiniciar proyección').props.disabled,true)
    assert.match(h.text(h.render()),/borrador local se conserva/)
  }
})

test('manual add and remove recalculate without refilling or mutating real progress', () => {
  const input = props(['A', 'B', 'C', 'D', 'E'].map(c => subject(c)))
  Object.freeze(input.statusMap)
  const before = JSON.stringify(input), h = harness(input)
  h.start(2030); h.generate()
  assert.match(h.text(h.render()), /Fin estimado de cursadas 2C 2030/)
  h.edit('Agregar', 'E', '1C 2030')
  assert.match(h.text(h.render()), /Fin estimado de cursadas 1C 2030/)
  h.edit('Quitar', 'A', '1C 2030')
  assert.match(h.text(h.render()), /Fin estimado de cursadas 2C 2030/)
  const first = h.nodes(h.render()).find(n => n.type === 'article')
  assert.equal(h.nodes(first).filter(n => n.props['aria-label']?.startsWith('Quitar')).length, 4)
  assert.equal(JSON.stringify(input), before)
})

test('academic blockers and pending finals distinguish regularization from approval', () => {
  const h = harness(props([subject('A'), subject('B', { prereqs: ['A'] }), subject('C', { approvedPrereqs: ['A'] })], { A: 'Regularizada' }))
  h.generate()
  chooseFilter(h, 'Todos')
  const text = h.text(h.render())
  assert.match(text, /Finales pendientes/)
  assert.match(text, /Final bloqueado/)
  assert.match(text, /Falta aprobar: Materia A/)
  assert.match(text, /No podés cursarlas todavía/)
  assert.match(text, /Materia C/)
})

test('annual project shows same code at start and continuation, with simulated completion', () => {
  const input = props([subject('3.4.100', { year: 5, durationPeriods: 2, allowedStartTerms: ['1C'] })])
  input.career.id = 'uade-informatica'; input.career.plan = '1621'
  const h = harness(input); h.start(2030); h.generate()
  const text = h.text(h.render())
  assert.match(text, /Anual · inicio/)
  assert.match(text, /Anual · continuación/)
  assert.match(text, /Una misma materia ocupa ambos cuatrimestres/)
  assert.match(text, /Fin estimado de cursadas 2C 2030/)
})

test('completed career has meaningful summary and no semester cards', () => {
  const h = harness(props([subject('A')], { A: 'Aprobada' })); h.generate()
  const tree = h.render()
  assert.match(h.text(tree), /¡Carrera completada!/)
  assert.equal(h.nodes(tree).filter(n => n.type === 'article').length, 0)
})

test('existing in-progress course occupies a slot and regularizes at first close', () => {
  const h = harness(props([subject('A')], { A: 'Cursando' })); h.generate()
  const text = h.text(h.render())
  assert.match(text, /Cursando/)
  assert.match(text, /Al cierre: Regularizada/)
  assert.match(text, /1 materias/)
})

test('finals and subject details are collapsed and picker excludes impossible subjects', () => {
  const h = harness(props([subject('A'), subject('B', { prereqs: ['A'] })])); h.start(2030); h.generate()
  const tree = h.render()
  const finals = h.nodes(tree).find(n => n.type === 'details' && n.props.className?.includes('projection-finals'))
  assert.ok(finals); assert.ok(!finals.props.open)
  const first = h.nodes(tree).find(n => n.type === 'article')
  assert.ok(!h.nodes(first).some(n => n.props['aria-label'] === 'Agregar Materia B a 1C 2030'))
  assert.doesNotMatch(h.text(tree), /Habilitadas no incluidas|Capacidad de/)
  assert.ok(h.nodes(first).filter(n => n.type === 'details').every(n => !n.props.open))
})

test('a later manual choice losing its requirements is explained to the user', () => {
  const h = harness(props([subject('A'), subject('B', { prereqs: ['A'] }), subject('C')]))
  h.start(2030); h.generate()
  h.edit('Quitar', 'B', '2C 2030')
  h.edit('Agregar', 'B', '2C 2030')
  h.edit('Quitar', 'A', '1C 2030')
  assert.match(h.text(h.render()), /Decisiones que necesitan revisión/)
  assert.match(h.text(h.render()), /Falta regularizar: Materia A/)
})

test('current semester displays all five real courses and no editing with loads three and four', () => {
  for (const load of [3, 4]) {
    const subjects = Array.from({ length: 14 }, (_, i) => subject(String(i)))
    const statusMap = Object.fromEntries(subjects.slice(0, 5).map(s => [s.code, 'Cursando']))
    const h = harness(props(subjects, statusMap))
    h.start(2032, '2C'); h.load(load); h.generate()
    const cards = h.nodes(h.render()).filter(n => n.type === 'article')
    assert.match(h.text(cards[0]), /2C 2032 · En curso 5 materias reales/)
    assert.doesNotMatch(h.text(cards[0]), /Agregar materia|Mover aquí/)
    assert.equal(h.nodes(cards[0]).filter(n => n.type === 'button').length, 0)
    assert.equal(h.nodes(cards[0]).filter(n => n.props.className === 'projection-subject-row').length, 5)
    assert.match(h.text(cards[1]), new RegExp(`1C 2033 ${load} materias`))
  }
})

test('five-course proposal displays manual three then six with a moved future course', () => {
  const h = harness(props(['A','B','C','D','E','F','G'].map(c => subject(c))))
  h.start(2030); h.load(5); h.generate()
  for (const c of ['A','B']) h.edit('Quitar', c, '1C 2030')
  assert.match(h.text(h.nodes(h.render()).find(n => n.type === 'article')), /1C 2030 3 materias/)
  for (const c of ['A','B','F']) h.edit('Agregar', c, '1C 2030')
  assert.match(h.text(h.nodes(h.render()).find(n => n.type === 'article')), /1C 2030 6 materias/)
})

test('invalid generation displays explanation without summary, timeline or finals', () => {
  const h = harness(props([subject('A')], { A: 'unknown' })); h.generate()
  const tree = h.render()
  assert.match(h.text(tree), /No pudimos proyectar/)
  assert.doesNotMatch(h.text(tree), /Fin estimado de cursadas|0 cuatrimestres|Finales pendientes/)
  assert.equal(h.nodes(tree).filter(n => n.type === 'article').length, 0)
})

test('compact quantity supports seven, nine and over one hundred, rejecting invalid initial values', () => {
  const h = harness(props([subject('A')]))
  h.load(7)
  h.nodes(h.render()).find(n => n.props['aria-label'] === 'Aumentar carga inicial').props.onClick()
  assert.equal(h.nodes(h.render()).find(n => n.props.id === 'projection-load').props.value, 8)
  h.nodes(h.render()).find(n => n.props['aria-label'] === 'Disminuir carga inicial').props.onClick()
  assert.equal(h.nodes(h.render()).find(n => n.props.id === 'projection-load').props.value, 7)
  for (const value of ['', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    h.load(value); h.generate(); assert.equal(h.calls(), 0)
  }
  for (const value of [1, 9, 101]) {
    h.load(value); h.generate(); assert.match(h.text(h.render()), /Fin estimado de cursadas/)
  }
})

test('real UCA renders with nine and explains a synthetic incoherent state without correcting it', () => {
  const career = require('./projection-catalogs.cjs')().find(c => c.id === 'uca-teologia-sistematica')
  const h = harness({ career, statusMap: career.initialStatus }); h.load(9); h.generate()
  assert.match(h.text(h.render()), /Fin estimado de cursadas/)
  const statusMap = { ...career.initialStatus, 'UCA-TS-HF2': 'Cursando' }
  const invalid = harness({ career, statusMap }); invalid.generate()
  const text = invalid.text(invalid.render())
  assert.match(text, /El estado registrado no cumple/)
  assert.match(text, /Falta regularizar: Historia de la Filosofía I/)
  assert.equal(statusMap['UCA-TS-HF1'], 'Pendiente')
})

function renderCatalogComponent(file, name, props) {
  const api = { ProgressSummary: 'progress-summary',
    h: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) }
  vm.createContext(api)
  vm.runInContext(clean(source('src/logic.js')), api)
  vm.runInContext(transformSync(file, clean(source(file)), { jsx: { runtime: 'classic', pragma: 'h' } }).code, api)
  const tree = api[name](props)
  const nodes = n => n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(nodes)] : []
  return nodes(tree)
}

test('UTN Sistemas is selectable under UTN and the academic map renders all 44 elements and both prerequisite types', () => {
  const careers = require('./projection-catalogs.cjs')()
  const career = careers.find(c => c.id === 'utn-sistemas-2023')
  let selected
  const selector = renderCatalogComponent('src/components/CareerSelector.jsx', 'CareerSelector', {
    careers, activeCareerId: 'utn-industrial-2023', setActiveCareerId: id => { selected = id },
  })
  const field = selector.find(n => n.type === 'select' && n.children.some(c => c?.props?.value === career.name))
  assert.ok(field)
  field.props.onChange({ target: { value: career.name } })
  assert.equal(selected, career.id)
  assert.equal(careers.filter(c => c.name === 'Ingeniería Industrial' && c.university === 'UTN').length, 2)
  const map = renderCatalogComponent('src/components/CareerMap.jsx', 'CareerMap', {
    subjects: career.subjects, statusMap: career.initialStatus, selectedCode: 'UTN-ISI23-36',
    setSelectedCode() {}, setActivePage() {}, setPlannerSelectedCodes() {},
  })
  const buttons = map.filter(n => n.props.className?.includes('map-subject '))
  assert.equal(buttons.length, 44)
  const regularized = buttons.find(n => n.props.key === 'UTN-ISI23-25')
  const approved = buttons.find(n => n.props.key === 'UTN-ISI23-20')
  assert.match(regularized.props.className, /related prereq/)
  assert.match(approved.props.className, /related prereq/)
  assert.doesNotMatch(approved.props.className, /dimmed/)
  assert.match(approved.props.title, /aprobación/)
})

test('UTN Sistemas final-project timeline and PPS panel use real metadata and no automatic accreditation', () => {
  const career = require('./projection-catalogs.cjs')().find(c => c.id === 'utn-sistemas-2023')
  const statusMap = Object.fromEntries(career.subjects.filter(s => !['UTN-ISI23-36','UTN-ISI23-PPS'].includes(s.code)).map(s => [s.code, 'Aprobada']))
  const before = JSON.stringify(statusMap), h = harness({ career, statusMap })
  h.start(2027); h.generate()
  const tree = h.render(), text = h.text(tree)
  assert.match(text, /Anual · inicio/); assert.match(text, /Anual · continuación/)
  assert.match(text, /Actividades pendientes de acreditar \(\s*1\s*\)/)
  assert.match(text, /Requisitos de inicio satisfechos/)
  const semesters = h.nodes(tree).filter(n => n.type === 'article')
  assert.ok(semesters.every(n => !h.text(n).includes('Práctica Profesional Supervisada')))
  assert.equal(JSON.stringify(statusMap), before)
})
