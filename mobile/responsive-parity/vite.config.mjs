import { mergeConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import base from '../integration-final/vite.config.mjs'
export default mergeConfig(base, {
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { outDir: '../../.tools/mobile-241/dist' },
})
