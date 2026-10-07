// Isolated access-call characterization, never a permission reduction.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
let prefix=fs.readFileSync('tests/rules/slot-prototype.test.cjs','utf8')
prefix=prefix.slice(0,prefix.indexOf("test('C ordered feasibility gates'"))
const {r,h,inputs,create,invite,refriend,join,X,Y,C2}=new Function('require',prefix+';return {r,h,inputs,create,invite,refriend,join,X,Y,C2}')(require)
for(const operation of ['NEW','REINVITE','JOIN'])test('slot update padding '+operation,async t=>{
 let last=-1,first=null
 for(let n=0;n<=11;n++){
  let e=await h.initialize(r)
  try{
   await e.clearFirestore();const entries=inputs('inverse');for(let i=0;i<n;i++)entries['slotPadding/p'+i]={ok:true};await h.seed(e,entries);await create(e)
   if(operation!=='NEW'){await invite(e,'slot1','one',X,'cycle_unique_0001');await refriend(e)}
   if(operation==='JOIN')await invite(e,'slot1','one',Y,C2)
   const expression=n?Array.from({length:n},(_,i)=>`get(/databases/$(database)/documents/slotPadding/p${i}).data.ok == true`).join(' && '):'true'
   const padded=r.replace('function slotId(s)',`function diagnosticPadding() { return ${expression}; }\n    function slotId(s)`)
    .replace('slotId(s) && (activation() || joining())','slotId(s) && diagnosticPadding() && (activation() || joining())')
   await e.cleanup();e=await h.initialize(padded)
   let error;try{if(operation==='JOIN')await join(e,Y);else await invite(e,'slot1','one',operation==='NEW'?X:Y,operation==='NEW'?'cycle_unique_0001':C2)}catch(x){error=x}
   t.diagnostic(JSON.stringify({operation,padding:n,pass:!error,expressions:/1000 expressions/.test(error?.message||''),serviceCall:/Service call error/i.test(error?.message||''),message:error?.message}))
   if(error){assert.equal(error.code,'permission-denied');first=n;break}else last=n
  }finally{await e.cleanup()}
 }
 assert.ok(last>=0,'unpadded path must pass')
 t.diagnostic(JSON.stringify({operation,lastAllowed:last,firstRejected:first,scope:'extra distinct reads in slot update only; not universal budget'}))
})
