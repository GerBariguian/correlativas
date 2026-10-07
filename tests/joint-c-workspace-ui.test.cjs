const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {transformSync}=require('rolldown/utils')
const nodes=n=>n&&typeof n==='object'?[n,...(n.children||[]).flatMap(nodes)]:[]
const text=n=>n&&typeof n==='object'?(n.children||[]).map(text).join(' ').replace(/\s+/g,' ').trim():typeof n==='string'||typeof n==='number'?String(n):''
function harness({pending=false,expected=null,compatible=true}={}){
 const slots=[],calls=[];let cursor=0,effects=[]
 const user={uid:'me'},plan={ownerId:pending?'friend':'me',catalogId:'c',closed:false,deleting:false}
 const own={slotId:'slot1',slot:{uid:'me',status:'pending',occurrence:'X',revision:1}}
 const people=pending?[{uid:'friend',reference:{slotId:'owner',instanceId:'foreign',occurrence:'owner',slotRevision:0}}]:[{uid:'me',reference:{slotId:'owner',instanceId:'own',occurrence:'owner',slotRevision:0}}]
 const product={discover:async()=>({plans:[{planId:'p',plan}],unavailable:[]}),plan:async()=>({planId:'p',plan,slots:pending?[own]:[],people}),subjects:async()=>[],invitation:async()=>({occurrenceId:'X'}),
  create:async(i,name)=>{calls.push(['create',i,name]);return 'p'},invite:async(_,uids)=>uids.map(uid=>({uid,status:uid==='bad'?'unavailable':'success'})),join:async(...a)=>{calls.push(['join',...a])},rename:async(...a)=>calls.push(['rename',...a])}
 const logic=new Function(fs.readFileSync('src/jointCProductLogic.js','utf8').replace(/export /g,'')+';return {compatibleJointInstances,currentJointEdge,JOINT_C_UNAVAILABLE}')()
 const api={...logic,Fragment:'fragment',auth:{currentUser:user},careers:[{id:'c',university:'U',name:'Carrera',plan:'1',subjects:[{code:'A',name:'Materia'}]}],jointCProductSession:()=>product,
  useJointProfiles:()=>({good:{name:'Primero'},bad:{name:'Segundo'}}),JointPlanHistory:'history',InstanceSharingSettings:'sharing',
  subscribeFriendships:(_,next)=>{next([{participants:['me','good'],status:'accepted'},{participants:['me','bad'],status:'accepted'}]);return()=>{}},
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},
  useRef(v){const i=cursor++;return slots[i]||=( {current:v} )},
  useMemo(fn,deps){const i=cursor++;if(!slots[i]||deps.some((d,j)=>slots[i].deps[j]!==d))slots[i]={deps,value:fn()};return slots[i].value},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((d,j)=>slots[i].deps[j]!==d))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})},
  h(type,props,...children){return {type,props:props||{},children:children.flat(Infinity)}}}
 vm.createContext(api)
 const raw=fs.readFileSync('src/components/JointCWorkspace.jsx','utf8').replace(/^import .*\r?\n/gm,'').replace('export default ','')
 vm.runInContext(transformSync('x.jsx',raw,{jsx:{runtime:'classic',pragma:'h',pragmaFrag:'Fragment'}}).code,api)
 const props={user,bridge:{authority:'instances',phase:'complete',instances:compatible?[{careerInstanceId:'own',catalogId:'c',lifecycle:'active'}]:[]},activityIntent:expected?{token:1,model:'C',planId:'p',occurrenceId:expected}:null,onActivityConsumed(){}}
 return {calls,props,api,product,stop(){slots.forEach(s=>s?.cleanup?.())},render(){cursor=0;const tree=api.JointCWorkspace(props),q=effects;effects=[];q.forEach(f=>f());return tree},async settle(){await new Promise(r=>setImmediate(r))}}
}
test('S6 UI explicit instance, per-recipient visible partial success and no legacy mutation panel',async()=>{
 const h=harness();h.render();await h.settle();let tree=h.render()
 let create=nodes(tree).find(n=>n.type==='button'&&text(n)==='Crear plan');assert.equal(create.props.disabled,true)
 nodes(tree).find(n=>n.type==='select'&&nodes(n).some(x=>x.type==='option'&&x.props.value==='own')).props.onChange({target:{value:'own'}})
 for(const box of nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox').slice(0,2))box.props.onChange({target:{checked:true}})
 tree=h.render();await nodes(tree).find(n=>n.type==='button'&&text(n)==='Crear plan e invitar').props.onClick();await h.settle();tree=h.render();await h.settle();tree=h.render()
 assert.equal(h.calls[0][1].careerInstanceId,'own');assert.match(text(tree),/1 completadas; 1 no disponibles/);assert.match(text(tree),/Primero\s*: Completado/);assert.match(text(tree),/Segundo\s*: No disponible/)
 assert.ok(!nodes(tree).some(n=>n.type==='JointPlanPanel'))
})
test('S6 UI named create and rename reuse product bridge',async()=>{
 const h=harness();h.render();await h.settle();let tree=h.render()
 nodes(tree).find(n=>n.type==='input'&&n.props.maxLength===80).props.onChange({target:{value:'Nombre elegido'}})
 nodes(tree).find(n=>n.type==='select'&&nodes(n).some(x=>x.props.value==='own')).props.onChange({target:{value:'own'}})
 tree=h.render();await nodes(tree).find(n=>n.type==='button'&&text(n)==='Crear plan').props.onClick();await h.settle();h.render();await h.settle();tree=h.render()
 assert.equal(h.calls[0][2],'Nombre elegido')
 nodes(tree).find(n=>n.type==='label'&&text(n).startsWith('Renombrar plan')).children.find(n=>n.type==='input').props.onChange({target:{value:'Renombrado'}})
 tree=h.render();await nodes(tree).find(n=>n.type==='button'&&text(n)==='Guardar nombre').props.onClick()
 assert.equal(h.calls.at(-1)[0],'rename');assert.equal(h.calls.at(-1)[2],'Renombrado')
})
test('S6 UI stale async plan result cannot return after session/unmount',async()=>{
 const h=harness();let resolve;h.product.plan=()=>new Promise(r=>resolve=r)
 h.render();await h.settle();let tree=h.render()
 nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'p'}});h.render()
 h.stop();h.api.auth.currentUser={uid:'other'}
 resolve({plan:{ownerId:'me',catalogId:'c',name:'Sensitive old plan'},slots:[],people:[]});await h.settle()
 assert.doesNotMatch(text(h.render()),/Sensitive old plan/)
})
for(const [expected,compatible]of [['X',true],['old',true],['X',false]])test('S6/S7 exact Activity occurrence '+expected+' compatible '+compatible,async()=>{
 const h=harness({pending:true,expected,compatible});h.render();await h.settle();h.render();await h.settle();let tree=h.render()
 const accept=nodes(tree).find(n=>n.type==='button'&&text(n)==='Aceptar invitación')
 if(expected==='old'){assert.equal(accept,undefined);assert.match(text(tree),/ya no está disponible/);return}
 assert.equal(accept.props.disabled,true)
 if(!compatible){assert.match(text(tree),/Necesitás una trayectoria activa/);return}
 nodes(tree).find(n=>n.type==='select'&&nodes(n).some(x=>x.type==='option'&&x.props.value==='own')&&n!==nodes(tree).filter(x=>x.type==='select')[1]).props.onChange({target:{value:'own'}})
 tree=h.render();await nodes(tree).find(n=>n.type==='button'&&text(n)==='Aceptar invitación').props.onClick()
 assert.equal(h.calls[0][0],'join');assert.equal(h.calls[0][2],'X');assert.equal(h.calls[0][3],'own')
})
