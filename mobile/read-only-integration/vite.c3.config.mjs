import base from './vite.config.mjs'
import { fileURLToPath } from 'node:url'
export default { ...base, build: { outDir: 'dist/c3', rolldownOptions: { external: ['react'] }, lib: { entry: fileURLToPath(new URL('./c3.mjs', import.meta.url)), formats: ['es'], fileName: () => 'academic-consumer.mjs' } } }
