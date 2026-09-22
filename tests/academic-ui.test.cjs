const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
const clean = s => s.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"]\s*\r?\n/g, '').replace(/export default /g, '').replace(/export /g, '')
const nodes = n => n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(nodes)] : []
const text = n => n && typeof n === 'object' ? (n.children || []).map(text).join(' ').replace(/\s+/g, ' ').trim() : typeof n === 'string' || typeof n === 'number' ? String(n) : ''
function harness() {
  const refs = []
  const api = { Fragment: 'fragment', Dialog: 'dialog', DialogContent: 'dialog-content', IconButton: 'icon-button', Sparkles: 'sparkles', ProgressSummary: 'progress-summary',
    useMemo: fn => fn(), useRef: value => { const ref = { current: value }; refs.push(ref); return ref },
    h: (type, props, ...children) => typeof type === 'function' ? type({ ...props, children: children.flat(Infinity) }) : { type, props: props || {}, children: children.flat(Infinity) },
  }
  vm.createContext(api)
  vm.runInContext(clean(source('src/logic.js')), api)
  for (const name of ['WelcomeSetup','CareerMap','SubjectModal','SubjectCard','Advisor']) {
    vm.runInContext(transformSync(name+'.jsx', clean(source(`src/components/${name}.jsx`)), { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }).code, api)
  }
  return { api, refs }
}
const subject = (code, extra = {}) => ({ code, name: `Materia ${code}`, year: 1, term: '1C', hours: 4, prereqs: [], ...extra })

test('onboarding disambiguates actual UTN plans, selects exact ID and preserves start callback', () => {
  const {api}=harness(), careers=require('./projection-catalogs.cjs')()
  let selected, started=0
  for(const id of ['utn-industrial-2023','utn-industrial-2007']) {
    const tree=api.WelcomeSetup({careers,activeCareerId:id,setActiveCareerId:value=>{selected=value},onContinue:()=>{started++}})
    for(const [target,label] of [['utn-industrial-2023','Ingeniería Industrial · Plan I-23 (2023)'],['utn-industrial-2007','Ingeniería Industrial · Plan 2007']]) {
      const button=nodes(tree).find(n=>n.type==='button'&&text(n)===label)
      assert.ok(button); assert.equal(button.props.className.includes('active'),target===id)
      button.props.onClick(); assert.equal(selected,target)
    }
    assert.ok(nodes(tree).some(n=>n.type==='button'&&text(n)==='Ingeniería en Sistemas de Información'))
    nodes(tree).find(n=>n.type==='button'&&text(n)==='Empezar').props.onClick()
  }
  assert.equal(started,2)
})

for(const state of ['Pendiente','Cursando','Regularizada','Aprobada']) test(`map respects availability for own state ${state}`,()=>{
  const {api}=harness(), subjects=[subject('A')], statusMap=Object.freeze({A:state})
  let codes=[],navigations=0
  const tree=api.CareerMap({subjects,statusMap,selectedCode:'A',setSelectedCode(){},setPlannerSelectedCodes:fn=>{codes=fn(codes)},setActivePage:page=>{assert.equal(page,'planificador');navigations++}})
  const button=nodes(tree).find(n=>n.props.className==='map-to-planner-btn')
  button.props.onClick(); button.props.onClick()
  assert.equal(button.props.disabled,state!=='Pendiente')
  assert.equal(codes.length,state==='Pendiente'?1:0); assert.equal(navigations,state==='Pendiente'?2:0)
  if(state!=='Pendiente') assert.ok(text(tree).includes(`su estado es ${state}`))
  assert.equal(statusMap.A,state)
})

test('map explains regularization and approval requirements without adding or navigating',()=>{
  const {api}=harness(), statusMap=Object.freeze({A:'Pendiente',B:'Regularizada'})
  const tree=api.CareerMap({subjects:[subject('A'),subject('B'),subject('C',{prereqs:['A'],approvedPrereqs:['B']})],statusMap,selectedCode:'C',setSelectedCode(){},setPlannerSelectedCodes(){assert.fail('must not select')},setActivePage(){assert.fail('must not navigate')}})
  nodes(tree).find(n=>n.props.className==='map-to-planner-btn').props.onClick()
  assert.match(text(tree),/Falta regularizar: Materia A/); assert.match(text(tree),/Falta aprobar para cursar: Materia B/)
})

