import { useEffect, useRef } from 'react'

if (__ANDROID_DEMO__) document.documentElement.classList.add('android-demo')

// Compile-time false in the browser demo: it keeps the portable HTML independent
// of Capacitor. Only the Android build includes this plugin and its native bridge.
export function useAndroidBack(handler) {
  const current = useRef(handler)
  current.current = handler
  useEffect(() => {
    if (!__ANDROID_DEMO__) return
    let disposed = false
    let listener
    import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('backButton', () => current.current(() => App.exitApp()))
      if (disposed) await handle.remove()
      else listener = handle
    }).catch(error => console.error('No se pudo preparar el botón Atrás de Android.', error))
    return () => { disposed = true; listener?.remove() }
  }, [])
}
