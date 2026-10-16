import React,{useRef,useState} from 'react'
import {lockAxis,swipeDirection} from './gesture.mjs'
export function SwipeCard({enabled,token,direction='next',onSwipe,children,...props}) {
 const active=useRef(null),[drag,setDrag]=useState(0)
 function cancel(){active.current=null;setDrag(0)}
 function down(e){
  if(!enabled || !e.isPrimary || !['touch','pen'].includes(e.pointerType)){cancel();return}
  // Leave browser edge gestures and multi-finger zoom alone.
  if(e.clientX<24 || e.clientX>innerWidth-24){cancel();return}
  active.current={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),axis:null,token}
 }
 function move(e){
  const a=active.current
  if(!a || a.id!==e.pointerId || a.token!==token || !enabled)return
  const dx=e.clientX-a.x,dy=e.clientY-a.y
  a.axis??=lockAxis(dx,dy)
  if(a.axis!=='horizontal')return
  e.currentTarget.setPointerCapture(e.pointerId)
  setDrag(Math.max(-110,Math.min(110,dx)))
 }
 function up(e){
  const a=active.current
  cancel()
  if(!enabled || !a || a.id!==e.pointerId || a.token!==token || a.axis!=='horizontal')return
  const direction=swipeDirection({dx:e.clientX-a.x,dy:e.clientY-a.y,width:e.currentTarget.clientWidth,duration:performance.now()-a.time})
  if(direction)onSwipe(direction)
 }
 return <article {...props} className={`onboarding-subject${enabled?' swipe-card':''}${drag?' is-dragging':''}`} data-direction={direction}
  style={enabled?{'--card-drag':`${drag}px`}:undefined}
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={e=>{if(e.target===e.currentTarget)cancel()}}>
  {children}
 </article>
}
