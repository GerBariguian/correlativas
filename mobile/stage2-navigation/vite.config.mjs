import { mergeConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import base from '../../prototypes/mobile-app/vite.config.mjs'
export default mergeConfig(base, {
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { target: 'safari15.4', cssTarget: 'safari15.4', outDir: '../../.tools/mobile-navigation-dist' },
})
