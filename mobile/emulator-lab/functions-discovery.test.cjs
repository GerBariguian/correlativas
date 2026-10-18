'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto')
const {PROJECT}=require('./policy.cjs')
const {layoutFor,verifyInstallation,verifyWrapper,makeFinder,installWindowsDiscovery,validateInvocation,CMD_TEMPLATE}=require('./functions-cli-bootstrap.cjs')
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lab discovery ñ spaces '))
 const lab=path.join(directory,'mobile','emulator-lab');fs.mkdirSync(lab,{recursive:true})
 const layout=layoutFor(lab),actual=layoutFor()
 for(const file of [layout.cliEntry,layout.delegate,layout.sdkEntry,layout.binary])fs.mkdirSync(path.dirname(file),{recursive:true})
 for(const field of ['cliEntry','delegate','sdkEntry'])fs.copyFileSync(actual[field],layout[field])
 for(const [folder,name,version,extra] of [[layout.cli,'firebase-tools','15.30.2',{}],[layout.sdk,'firebase-functions','7.4.0',{bin:{'firebase-functions':'./lib/bin/firebase-functions.js'}}]])fs.writeFileSync(path.join(folder,'package.json'),JSON.stringify({name,version,...extra}))
 fs.writeFileSync(layout.binary,'#!/bin/sh\n# Synthetic Unix wrapper: must never execute\nexit 99\n')
 fs.writeFileSync(layout.binary+'.cmd',CMD_TEMPLATE.replaceAll('\n','\r\n'))
 return {layout,context:{projectId:PROJECT,projectDir:layout.lab,sourceDir:layout.source,runtime:'nodejs24'},close:()=>fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
}
test('reviewed CLI and SDK versions, file hashes and method API match the real installation',()=>{
 verifyInstallation(layoutFor())
 const {Delegate}=require('../../node_modules/firebase-tools/lib/deploy/functions/runtimes/node/index.js')
 assert.equal(createHash('sha256').update(Delegate.prototype.findFunctionsBinary.toString()).digest('hex'),'c51e3386faa7f4e4c880e42d3ceed43ef25a121503e0b6ab87f6fb9a63a4058b')
})
test('Windows selector replaces only the exact lab binary with its verified .cmd',()=>{
 const f=fixture()
 try{
  verifyInstallation(f.layout)
  let called=0
  const finder=makeFinder(function(){called++;return f.layout.binary},f.layout)
  assert.equal(finder.call(f.context),f.layout.binary+'.cmd');assert.equal(called,1)
  assert.equal(verifyWrapper(f.layout),f.layout.binary+'.cmd')
  fs.writeFileSync(f.layout.binary+'.cmd',CMD_TEMPLATE) // LF also accepted; no path interpolation
  assert.equal(finder.call(f.context),f.layout.binary+'.cmd')
 }finally{f.close()}
})
test('missing, redirected, augmented or alternate-interpreter wrappers fail closed',()=>{
 const f=fixture()
 try{
  const wrapper=f.layout.binary+'.cmd'
  fs.rmSync(wrapper);assert.throws(()=>verifyWrapper(f.layout),/ENOENT/)
  for(const text of [CMD_TEMPLATE+'\necho unexpected\n',CMD_TEMPLATE.replace('firebase-functions.js','other.js'),'#!/bin/sh\nexit 0',CMD_TEMPLATE.replace('SET "_prog=node"','SET "_prog=sh"')]){
   fs.writeFileSync(wrapper,text);assert.throws(()=>verifyWrapper(f.layout),/CMD_STRUCTURE/)
  }
  fs.writeFileSync(wrapper,CMD_TEMPLATE)
  fs.writeFileSync(path.join(path.dirname(wrapper),'node.exe'),'synthetic-not-an-executable')
  assert.throws(()=>verifyWrapper(f.layout),/CMD_NODE_OVERRIDE/)
 }finally{f.close()}
})
test('selector rejects other projects, sources, runtimes and fallback binaries',()=>{
 const f=fixture()
 try{
  const finder=makeFinder(()=>f.layout.binary,f.layout)
  for(const context of [{...f.context,projectId:'real-project'},{...f.context,runtime:'nodejs22'},{...f.context,projectDir:path.dirname(f.layout.lab)},{...f.context,sourceDir:path.dirname(f.layout.source)}])assert.throws(()=>finder.call(context),/CONTEXT/)
  assert.throws(()=>makeFinder(()=>path.join(f.layout.cli,'other-bin'),f.layout).call(f.context),/BINARY_OUTSIDE_LAB/)
 }finally{f.close()}
})
test('version and installed-source changes abort rather than enabling a generic workaround',()=>{
 const f=fixture()
 try{
  const file=path.join(f.layout.cli,'package.json'),original=fs.readFileSync(file)
  fs.writeFileSync(file,JSON.stringify({name:'firebase-tools',version:'15.30.3'}));assert.throws(()=>verifyInstallation(f.layout),/CLI_VERSION/);fs.writeFileSync(file,original)
  const sdk=path.join(f.layout.sdk,'package.json'),sdkOriginal=fs.readFileSync(sdk)
  fs.writeFileSync(sdk,JSON.stringify({name:'firebase-functions',version:'7.4.0',bin:{'firebase-functions':'other.js'}}));assert.throws(()=>verifyInstallation(f.layout),/SDK_STRUCTURE/);fs.writeFileSync(sdk,sdkOriginal)
  fs.appendFileSync(f.layout.delegate,'\n// changed');assert.throws(()=>verifyInstallation(f.layout),/CLI_STRUCTURE/)
 }finally{f.close()}
})
test('bootstrap accepts only the two fixed demo emulator invocations',()=>{
 const lab=layoutFor()
 const args=['emulators:start','--only','auth,functions','--project',PROJECT,'--config',path.join(lab.lab,'firebase.json'),'--non-interactive']
 validateInvocation(args)
 validateInvocation(args.map(x=>x==='auth,functions'?'auth,firestore,functions':x))
 for(const invalid of [args.map(x=>x===PROJECT?'real-project':x),['deploy'],[...args,'--debug'],args.map(x=>x==='auth,functions'?'functions':x),args.map(x=>x===path.join(lab.lab,'firebase.json')?'other.json':x)])assert.throws(()=>validateInvocation(invalid),/CLI_ARGUMENTS/)
})
test('Linux does not patch Delegate or install any discovery adaptation',{skip:process.platform==='win32'},()=>{
 const {Delegate}=require('../../node_modules/firebase-tools/lib/deploy/functions/runtimes/node/index.js'),before=Delegate.prototype.findFunctionsBinary
 assert.equal(installWindowsDiscovery(),false);assert.equal(Delegate.prototype.findFunctionsBinary,before)
})
test('native Windows can install the guarded selector against its actual npm .cmd',{skip:process.platform!=='win32'},()=>{
 const {Delegate}=require('../../node_modules/firebase-tools/lib/deploy/functions/runtimes/node/index.js'),before=Delegate.prototype.findFunctionsBinary
 const lab=layoutFor()
 try{
  assert.equal(installWindowsDiscovery(),true)
  const delegate=new Delegate(PROJECT,lab.lab,lab.source,'nodejs24')
  assert.equal(delegate.findFunctionsBinary(),lab.binary+'.cmd')
 }finally{Delegate.prototype.findFunctionsBinary=before}
})
test('reviewed cross-spawn parser selects cmd.exe and explicit .cmd, not sh (simulated Windows)',()=>{
 const vm=require('node:vm'),{createRequire}=require('node:module')
 const parseFile=require.resolve('cross-spawn/lib/parse'),dependencyRequire=createRequire(parseFile)
 const parseSource=fs.readFileSync(parseFile,'utf8'),winPath=path.win32
 const command=String.raw`C:\lab ñ spaces\functions\node_modules\.bin\firebase-functions`
 function parse(target,unix){
  const module={exports:{}}
  const context={module,exports:module.exports,process:{platform:'win32',env:{comspec:String.raw`C:\Windows\System32\cmd.exe`}},require:name=>{
   if(name==='path')return winPath
   if(name==='./util/resolveCommand')return parsed=>parsed.command===target?target:undefined
   if(name==='./util/readShebang')return ()=>unix?'sh':null
   return dependencyRequire(name)
  }}
  vm.runInNewContext(parseSource,context,{filename:parseFile})
  return module.exports(target,[String.raw`C:\lab ñ spaces\functions`],{})
 }
 const ambiguous=parse(command,true),explicit=parse(command+'.cmd',false)
 assert.match(ambiguous.args[3],/\bsh\b/)
 assert.equal(explicit.command,String.raw`C:\Windows\System32\cmd.exe`)
 assert.match(explicit.args[3],/firebase-functions\.cmd/)
 assert.doesNotMatch(explicit.args[3],/\bsh\b/)
 assert.notEqual(explicit.options.shell,true)
})
