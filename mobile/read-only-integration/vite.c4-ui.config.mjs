import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { CSP } from './importPolicy.mjs'
import { assertC4UIModule, assertC4UISource } from './importPolicy.c4-ui.mjs'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({ root, base: './', publicDir: false, envDir: false, envPrefix: 'C4_UI_UNUSED_', cacheDir: root + 'node_modules/.vite-c4-ui',
  build: { outDir: 'dist/c4-ui', rolldownOptions: { input: fileURLToPath(new URL('./c4-ui.html', import.meta.url)) } },
  preview: { host: '127.0.0.1', port: 5187, strictPort: true, headers: { 'Content-Security-Policy': CSP } },
  plugins: [{ name: 'c4-ui-local-boundary', enforce: 'pre', transform(code, id) { assertC4UISource(code, id) }, generateBundle() { for (const id of this.getModuleIds()) assertC4UIModule(id) } }],
})
