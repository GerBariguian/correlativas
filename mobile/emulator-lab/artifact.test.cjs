'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os')
const {PIN,metadata,verifyBytes}=require('./artifact.cjs'),{download,writeVerifiedResponse}=require('./prepare.cjs')
const bytes=Buffer.from('synthetic-artifact-test'),expected={...PIN,expectedSize:bytes.length,expectedChecksumSHA256:createHash('sha256').update(bytes).digest('hex')}
function request(body,status=200,headers={}){return (url,options,callback)=>{
 assert.equal(url,PIN.remoteUrl);assert.equal(options.rejectUnauthorized,true);assert.equal(options.agent.options.rejectUnauthorized,true)
 const req=new EventEmitter();req.destroy=()=>{}
 queueMicrotask(()=>{const response=Readable.from([body]);response.statusCode=status;response.headers=headers;callback(response)})
 return req
}}
test('official artifact pins, size and SHA-256 cannot drift',()=>{
 assert.deepEqual(metadata(),PIN);assert.equal(PIN.expectedSize,136707194)
 verifyBytes(bytes,expected)
 assert.throws(()=>verifyBytes(Buffer.from('wrong'),expected),/INVALID/)
 assert.throws(()=>verifyBytes(bytes,{...expected,expectedChecksumSHA256:'0'.repeat(64)}),/INVALID/)
 assert.throws(()=>verifyBytes(bytes),/INVALID/)
})
test('verified downloader rejects redirects, truncation, oversize, hash mismatch and TLS errors',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lab download '));let n=0
 const file=()=>path.join(dir,String(n++))
 const response=(body,headers={})=>Object.assign(Readable.from([body]),{headers})
 try{
  const good=file();await writeVerifiedResponse(good,response(bytes),expected);assert.deepEqual(await fs.readFile(good),bytes)
  await assert.rejects(download(file(),request(bytes,302)),/HTTP_302/)
  await assert.rejects(download(file(),request(bytes,403)),/HTTP_403/)
  await assert.rejects(writeVerifiedResponse(file(),response(bytes.subarray(1)),expected),/INVALID/)
  await assert.rejects(writeVerifiedResponse(file(),response(Buffer.concat([bytes,bytes])),expected),/SIZE/)
  await assert.rejects(writeVerifiedResponse(file(),response(Buffer.alloc(bytes.length)),expected),/INVALID/)
  await assert.rejects(download(file(),request(bytes,200,{'content-length':'1'})),/SIZE/)
  await assert.rejects(download(file(),request(bytes)),/INVALID/) // Real pinned size, never synthetic override
  await assert.rejects(download(file(),()=>{const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>req.emit('error',Object.assign(Error('TLS rejected'),{code:'CERT_HAS_EXPIRED'})));return req}),{code:'CERT_HAS_EXPIRED'})
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})
