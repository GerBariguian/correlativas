// Isolated visual demo. No Firebase, imports, storage or network operations.
const subjects = [
  {code:'M01',name:'Álgebra y geometría',year:'1.º año',term:'1.er cuatrimestre',saved:'Aprobada'},
  {code:'M02',name:'Introducción a la programación',year:'1.º año',term:'1.er cuatrimestre'},
  {code:'M03',name:'Sistemas y organizaciones',year:'1.º año',term:'1.er cuatrimestre',saved:'Pendiente'},
  {code:'M04',name:'Análisis matemático I',year:'1.º año',term:'2.º cuatrimestre'},
  {code:'M05',name:'Arquitectura de computadoras',year:'1.º año',term:'2.º cuatrimestre'},
  {code:'M06',name:'Bases de datos',year:'2.º año',term:'1.er cuatrimestre'},
  {code:'M07',name:'Proyecto integrador',year:'2.º año',term:'Anual'},
  {code:'M08',name:'Seminario electivo',year:'2.º año',term:'Período no especificado'},
]
const editable=subjects.filter(s=>!Object.hasOwn(s,'saved'))
const states=['Pendiente','Cursando','Regularizada','Aprobada']
const colors=['pending','course','regular','approved']
const arrows=['←','↑','↓','→']
const icons=[
  '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  '<path d="M12 5v15M12 6C9 4 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-1-9 1Z"/>',
  '<path d="m12 3 8 9-8 9-8-9Z"/>',
  '<path d="m5 12 4 4L19 6"/>'
]
let decisions={},skipped=[],index=0,past=[],future=[],screen='cards',drag=null
const app=document.getElementById('app')
const announce=message=>{document.getElementById('announce').textContent=message}
const snapshot=()=>({decisions:{...decisions},skipped:[...skipped],index,screen})
function restore(value){({decisions,skipped,index,screen}=value);render()}
function render(focus=true){
  drag=null
  const reviewed=Object.keys(decisions).length
  if(screen==='done'){
    app.innerHTML='<section class="success"><div class="success-icon">✓</div><p class="eyebrow">Demo completada</p><h1>Tu punto de partida, listo.</h1><p class="muted">En el flujo real, acá confirmarías los cambios. Esta demo no guardó ninguna información.</p><button class="primary" data-action="review">Volver al resumen</button></section>'
  }else if(screen==='review'){
    app.innerHTML=`<p class="eyebrow">Antes de terminar</p><h1 tabindex="-1">Revisá tu recorrido</h1><p class="muted">Tocá una materia para corregirla antes de confirmar.</p><div class="summary">${states.map((s,i)=>`<div class="${colors[i]}">${s}<b>${Object.values(decisions).filter(v=>v===s).length}</b></div>`).join('')}</div><ul class="list">${editable.map((s,i)=>`<li><div><strong>${s.name}</strong><small>${s.year} · ${s.term}</small></div><button data-edit="${i}" aria-label="Editar ${s.name}" class="${colors[states.indexOf(decisions[s.code])]||''}">${decisions[s.code]||'Sin revisar'}</button></li>`).join('')}</ul><div class="notice">${editable.length-reviewed} sin revisar: no se les asigna Pendiente automáticamente. Las 2 materias con progreso previo, incluida una Pendiente, se conservan intactas.</div><div class="utility"><button data-action="cards">← Volver a tarjetas</button><button data-action="undo" ${past.length?'':'disabled'}>↶ Deshacer</button><button data-action="redo" ${future.length?'':'disabled'}>↷ Rehacer</button></div><button class="primary" data-action="confirm">Confirmar ${reviewed} decisiones · Demo</button>`
  }else{
    const s=editable[index]
    app.innerHTML=`<p class="eyebrow">Carga académica · Demo</p><h1 tabindex="-1">Una materia a la vez.</h1><p class="muted">Marcá tu estado actual. Podés corregirlo después.</p><div class="progress-label"><strong>${reviewed} de ${editable.length} revisadas</strong><span>${skipped.length} omitidas</span></div><progress value="${reviewed}" max="${editable.length}" aria-label="Materias revisadas"></progress><p class="hint">2 previas protegidas · No es avance académico</p><div class="deck"><article class="card" aria-label="Materia actual: ${s.name}"><span class="chip">${s.year} · ${s.term}</span><h2>${s.name}</h2><p class="badge">${s.code} · ${decisions[s.code]||'Sin revisar'}</p><span class="stamp" hidden></span><p class="hint">Tarjeta ${index+1} de ${editable.length}</p></article></div><p class="gesture-help">Deslizá dentro de la tarjeta o usá los botones.</p><div class="controls">${states.map((state,i)=>`<div class="action"><button class="${colors[i]}" data-state="${state}" aria-label="${state}" title="${state} · ${['Izquierda','Arriba','Abajo','Derecha'][i]}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[i]}</svg></button><span aria-hidden="true">${state}</span></div>`).join('')}</div><div class="utility"><button data-action="undo" ${past.length?'':'disabled'}>↶ Deshacer</button><button data-action="skip">Omitir →</button><button data-action="redo" ${future.length?'':'disabled'}>↷ Rehacer</button></div><button class="primary" data-action="review">Revisar decisiones</button><div class="notice">Sin revisar ≠ Pendiente. Omitir deja esta tarjeta sin estado. Para desplazar la página, deslizá fuera de la tarjeta.</div>`
    wireGesture()
  }
  if(focus)app.querySelector('h1')?.focus({preventScroll:true})
}
function decide(state){
  if(screen!=='cards')return
  past.push(snapshot());future=[]
  const code=editable[index].code
  skipped=skipped.filter(c=>c!==code)
  if(state)decisions[code]=state
  else{delete decisions[code];skipped.push(code)}
  announce(`${editable[index].name}: ${state||'omitida, sin revisar'}`)
  if(index===editable.length-1)screen='review';else index++
  render()
}
function direction(x,y){return Math.abs(x)>Math.abs(y)?(x>0?'Aprobada':'Pendiente'):(y<0?'Cursando':'Regularizada')}
function wireGesture(){
  const card=app.querySelector('.card'),stamp=card.querySelector('.stamp')
  const reset=()=>{drag=null;card.classList.remove('dragging');card.style.transform='';stamp.hidden=true}
  card.onpointerdown=e=>{if(!e.isPrimary||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};card.setPointerCapture(e.pointerId);card.classList.add('dragging')}
  card.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;const x=e.clientX-drag.x,y=e.clientY-drag.y;const state=direction(x,y);if(!matchMedia('(prefers-reduced-motion: reduce)').matches)card.style.transform=`translate(${Math.max(-35,Math.min(35,x/4))}px,${Math.max(-25,Math.min(25,y/4))}px) rotate(${Math.max(-5,Math.min(5,x/30))}deg)`;stamp.hidden=Math.max(Math.abs(x),Math.abs(y))<18;stamp.textContent=`${arrows[states.indexOf(state)]} ${state.toUpperCase()}`;stamp.className=`stamp ${colors[states.indexOf(state)]}`}
  card.onpointerup=e=>{if(!drag||e.pointerId!==drag.id)return;const x=e.clientX-drag.x,y=e.clientY-drag.y;reset();if(Math.max(Math.abs(x),Math.abs(y))>=65&&Math.max(Math.abs(x),Math.abs(y))>Math.min(Math.abs(x),Math.abs(y))*1.25)decide(direction(x,y))}
  card.onpointercancel=reset;card.onlostpointercapture=reset
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return
  if(b.id==='restart'){decisions={};skipped=[];past=[];future=[];index=0;screen='cards';render();return}
  if(b.dataset.state){decide(b.dataset.state);return}
  if(b.dataset.edit!==undefined){index=Number(b.dataset.edit);screen='cards';render();return}
  switch(b.dataset.action){
    case 'skip':decide(null);break
    case 'undo':if(past.length){future.push(snapshot());restore(past.pop());announce('Última decisión deshecha')}break
    case 'redo':if(future.length){past.push(snapshot());restore(future.pop());announce('Decisión rehecha')}break
    case 'review':screen='review';render();break
    case 'cards':screen='cards';render();break
    case 'confirm':screen='done';render();break
  }
})
render(false)
