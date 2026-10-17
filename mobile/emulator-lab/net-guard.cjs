'use strict'
// Process-local safety belt for Node transports. Not an OS sandbox for hostile code.
const net=require('node:net'),tls=require('node:tls')
const allowed=new Set(['127.0.0.1','localhost','::1','[::1]'])
const localSocket=p=>/^\/tmp\/fire_emu_[0-9a-f]+\.sock$/.test(p)
const deny=()=>{throw Object.assign(Error('LAB_BLOCKED_NON_LOOPBACK_NETWORK'),{code:'LAB_NETWORK_BLOCKED'})}
function validate(args){
 let a=args[0]
 if(Array.isArray(a))return validate(a)
 if(a&&typeof a==='object'){
  if(a.path){if(localSocket(a.path))return;return deny()}
  if(!allowed.has(a.host??a.hostname??'localhost'))deny()
 }else if(typeof a==='number'||/^\d+$/.test(String(a))){
  if(typeof args[1]==='string'&&!allowed.has(args[1]))deny()
 }else if(typeof a==='string'&&localSocket(a))return
 else deny()
}
const original=net.Socket.prototype.connect
net.Socket.prototype.connect=function(...args){validate(args);return original.apply(this,args)}
const secure=tls.connect
tls.connect=function(...args){validate(args);return secure.apply(this,args)}
const originalFetch=globalThis.fetch
if(originalFetch)globalThis.fetch=function(input,opts){const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!allowed.has(u.hostname)||!['http:','https:'].includes(u.protocol))deny();return originalFetch(input,opts)}
module.exports={validate}
// SDK discovery/portfinder scan interfaces; bind every TCP listener to loopback.
const originalListen=net.Server.prototype.listen
net.Server.prototype.listen=function(...args){
 const a=args[0]
 if(a&&typeof a==='object'){
  if(a.path){if(!localSocket(a.path))deny()}
  else{if(!Object.hasOwn(a,'port'))deny();args[0]={...a,host:'127.0.0.1'}}
 }else if(typeof a==='number'||/^\d+$/.test(String(a))){
  if(typeof args[1]==='string'||args[1]===undefined)args[1]='127.0.0.1'
  else args.splice(1,0,'127.0.0.1')
 }else if(!localSocket(a))deny()
 return originalListen.apply(this,args)
}
