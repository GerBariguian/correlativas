// Same direction mapping, preview distance and release criteria as the web's
// src/components/AcademicOnboardingMobile.jsx. No dependency on its controller.
export const direction = (x,y) => Math.abs(x)>Math.abs(y)
 ? (x>0?'Aprobada':'Pendiente') : (y<0?'Cursando':'Regularizada')
export function previewStatus(x,y) {
 return Math.max(Math.abs(x),Math.abs(y))>=18 ? direction(x,y) : null
}
export function swipeStatus({dx,dy}) {
 const major=Math.max(Math.abs(dx),Math.abs(dy)),minor=Math.min(Math.abs(dx),Math.abs(dy))
 return major>=65 && major>minor*1.25 ? direction(dx,dy) : null
}
