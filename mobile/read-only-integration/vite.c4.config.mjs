import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { CSP } from './importPolicy.mjs'
import { assertC4Module, assertC4Source } from './importPolicy.c4.mjs'
const root = fileURLToPath(new URL('.', import.meta.url))
// Deliberately independent: no changes or plugin replacement in C1–C3 configs.
export default defineConfig({ root, publicDir: false, envDir: false, envPrefix: 'C4_UNUSED_',
  cacheDir: root + 'node_modules/.vite-c4',
  preview: { host: '127.0.0.1', port: 5187, strictPort: true, headers: { 'Content-Security-Policy': CSP } },
  build: { outDir: 'dist/c4', lib: { entry: fileURLToPath(new URL('./c4.mjs', import.meta.url)), formats: ['es'], fileName: () => 'academic-view-model.mjs' } },
  plugins: [{ name: 'c4-read-only-boundary', enforce: 'pre', transform(code, id) { assertC4Source(code, id) },
    generateBundle() { for (const id of this.getModuleIds()) assertC4Module(id) } }],
})
