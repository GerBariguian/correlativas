const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {transformSync}=require('rolldown/utils')
const clean=s=>s.replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g,'').replace(/export default /g,'').replace(/export /g,'')
const p=new Function(clean(fs.readFileSync('src/activityPresentation.js','utf8'))+';return {activityCopy,activityTime,activityBellLabel,activateActivity,activityPlanSelection}')()
const nodes=n=>n&&typeof n==='object'?[n,...(n.children||[]).flatMap(nodes)]:[]
const text=n=>n&&typeof n==='object'?(n.children||[]).map(text).join(' '):typeof n==='string'||typeof n==='number'?String(n):''
function harness(file,name,deps={}) {
 const slots=[],events={},focus=[];let cursor=0,effects=[]
 const api={Fragment:'fragment',...p,Bell:'bell',X:'x',ActivityItem:'activity-item',...deps,
 document:{addEventListener:(k,f)=>events[k]=f,removeEventListener:(k,f)=>{if(events[k]===f)delete events[k]}},
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},
 useRef(value){const i=cursor++;return slots[i]||=( {current:value} )},
 useEffect(fn,ds){const i=cursor++;if(!slots[i]||ds.some((d,j)=>!Object.is(d,slots[i].deps[j])))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps:ds,cleanup:fn()}})},
 h(type,props,...children){if(props?.ref && props.ref.current===null)props.ref.current={focus:()=>focus.push(props.className),contains:target=>target==='inside'};return {type,props:props||{},children:children.flat(Infinity)}}}
 vm.createContext(api);let s=clean(fs.readFileSync(file,'utf8'));if(file.endsWith('.jsx'))s=transformSync(file,s,{jsx:{runtime:'classic',pragma:'h',pragmaFrag:'Fragment'}}).code;vm.runInContext(s,api)
 return {events,focus,render(...args){cursor=0;const result=api[name](...args);const run=effects;effects=[];run.forEach(f=>f());return result},stop(){slots.forEach(s=>s?.cleanup?.())}}
}
const item=(type='JOINT_PLAN_INVITATION')=>({itemId:'jp_p',instanceKey:'["jp_p",100,0]',type,actorUid:'a',createdAt:{seconds:100,nanoseconds:0},target:{kind:type==='JOINT_PLAN_INVITATION'?'jointPlan':'friendship',id:'p'},isRead:false})
const stream=(status='ready',items=[])=>({status,items,diagnostics:[]})
function bell(state={recent:stream(),unread:stream(),badge:null}) {
 const user={uid:'u'},navigations=[];let reads=0,retries=0
 const activity={state,actors:{},controller:{markRead:async()=>{reads++;return {status:'marked'}},retry:()=>retries++}}
 const h=harness('src/components/ActivityBell.jsx','ActivityBell',{auth:{currentUser:user}})
 const props={user,activity,onNavigate:r=>navigations.push(r)}
 return {...h,props,navigations,get reads(){return reads},get retries(){return retries},render:()=>h.render(props)}
}
for(const [type,phrase] of [['FRIEND_REQUEST_RECEIVED','te envió una solicitud de amistad'],['FRIEND_REQUEST_ACCEPTED','aceptó tu solicitud de amistad'],['JOINT_PLAN_INVITATION','te invitó a un Plan conjunto']])test(`activity presentation ${type}`,()=>{
 assert.equal(p.activityCopy(item(type),'Ana'),`Ana ${phrase}`);assert.equal(p.activityCopy(item(type),null),`Alguien ${phrase}`)
})
test('activity relative time preserves ISO and uses short local dates',()=>{
 const t={seconds:100,nanoseconds:123};assert.equal(p.activityTime(t,100000).label,'Ahora');assert.equal(p.activityTime(t,400000).label,'Hace 5 min');assert.equal(p.activityTime(t,7300000).label,'Hace 2 h');assert.equal(p.activityTime(t,200000000).label,new Date(100000).toLocaleDateString('es-AR',{day:'numeric',month:'short',year:'numeric'}));assert.equal(p.activityTime(t,100000).dateTime,'1970-01-01T00:01:40.000Z')
})
for(const [badge,label] of [[null,null],[{count:0,isCapped:false},null],[{count:3,isCapped:false},3],[{count:50,isCapped:false},50],[{count:50,isCapped:true},'50+']])test(`activity bell badge ${JSON.stringify(badge)}`,()=>{
 const h=bell({recent:stream(),unread:stream(),badge}),tree=h.render(),button=nodes(tree).find(n=>n.props.className==='activity-trigger'),badgeNode=nodes(tree).find(n=>n.props.className==='activity-badge')
 assert.equal(badgeNode?badgeNode.children[0]:null,label);assert.equal(button.type,'button');assert.equal(button.props['aria-expanded'],false);assert.equal(button.props['aria-label'],p.activityBellLabel(badge));h.stop()
})
test('activity popover opens without reads, focuses, Escape/outside/toggle close and cleanup',()=>{
 const h=bell();let tree=h.render();const trigger=()=>nodes(tree).find(n=>n.props.className==='activity-trigger')
 trigger().props.onClick();tree=h.render();assert.equal(trigger().props['aria-expanded'],true);assert.ok(h.focus.includes('activity-panel'));assert.equal(h.reads,0)
 h.events.keydown({key:'Escape',preventDefault(){}});tree=h.render();assert.equal(trigger().props['aria-expanded'],false);assert.equal(h.focus.at(-1),'activity-trigger')
 trigger().props.onClick();tree=h.render();h.events.pointerdown({target:'inside'});tree=h.render();assert.equal(trigger().props['aria-expanded'],true)
 h.events.pointerdown({target:'outside'});tree=h.render();assert.equal(trigger().props['aria-expanded'],false)
 trigger().props.onClick();tree=h.render();trigger().props.onClick();tree=h.render();assert.equal(trigger().props['aria-expanded'],false);h.stop();assert.equal(Object.keys(h.events).length,0)
})
for(const state of ['loading','ready','error'])test(`activity panel ${state} and retry`,()=>{
 const h=bell({recent:stream(state),unread:stream('error'),badge:null});nodes(h.render()).find(n=>n.props.className==='activity-trigger').props.onClick();const tree=h.render()
 assert.ok(text(tree).includes(state==='loading'?'Cargando actividad':state==='ready'?'No tenés actividad reciente':'No pudimos cargar tu actividad'))
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Reintentar').props.onClick();assert.equal(h.retries,1);h.stop()
})
test('activity item read state, native action, time and independent actor fallback',()=>{
 const h=harness('src/components/ActivityItem.jsx','ActivityItem');let activated
 for(const read of [false,true]){const data={...item(),isRead:read},tree=h.render({item:data,onActivate:x=>activated=x,busy:false})
 assert.equal(tree.props.className.includes('activity-unread'),!read);assert.ok(text(tree).includes('Alguien'));assert.ok(nodes(tree).find(n=>n.type==='time').props.dateTime)
 nodes(tree).find(n=>n.type==='button').props.onClick();assert.equal(activated,data)}
})
for(const status of ['marked','alreadyRead','stale','missing','error','cancelled'])test(`activity activation ${status}`,async()=>{
 const source=Object.freeze(item());let observed
 const result=await p.activateActivity(source,async value=>{observed=value;return {status}});assert.equal(observed.instanceKey,source.instanceKey)
 if(['marked','alreadyRead'].includes(status)){assert.equal(result.destination,'joint');assert.equal(result.planId,'p')}
 if(['stale','missing'].includes(status)){assert.equal(result.destination,undefined);assert.match(result.notice,/ya no está disponible/)}
 if(status==='error'){assert.equal(result.destination,'joint');assert.equal(result.planId,undefined)}
 if(status==='cancelled')assert.equal(result.cancelled,true)
})
test('activity friendship navigates safely on success/error and timeout has no plan selection',async()=>{
 assert.equal((await p.activateActivity(item('FRIEND_REQUEST_RECEIVED'),async()=>({status:'marked'}))).destination,'friends')
 assert.equal((await p.activateActivity(item('FRIEND_REQUEST_ACCEPTED'),async()=>{throw Error('private')})).destination,'friends')
 const result=await p.activateActivity(item(),()=>new Promise(()=>{}),1);assert.equal(result.destination,'joint');assert.equal(result.planId,undefined)
})
test('activity joint target uses authorized current-career plans only',()=>{
 const intent={planId:'p'};assert.equal(p.activityPlanSelection(intent,{state:'loading'}),null)
 assert.equal(p.activityPlanSelection(intent,{state:'ready',plans:[{id:'p'}]}).planId,'p')
 for(const data of [{state:'ready',plans:[]},{state:'unavailable',plans:[{id:'p'}]},{state:'ready',plans:[{id:'p',deleting:true}]}])assert.equal(p.activityPlanSelection(intent,data).planId,'')
})
test('activity shell hook owns one session, deduplicates actors and isolates auth replacement',async()=>{
 const a={uid:'a'},b={uid:'b'},auth={currentUser:a},controllers=[],loads=[]
 const h=harness('src/hooks/useActivity.js','useActivity',{auth,activityNow:()=>{},activityRepository:()=>{},createActivitySession:()=>{
 const c={state:{recent:stream(),unread:stream(),badge:null},getState(){return this.state},observe(f){this.notify=f;return()=>this.stopped=true},setUser(){},dispose(){this.disposed=true}};controllers.push(c);return c},loadSocialProfiles:ids=>new Promise(resolve=>loads.push({ids,resolve}))})
 h.render(a);h.render(a);assert.equal(controllers.length,1)
 controllers[0].state.recent=stream('ready',[item(),item()]);controllers[0].notify();controllers[0].notify();assert.equal(loads.length,1)
 loads[0].resolve({a:{name:'Ana',email:'private'}});await new Promise(r=>setImmediate(r));assert.equal(h.render(a).actors.a,'Ana');assert.equal(JSON.stringify(h.render(a)).includes('private'),false)
 auth.currentUser=b;assert.equal(h.render(b).state.recent.items.length,0);assert.equal(controllers[0].disposed,true);controllers[0].notify();assert.equal(h.render(b).state.recent.items.length,0)
 auth.currentUser=null;assert.equal(h.render(null).controller,null);h.stop();assert.ok(controllers.every(c=>c.disposed))
})
test('activity panel item uses exact instance and navigates without writing on open',async()=>{
 const data=item(),h=bell({recent:stream('ready',[data]),unread:stream(),badge:null});nodes(h.render()).find(n=>n.props.className==='activity-trigger').props.onClick();const tree=h.render();assert.equal(h.reads,0)
 await nodes(tree).find(n=>n.type==='activity-item').props.onActivate(data);assert.equal(h.reads,1);assert.equal(h.navigations[0].planId,'p');h.stop()
})
test('activity Planner intention waits for authorized list and consumes once without selecting hidden plans',()=>{
 let data={plans:[],state:'loading'},consumed=0
 const user={uid:'u'},career={id:'c',subjects:[]}
 const h=harness('src/components/PlannerPage.jsx','PlannerPage',{
   Planner:'planner',PlanningComparison:'comparison',JointPlanPanel:'joint-panel',AddPlanSubjectDialog:'add-dialog',
   usePlanningParticipants:()=>({friends:{profiles:{},ids:[],state:'ready'},participants:[]}),derivePlanningSnapshot:()=>({}),
   useJointPlans:()=>data,useJointProfiles:()=>({}),usePlanAcademicContext:()=>[],academicMessages:{},fallbackPlanName:()=>'',
 })
 const props={user,career,statusMap:{},activityIntent:{token:1,planId:'p'},onActivityConsumed:()=>consumed++}
 h.render(props);let tree=h.render(props);assert.ok(nodes(tree).some(n=>n.type==='joint-panel'));assert.equal(consumed,0)
 data={plans:[{id:'p',ownerId:'u',inviteeIds:[],memberIds:['u']}],state:'ready'};h.render(props);tree=h.render(props)
 assert.equal(nodes(tree).find(n=>n.type==='joint-panel').props.planId,'p');assert.equal(consumed,1)
 h.render(props);assert.equal(consumed,1)
 props.activityIntent={token:2,planId:'hidden'};h.render(props);tree=h.render(props);assert.equal(nodes(tree).find(n=>n.type==='joint-panel').props.planId,'');assert.equal(consumed,2)
 assert.ok(text(tree).includes('carrera actual'));h.stop()
})
for(const status of ['stale','missing','error'])test(`activity panel interaction ${status} stays safe`,async()=>{
 const data=item(),h=bell({recent:stream('ready',[data]),unread:stream(),badge:null});h.props.activity.controller.markRead=async()=>({status})
 nodes(h.render()).find(n=>n.props.className==='activity-trigger').props.onClick();await nodes(h.render()).find(n=>n.type==='activity-item').props.onActivate(data)
 if(status==='error'){assert.equal(h.navigations.length,1);assert.equal(h.navigations[0].planId,undefined)}
 else{assert.equal(h.navigations.length,0);assert.match(text(h.render()),/ya no está disponible/)}h.stop()
})
test('activity profiles have a fallback without blocking list or retrying failed actor per render',async()=>{
 const user={uid:'u'},auth={currentUser:user};let calls=0,controller
 const h=harness('src/hooks/useActivity.js','useActivity',{auth,activityNow:()=>{},activityRepository:()=>{},createActivitySession:()=>controller={getState:()=>({recent:stream('ready',[item()]),unread:stream(),badge:null}),observe(f){this.notify=f;return()=>{}},setUser(){},dispose(){}},loadSocialProfiles:async()=>{calls++;throw Error('private')}})
 h.render(user);await new Promise(r=>setImmediate(r));const result=h.render(user);assert.equal(result.state.recent.items.length,1);assert.equal(result.actors.a,undefined);controller.notify();h.render(user);assert.equal(calls,1);h.stop()
})
test('activity read label retains accessible text with its own globally applicable clipped class',()=>{
 const h=harness('src/components/ActivityItem.jsx','ActivityItem')
 for(const read of [false,true]) {
  const tree=h.render({item:{...item(),isRead:read},onActivate(){},busy:false})
  const label=nodes(tree).find(n=>n.props.className==='activity-sr-only')
  assert.ok(label);assert.equal(label.props['aria-hidden'],undefined)
  assert.equal(text(label),read?'Leída.':'Sin leer.')
  assert.equal(nodes(tree).some(n=>n.props.className==='planning-sr-only'),false)
 }
 const css=fs.readFileSync('src/styles.css','utf8')
 const rule=css.match(/^\.activity-sr-only\s*\{([^}]+)\}/m)
 assert.ok(rule);assert.match(rule[1],/position:\s*absolute/);assert.match(rule[1],/clip-path:\s*inset\(50%\)/)
 assert.doesNotMatch(rule[1],/display:\s*none|visibility:\s*hidden/)
})