test('invalidated selections remain visible, excluded from metrics, and removable independently',()=>{
  const subjects=[subject('A',{hours:9}),subject('B',{prereqs:['A']}),subject('C',{hours:3,hoursUnit:'horas cátedra semanales'})]
  const before=Object.freeze({A:'Regularizada'})
  const h=require('./planner-ui-harness.cjs').plannerHarness(subjects,{selectedCodes:['B','C'],statusMap:before})
  assert.match(text(h.render()),/Elegidas válidas 2/)
  const after=Object.freeze({A:'Pendiente'}); h.props.statusMap=after
  const tree=h.render()
  assert.deepEqual(h.props.selectedCodes,['B','C'])
  assert.match(text(tree),/Materia B No disponible/)
  const summary=nodes(tree).find(n=>n.props.className==='planner-summary')
  assert.match(text(summary),/Elegidas válidas 1 Nuevas habilitaciones al cierre 0/)
  assert.match(text(tree),/3 horas cátedra semanales/)
  nodes(tree).find(n=>n.props['aria-label']==='Quitar Materia B de Mi selección').props.onClick()
  assert.deepEqual(Array.from(h.props.selectedCodes),['C']); assert.equal(after.A,'Pendiente')
})

for(const state of ['Pendiente','Cursando','Regularizada','Aprobada']) for(const requirementsMet of [false,true]) test(`final presentation: ${state}, requirements ${requirementsMet}`,()=>{
  const {api}=harness(), subjects=[subject('A'),subject('B',{finalPrereqs:['A']})]
  const statusMap=Object.freeze({A:requirementsMet?'Aprobada':'Regularizada',B:state})
  const tree=api.SubjectCard({subject:subjects[1],subjects,statusMap,expanded:'B',onChange(){},setExpanded(){},setActivePage(){},setSelectedMapCode(){}})
  assert.match(text(tree),/Correlativas de final/)
  const canRender=state==='Regularizada'&&requirementsMet
  assert.equal(text(tree).includes('Puede rendirse'),canRender)
  assert.equal(api.availableFinals(subjects,statusMap).some(s=>s.code==='B'),canRender)
  if(['Pendiente','Cursando'].includes(state)) assert.match(text(tree),/Todavía no está regularizada/)
  if(state==='Aprobada') assert.match(text(tree),/Materia ya aprobada/)
  if(!requirementsMet) assert.match(text(tree),/Falta aprobar: Materia A/)
})

test('detail uses a native independent trigger, focuses before opening and preserves modal restoration',()=>{
  const {api,refs}=harness(), subjects=[subject('A')], events=[]
  const tree=api.SubjectCard({subject:subjects[0],subjects,statusMap:{},expanded:null,onChange:(code,state)=>events.push([code,state]),setExpanded:code=>events.push(code),setActivePage(){},setSelectedMapCode(){}})
  const article=nodes(tree).find(n=>n.type==='article'), trigger=nodes(tree).find(n=>n.props['aria-label']==='Ver detalle de Materia A')
  assert.equal(article.props.role,undefined); assert.equal(trigger.type,'button'); assert.equal(trigger.props.type,'button'); assert.equal(trigger.props['aria-haspopup'],'dialog')
  refs[0].current={focus(){events.push('focus')}}
  trigger.props.onClick({stopPropagation(){events.push('stop')}})
  assert.deepEqual(events,['stop','focus','A'])
  events.length=0; article.props.onClick(); assert.deepEqual(events,['focus','A'])
  events.length=0
  nodes(tree).find(n=>n.type==='button'&&text(n)==='Regularizada').props.onClick({stopPropagation(){events.push('stop')}})
  assert.deepEqual(events,['stop',['A','Regularizada']])
  const dialog=nodes(tree).find(n=>n.type==='dialog')
  assert.notEqual(dialog.props.disableRestoreFocus,true)
  dialog.props.onClose(); assert.equal(events.at(-1),null)
  assert.match(source('src/styles.css'),/\.subject-card .*:focus-visible/)
})

