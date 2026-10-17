// Input observation only: never move focus, intercept gestures or persist modality.
export function observeInputModality(root = document.documentElement) {
 const previous = root.getAttribute('data-demo-input')
 const pointer = () => root.setAttribute('data-demo-input', 'pointer')
 const keyboard = event => {
  if (event.key === 'Tab' || (!event.metaKey && !event.ctrlKey && !event.altKey && !['Shift','Control','Alt','Meta'].includes(event.key))) root.setAttribute('data-demo-input', 'keyboard')
 }
 document.addEventListener('pointerdown', pointer, {capture:true, passive:true})
 document.addEventListener('touchstart', pointer, {capture:true, passive:true})
 document.addEventListener('keydown', keyboard, true)
 return () => {
  document.removeEventListener('pointerdown', pointer, true)
  document.removeEventListener('touchstart', pointer, true)
  document.removeEventListener('keydown', keyboard, true)
  if (previous === null) root.removeAttribute('data-demo-input')
  else root.setAttribute('data-demo-input', previous)
 }
}
