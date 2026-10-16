// Local-only asynchronous transport simulation. No Firebase, storage or network.
import { STATUS } from '../../src/logic.js'
import { describeContext, updateDemoRecord } from './contextModel.mjs'
const sameScope = (a,b) => a.key===b.key && a.catalogId===b.catalogId && a.authority===b.authority && a.phase===b.phase && a.usable && b.usable
export function createSimulatedAcademicOperations({read,write,catalogs,publish,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}) {
  let epoch=0,sequence=0,pending=null,disposed=false
  let feedback={phase:'idle',message:'',requestId:null}
  const revisions=new Map()
  const emit = value => { feedback=value;if(!disposed)publish(value) }
  function invalidate(message='La operación anterior se descartó al cambiar el contexto.') {
    epoch++
    if(pending){cancel(pending.timer);const aborted=pending;pending=null;aborted.onResult?.('cancelled');emit({phase:'idle',message,requestId:null})}
    else emit({phase:'idle',message:'',requestId:null})
  }
  function begin({kind='save',code,status,mode='success',delay=350,onResult}={}) {
    const context=describeContext(read(),catalogs)
    if(disposed || pending || !context.usable || !['save','load'].includes(kind) || !['success','error','conflict'].includes(mode)) return false
    if(kind==='save' && ['error','conflict'].includes(feedback.phase)) return false
    if(kind==='save') {
      if(!STATUS.includes(status) || !context.career.subjects.some(s=>s.code===code)) return false
      // Validate before scheduling; never interpret an unreadable record as empty.
      try { updateDemoRecord(read(),context.key,'status',{...context.record.status,[code]:status},catalogs) } catch { return false }
    }
    if(!context.record.status || typeof context.record.status!=='object' || Array.isArray(context.record.status) || Object.values(context.record.status).some(s=>!STATUS.includes(s))) return false
    const revision=revisions.get(context.key) ?? 0
    const token={id:++sequence,epoch,context,revision,timer:null,onResult}
    pending=token
    emit({phase:kind==='load'?'loading':'saving',message:kind==='load'?'Cargando datos ficticios…':'Actualizando estado en la demo…',requestId:token.id})
    function finish(){
      // Includes epoch: leaving A and returning to A never revives an old result.
      if(disposed || pending!==token || token.epoch!==epoch || !sameScope(token.context,describeContext(read(),catalogs))) return
      pending=null
      if(mode==='error'){onResult?.('error');emit({phase:'error',message:'Error simulado. No se aplicó el cambio. Actualizá los datos ficticios antes de reintentar.',requestId:token.id});return}
      if(mode==='conflict' || (revisions.get(context.key)??0)!==token.revision){
        revisions.set(context.key,token.revision+1)
        onResult?.('conflict')
        emit({phase:'conflict',message:'Conflicto simulado de revisión. Se conservó el progreso; actualizá antes de reintentar.',requestId:token.id});return
      }
      try {
        if(kind==='save') {
          const current=read()
          write(updateDemoRecord(current,context.key,'status',{...describeContext(current,catalogs).record.status,[code]:status},catalogs))
          revisions.set(context.key,revision+1)
        }
        onResult?.('success')
        emit({phase:'success',message:kind==='load'?'Datos ficticios actualizados. Sin conexión a servidores.':'Estado actualizado únicamente en esta demo.',requestId:token.id})
      } catch { onResult?.('error');emit({phase:'error',message:'No se pudo aplicar la operación ficticia. El progreso confirmado se conserva.',requestId:token.id}) }
    }
    token.timer=schedule(finish,delay===4000?4000:350)
    return true
  }
  return {begin,invalidate,get feedback(){return feedback},dispose(){disposed=true;epoch++;if(pending)cancel(pending.timer);pending=null}}
}
