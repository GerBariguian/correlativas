import base from './vite.config.mjs'
import { fileURLToPath } from 'node:url'
// Development React is bundled only here, to exercise Strict Mode effects.
export default { ...base, base: './', define: { 'process.env.NODE_ENV': JSON.stringify('development') },
  build: { outDir: 'dist/c3-manual', minify: false, rolldownOptions: { input: fileURLToPath(new URL('./c3-manual.html', import.meta.url)) } } }
