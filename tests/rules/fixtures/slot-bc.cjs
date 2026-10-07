// Isolated B+C candidate. Never deployment input.
const fs=require('node:fs'),{expanded}=require('./slot-expansion.cjs')
function bc(original){
 const before=fs.readFileSync('tests/rules/fixtures/slot-subjects.fragment.rules','utf8')
 const r=expanded(original)
 if(!r.includes(before))throw Error('Missing subjects seam')
 // Callback preserves literal $ in Rules regexes (String replacement interprets $').
 return r.replace(before,()=>fs.readFileSync('tests/rules/fixtures/slot-bc.fragment.rules','utf8'))
}
module.exports={bc}