test('advisor removes residual eyebrow and preserves icon and recommendation order',()=>{
  const {api}=harness(), recs=[{type:'Uno',title:'Primera',reason:'Motivo 1'},{type:'Dos',title:'Segunda',reason:'Motivo 2'}]
  const tree=api.Advisor({recs})
  assert.doesNotMatch(text(tree),/Opción B/); assert.match(text(tree),/Asesor académico/)
  assert.ok(nodes(tree).some(n=>n.type==='sparkles'))
  assert.deepEqual(nodes(tree).filter(n=>n.type==='article').map(text),['Uno Primera Motivo 1','Dos Segunda Motivo 2'])
})

for (const [label, metadata, valid] of [
  ['unknown start and duration', {}, true],
  ['explicit incompatible', { durationPeriods: 1, allowedStartTerms: ['2C'] }, false],
  ['annual compatible', { durationPeriods: 2, allowedStartTerms: ['1C'] }, true],
  ['annual incompatible', { durationPeriods: 2, allowedStartTerms: ['2C'] }, false],
]) test(`map to planner preserves ${label} without a manual capacity limit`, () => {
  const { api } = harness(), subjects = ['A','B','C','D'].map(c => subject(c)).concat(subject('E', metadata))
  const statusMap = Object.freeze({}), period = { year: 2030, term: '1C' }
  let codes = ['A','B','C','D'], page
  const tree = api.CareerMap({subjects, statusMap, selectedCode:'E', plannerSelectedCodes:codes, setSelectedCode(){},
    setPlannerSelectedCodes: fn => { codes = fn(codes) }, setActivePage: value => { page = value }})
  const button = nodes(tree).find(n => n.props.className === 'map-to-planner-btn')
  assert.equal(button.props.disabled, false); button.props.onClick()
  assert.equal(page, 'planificador'); assert.equal(codes.length, 5)
  const h = require('./planner-ui-harness.cjs').plannerHarness(subjects, { selectedCodes:codes, statusMap, targetPeriod:period, desiredCount:4 })
  const result = h.render()
  assert.match(text(result), new RegExp(`Elegidas válidas ${valid ? 5 : 4}`))
  if (!valid) {
    assert.match(text(result), /Inicio incompatible con el período elegido/)
    assert.doesNotMatch(text(tree), /Falta regularizar|Falta aprobar/)
  }
  assert.ok(nodes(result).some(n => n.props['aria-label'] === 'Quitar Materia E de Mi selección'))
  assert.deepEqual(statusMap, {})
  assert.equal(h.props.desiredCount, 4); assert.deepEqual(h.props.targetPeriod, period)
})

test('map existing invalid selection navigates without duplicating or editing it', () => {
  const {api}=harness(); let navigations=0
  const tree=api.CareerMap({subjects:[subject('A')],statusMap:{A:'Aprobada'},selectedCode:'A',plannerSelectedCodes:['A'],setSelectedCode(){},
    setPlannerSelectedCodes(){assert.fail('existing selection must not change')},setActivePage(){navigations++}})
  const button=nodes(tree).find(n=>n.props.className==='map-to-planner-btn')
  assert.equal(button.props.disabled,false); assert.match(text(button),/Ver Materia A en Mi selección/)
  button.props.onClick(); assert.equal(navigations,1)
  const mapButton=nodes(tree).find(n=>n.props.className?.startsWith('map-subject '))
  assert.equal(mapButton.type,'button'); assert.equal(mapButton.props['aria-pressed'],true)
})

test('map activity cannot be newly added and explains academic tracking without name heuristics',()=>{
  const {api}=harness()
  const tree=api.CareerMap({subjects:[subject('A',{projectionKind:'activity'})],statusMap:{},selectedCode:'A',setSelectedCode(){},
    setPlannerSelectedCodes(){assert.fail('activity')},setActivePage(){assert.fail('activity')}})
  const button=nodes(tree).find(n=>n.props.className==='map-to-planner-btn')
  assert.equal(button.props.disabled,true); button.props.onClick()
  assert.equal(button.props['aria-describedby'],'map-planner-reason')
  assert.match(text(tree),/actividad no se incluye como cursada/)
})

for(const career of require('./projection-catalogs.cjs')()) test(`map structural compatibility: ${career.id}`,()=>{
  const {api}=harness()
  for(const subject of career.subjects) {
    const tree=api.CareerMap({subjects:career.subjects,statusMap:career.initialStatus||{},selectedCode:subject.code,setSelectedCode(){},setPlannerSelectedCodes(){},setActivePage(){}})
    assert.ok(nodes(tree).some(n=>n.props.className==='map-to-planner-btn'))
  }
})
