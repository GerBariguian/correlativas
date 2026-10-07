const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {transformSync}=require('rolldown/utils')
const nodes=n=>n&&typeof n==='object'?[n,...(n.children||[]).flatMap(nodes)]:[]
const text=n=>n&&typeof n==='object'?(n.children||[]).map(text).join(' '):typeof n==='string'?n:''
function setup(){
 const slots=[],calls=[],user={uid:'me'};let cursor=0,effects=[]
 const props={user,instances:[{careerInstanceId:'a',catalogId:'c',lifecycle:'active'},{careerInstanceId:'b',catalogId:'d',lifecycle:'active'}]}
 const api={Fragment:'fragment',auth:{currentUser:user},careers:[],
  readInstancePlanningSharing:async(uid,id)=>{calls.push(['read',uid,id]);return {careerInstanceId:id,lifecycle:'active',sharing:{enabled:false}}},
  setInstancePlanningSharing:async(...args)=>calls.push(['set',...args]),refreshInstancePlanningSnapshot:async(...args)=>calls.push(['refresh',...args]),
  useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],x=>slots[i]=typeof x==='function'?x(slots[i]):x]},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((d,j)=>slots[i].deps[j]!==d))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})},
  h(type,props,...children){return {type,props:props||{},children:children.flat(Infinity)}}}
 const raw=fs.readFileSync('src/components/InstanceSharingSettings.jsx','utf8').replace(/^import .*\r?\n/gm,'').replace('export default ','')
 vm.createContext(api);vm.runInContext(transformSync('x.jsx',raw,{jsx:{runtime:'classic',pragma:'h',pragmaFrag:'Fragment'}}).code,api)
 return {api,calls,props,render(){cursor=0;const t=api.InstanceSharingSettings(props),q=effects;effects=[];q.forEach(f=>f());return t},async settle(){await new Promise(r=>setImmediate(r))}}
}
test('S6 sharing chooses exact own instance and explicit consent; no auto-enable on selection/restore',async()=>{
 const h=setup();let t=h.render();assert.equal(h.calls.length,0)
 nodes(t).find(n=>n.type==='select').props.onChange({target:{value:'b'}});h.render();await h.settle();t=h.render()
 assert.deepEqual(h.calls,[['read','me','b']]);assert.match(text(t),/No compartido/)
 await nodes(t).find(n=>n.type==='button').props.onClick();assert.deepEqual(h.calls.at(-1),['set','me','b',true,1])
 h.props.instances[1].lifecycle='archived';t=h.render();assert.equal(nodes(t).find(n=>n.type==='button').props.disabled,true)
 await h.settle();h.props.instances[1].lifecycle='active';h.render();await h.settle();h.render()
 assert.equal(h.calls.filter(x=>x[0]==='set').length,1)
})
test('S6 old instance response is discarded after selecting another instance',async()=>{
 const h=setup();let finish;h.api.readInstancePlanningSharing=(_,id)=>id==='a'?new Promise(r=>finish=r):Promise.resolve({careerInstanceId:id,lifecycle:'active',sharing:{enabled:false}})
 let t=h.render();nodes(t).find(n=>n.type==='select').props.onChange({target:{value:'a'}});t=h.render()
 nodes(t).find(n=>n.type==='select').props.onChange({target:{value:'b'}});h.render();await h.settle()
 finish({careerInstanceId:'a',lifecycle:'active',sharing:{enabled:true}});await h.settle();t=h.render()
 assert.match(text(t),/No compartido/);assert.doesNotMatch(text(t),/Compartiendo resumen/)
})
test('S6 sharing response from previous session is not published',async()=>{
 const h=setup();let finish;h.api.readInstancePlanningSharing=()=>new Promise(r=>finish=r)
 let t=h.render();nodes(t).find(n=>n.type==='select').props.onChange({target:{value:'a'}});h.render()
 h.api.auth.currentUser={uid:'other'};finish({careerInstanceId:'a',lifecycle:'active',sharing:{enabled:true}});await h.settle()
 assert.doesNotMatch(text(h.render()),/Compartiendo resumen/)
})
