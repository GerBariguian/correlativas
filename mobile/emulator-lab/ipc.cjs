'use strict'
const path=require('node:path'),os=require('node:os')
// Match only the pinned firebase-tools getTemporarySocketPath implementation.
function localSocket(value,platform=process.platform,temp=os.tmpdir()){
 if(typeof value!=='string')return false
 if(platform==='win32')return /^\\\\\?\\pipe\\fire_emu_[0-9a-f]{16}$/.test(value)
 return path.dirname(value)===temp&&/^fire_emu_[0-9a-f]{16}\.sock$/.test(path.basename(value))&&value===path.join(temp,path.basename(value))
}
module.exports={localSocket}
