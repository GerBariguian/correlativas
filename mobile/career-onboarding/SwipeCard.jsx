import React,{useEffect,useRef,useState} from 'react'
import {previewStatus,swipeStatus} from './gesture.mjs'
export const HOLD_MS=150
const interactive='button,a,input,select,textarea,summary,[contenteditable=true]'
export function SwipeCard({gestures=false,enabled,token,direction='next',onSwipe,children,...props}) {
 const card=useRef(null),active=useRef(null),timer=useRef(null),latest=useRef(null)
 const [movement,setMovement]=useState(null),[armed,setArmed]=useState(false)
 latest.current={enabled,token,onSwipe}
 useEffect(()=>{
  const el=card.current
  if(!gestures)return
  function cancel(paint=true){clearTimeout(timer.current);timer.current=null;active.current=null;if(paint){setMovement(null);setArmed(false)}}
  function valid(a){return a&&latest.current.enabled&&a.token===latest.current.token}
  function start(e){
   cancel()
   if(!latest.current.enabled||e.touches.length!==1||e.target.closest(interactive))return
   const t=e.touches[0]
   if(t.clientX<24||t.clientX>innerWidth-24)return
   const a={id:t.identifier,x:t.clientX,y:t.clientY,token:latest.current.token,armed:false,scroll:scrollY}
   active.current=a
   timer.current=setTimeout(()=>{
    if(active.current!==a||!valid(a)||document.hidden||Math.abs(scrollY-a.scroll)>1){cancel();return}
    a.armed=true;setArmed(true)
   },HOLD_MS)
  }
  function move(e){
   const a=active.current
   if(!valid(a)||e.touches.length!==1){cancel();return}
   const t=Array.from(e.touches).find(t=>t.identifier===a.id)
   if(!t){cancel();return}
   const x=t.clientX-a.x,y=t.clientY-a.y
   // Once a scroll has begun, this contact can never become a decision.
   if(!a.armed){if(Math.max(Math.abs(x),Math.abs(y))>=8)cancel();return}
   if(!e.cancelable){cancel();return}
   e.preventDefault()
   setMovement({x,y})
  }
  function end(e){
   const a=active.current,t=a&&Array.from(e.changedTouches).find(t=>t.identifier===a.id)
   const state=valid(a)&&a.armed&&t?swipeStatus({dx:t.clientX-a.x,dy:t.clientY-a.y}):null
   cancel()
   if(state)latest.current.onSwipe(state)
  }
  const stop=()=>cancel(),scroll=()=>{if(active.current)cancel()}
  const visibility=()=>{if(document.hidden)cancel()}
  const contacts=e=>{if(active.current&&e.touches.length>1)cancel()}
  el.addEventListener('touchstart',start,{passive:true})
  // Installed before touchstart, only on this card. Not a global scroll blocker.
  el.addEventListener('touchmove',move,{passive:false})
  el.addEventListener('touchend',end,{passive:true});el.addEventListener('touchcancel',stop,{passive:true})
  window.addEventListener('scroll',scroll,{passive:true,capture:true});window.addEventListener('blur',stop)
  document.addEventListener('visibilitychange',visibility)
  document.addEventListener('touchstart',contacts,{passive:true,capture:true})
  cancel()
  return()=>{
   cancel(false);el.removeEventListener('touchstart',start);el.removeEventListener('touchmove',move);el.removeEventListener('touchend',end);el.removeEventListener('touchcancel',stop)
   window.removeEventListener('scroll',scroll,true);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('touchstart',contacts,true)
  }
 },[gestures,enabled,token])
 const preview=enabled&&movement&&previewStatus(movement.x,movement.y)
 const ready=movement&&swipeStatus({dx:movement.x,dy:movement.y})
 return <article {...props} ref={card} className={`onboarding-subject${gestures?' swipe-card':''}${enabled&&armed?' is-armed':''}${enabled&&movement?' is-dragging':''}`} data-direction={direction} data-gesture-enabled={Boolean(enabled)} data-gesture-armed={Boolean(enabled&&armed)}
  onContextMenu={e=>{if(active.current?.armed)e.preventDefault()}}
  style={enabled&&movement?{'--card-drag-x':`${Math.max(-30,Math.min(30,movement.x/4))}px`,'--card-drag-y':`${Math.max(-20,Math.min(20,movement.y/4))}px`,'--card-drag-angle':`${Math.max(-5,Math.min(5,movement.x/30))}deg`}:undefined}>
  {children}
  {gestures&&<div className="academic-gesture-guide" aria-describedby="academic-gesture-help"><strong className="gesture-intent-label"><span className="gesture-hold-instruction">Mantené un instante y deslizá</span><span className="gesture-ready-instruction">Lista para deslizar</span></strong><span>Desde cualquier parte de esta tarjeta</span></div>}
  {preview&&<span className="academic-gesture-preview" data-gesture-status={preview} aria-hidden="true"><strong>{preview}</strong><small>{ready?'Soltá para registrar':'Seguí deslizando para confirmar'}</small></span>}
 </article>
}
