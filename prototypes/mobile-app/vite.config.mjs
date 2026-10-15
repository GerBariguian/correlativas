import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  plugins: [{
    name: 'offline-demo-boundary',
    enforce: 'pre',
    transform(code, id) {
      // Reuse web styles without its optional remote Google Fonts import.
      if (id.endsWith('/src/styles.css')) return code.replace(/@import\s+url\([^)]*\)\s*;/g, '')
    },
    resolveId(source) {
      if (/^(firebase|@firebase)(\/|$)/.test(source)) throw new Error('Firebase is forbidden in the visual demo')
    },
    generateBundle() {
      const forbidden = [...this.getModuleIds()].filter(id => /\/src\/(firebase(?:Runtime)?\.|services\/|hooks\/)|\/node_modules\/(?:@firebase|firebase)\//.test(id))
      if (forbidden.length) throw new Error(`Production modules in demo: ${forbidden.join(', ')}`)
    },
  }],
  define: { __ANDROID_DEMO__: false },
  root,
  base: './',
  publicDir: false,
  server: {
    host: '127.0.0.1', port: 5180, strictPort: true, hmr: false,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
  preview: { host: '127.0.0.1', port: 5181, strictPort: true },
  build: { outDir: '../../.tools/mobile-demo-dist', emptyOutDir: true },
})
