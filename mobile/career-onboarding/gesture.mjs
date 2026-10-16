// Gestures navigate cards only; they never map a direction to an academic status.
export function lockAxis(dx,dy) {
 if(Math.max(Math.abs(dx),Math.abs(dy))<12)return null
 return Math.abs(dx)>Math.abs(dy)*1.6 ? 'horizontal' : 'vertical'
}
export function swipeDirection({dx,dy,width,duration}) {
 if(duration>1200 || duration<0 || Math.abs(dx)<Math.max(64,Math.min(100,width*.24)) || Math.abs(dx)<=Math.abs(dy)*1.6)return null
 return dx<0?'next':'previous'
}
