'use strict'
// Private, version-pinned CLI adaptation. Never edits installed packages or patches spawn globally.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto')
const {PROJECT,assertEnvironment}=require('./policy.cjs')
const CLI_VERSION='15.30.2',SDK_VERSION='7.4.0'
const DELEGATE_SHA256='adc89488bb4c87808e90a54b94606c31873c010c24f76ca2b867bf2bfe8ccfa1'
const FINDER_SHA256='c51e3386faa7f4e4c880e42d3ceed43ef25a121503e0b6ab87f6fb9a63a4058b'
const SDK_BIN_SHA256='2f4878ce52cb8edab06ecc52f7f70205b8ed37985fb5a7e566040bc83350f864'
const sha=value=>createHash('sha256').update(value).digest('hex')
const refuse=reason=>{throw Error('LAB_FUNCTIONS_DISCOVERY_REFUSED_'+reason)}
// Reviewed npm cmd-shim template for a package bin with #!/usr/bin/env node.
// CRLF/LF and final whitespace are equivalent; extra commands are never accepted.
const CMD_TEMPLATE=[
 '@ECHO off','GOTO start',':find_dp0','SET dp0=%~dp0','EXIT /b',':start','SETLOCAL','CALL :find_dp0','',
 'IF EXIST "%dp0%\\node.exe" (','  SET "_prog=%dp0%\\node.exe"',') ELSE (','  SET "_prog=node"',
 '  SET PATHEXT=%PATHEXT:;.JS;=;%',')','',
 'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\..\\firebase-functions\\lib\\bin\\firebase-functions.js" %*',''
].join('\n')
function layoutFor(lab=__dirname){
 lab=fs.realpathSync(lab)
 const root=path.resolve(lab,'../..'),source=path.join(lab,'functions')
 const cli=path.join(root,'node_modules/firebase-tools'),sdk=path.join(source,'node_modules/firebase-functions')
 return {lab,source,cli,sdk,cliEntry:path.join(cli,'lib/bin/firebase.js'),delegate:path.join(cli,'lib/deploy/functions/runtimes/node/index.js'),binary:path.join(source,'node_modules/.bin/firebase-functions'),sdkEntry:path.join(sdk,'lib/bin/firebase-functions.js')}
}
function regular(file){
 const info=fs.lstatSync(file)
 if(!info.isFile()||info.isSymbolicLink()||fs.realpathSync(file)!==path.resolve(file))refuse('FILE_LAYOUT')
}
function verifyInstallation(layout){
 const cli=JSON.parse(fs.readFileSync(path.join(layout.cli,'package.json'),'utf8'))
 const sdk=JSON.parse(fs.readFileSync(path.join(layout.sdk,'package.json'),'utf8'))
 if(cli.name!=='firebase-tools'||cli.version!==CLI_VERSION)refuse('CLI_VERSION')
 if(sdk.name!=='firebase-functions'||sdk.version!==SDK_VERSION||sdk.bin?.['firebase-functions']!=='./lib/bin/firebase-functions.js')refuse('SDK_STRUCTURE')
 for(const file of [layout.cliEntry,layout.delegate,layout.sdkEntry])regular(file)
 if(sha(fs.readFileSync(layout.delegate))!==DELEGATE_SHA256)refuse('CLI_STRUCTURE')
 if(sha(fs.readFileSync(layout.sdkEntry))!==SDK_BIN_SHA256)refuse('SDK_BIN_STRUCTURE')
}
function verifyWrapper(layout){
 const wrapper=layout.binary+'.cmd'
 regular(wrapper)
 const actual=fs.readFileSync(wrapper,'utf8').replaceAll('\r\n','\n').trimEnd()
 if(actual!==CMD_TEMPLATE.trimEnd())refuse('CMD_STRUCTURE')
 // The accepted shim has a local-node override. Do not silently accept a different interpreter.
 if(fs.existsSync(path.join(path.dirname(wrapper),'node.exe')))refuse('CMD_NODE_OVERRIDE')
 return wrapper
}
function makeFinder(original,layout){
 return function findLabWindowsFunctionsBinary(){
  assertEnvironment()
  if(this.projectId!==PROJECT||this.runtime!=='nodejs24'||
     fs.realpathSync(this.projectDir)!==fs.realpathSync(layout.lab)||
     fs.realpathSync(this.sourceDir)!==fs.realpathSync(layout.source))refuse('CONTEXT')
  const selected=original.call(this)
  if(path.resolve(selected)!==path.resolve(layout.binary))refuse('BINARY_OUTSIDE_LAB')
  return verifyWrapper(layout)
 }
}
function installWindowsDiscovery(){
 if(process.platform!=='win32')return false // No CLI modules loaded or behavior changed on Linux.
 assertEnvironment()
 const layout=layoutFor()
 verifyInstallation(layout);verifyWrapper(layout)
 const {Delegate}=require(layout.delegate)
 const original=Delegate?.prototype?.findFunctionsBinary
 if(typeof original!=='function'||sha(original.toString())!==FINDER_SHA256||typeof Delegate.prototype.spawnFunctionsProcess!=='function')refuse('DELEGATE_API')
 Delegate.prototype.findFunctionsBinary=makeFinder(original,layout)
 console.log('[lab] Windows Functions discovery: verified .cmd wrapper, Firebase CLI '+CLI_VERSION)
 return true
}
function validateInvocation(args,layout=layoutFor()){
 const expected=['emulators:start','--only',args[2],'--project',PROJECT,'--config',path.join(layout.lab,'firebase.json'),'--non-interactive']
 if(!['auth,functions','auth,firestore,functions'].includes(args[2])||JSON.stringify(args)!==JSON.stringify(expected))refuse('CLI_ARGUMENTS')
}
function main(){
 if(process.platform!=='win32')refuse('WINDOWS_ONLY_ENTRYPOINT')
 assertEnvironment();require('./net-guard.cjs')
 validateInvocation(process.argv.slice(2))
 installWindowsDiscovery()
 const layout=layoutFor()
 // Preserve the CLI's normal argv shape; adaptation exists only in this owned process.
 process.argv[1]=layout.cliEntry
 require(layout.cliEntry)
}
if(require.main===module){try{main()}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={layoutFor,verifyInstallation,verifyWrapper,makeFinder,installWindowsDiscovery,validateInvocation,CMD_TEMPLATE}
