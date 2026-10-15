import { mergeConfig } from 'vite'
import demo from '../../prototypes/mobile-app/vite.config.mjs'

// Reuse the approved React entry and its Firebase/module/network safeguards.
export default mergeConfig(demo, {
  define: { __ANDROID_DEMO__: true },
  build: { outDir: '../../.tools/mobile-android-dist', emptyOutDir: true },
})
