import React,{useEffect,useRef,useState} from 'react'
import {previewStatus,swipeStatus} from './gesture.mjs'
export function SwipeCard({gestures=false,enabled,token,direction='next',onSwipe,children,...props}) {
 const active=useRef(null),[movement,setMovement]=useState(null)
 function cancel(){active.current=null;setMovement(null)}
 useEffect(()=>{cancel()},[enabled,token])
 function down(e){
  if(!enabled || !e.isPrimary || e.button!==0){cancel();return}
  if(e.clientX<24 || e.clientX>innerWidth-24){cancel();return}
  active.current={id:e.pointerId,x:e.clientX,y:e.clientY,token}
  e.currentTarget.setPointerCapture(e.pointerId)
 }
 function move(e){
  const a=active.current
  if(!a || a.id!==e.pointerId || a.token!==token || !enabled)return
  setMovement({x:e.clientX-a.x,y:e.clientY-a.y})
 }
 function up(e){
  const a=active.current
  cancel()
  if(!enabled || !a || a.id!==e.pointerId || a.token!==token)return
  const status=swipeStatus({dx:e.clientX-a.x,dy:e.clientY-a.y})
  if(status)onSwipe(status)
 }
 const preview=enabled && movement && previewStatus(movement.x,movement.y)
 const ready=movement && swipeStatus({dx:movement.x,dy:movement.y})
 return <article {...props} className={`onboarding-subject${gestures?' swipe-card':''}${enabled&&movement?' is-dragging':''}`} data-direction={direction}
  style={enabled&&movement?{'--card-drag-x':`${Math.max(-30,Math.min(30,movement.x/4))}px`,'--card-drag-y':`${Math.max(-20,Math.min(20,movement.y/4))}px`,'--card-drag-angle':`${Math.max(-5,Math.min(5,movement.x/30))}deg`}:undefined}>
  {children}
  {gestures && <div className="academic-gesture-zone" aria-disabled={!enabled} role="group" aria-label="Zona de gestos académicos" aria-describedby="academic-gesture-help"
   onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={e=>{if(e.target===e.currentTarget)cancel()}}>
   <strong>Deslizá desde aquí</strong><span>← Pendiente · Aprobada →</span><span>↑ Cursando · Regularizada ↓</span>
  </div>}
  {preview && <span className="academic-gesture-preview" data-gesture-status={preview} aria-hidden="true"><strong>{preview}</strong><small>{ready?'Soltá para registrar':'Seguí deslizando para confirmar'}</small></span>}
 </article>
}
