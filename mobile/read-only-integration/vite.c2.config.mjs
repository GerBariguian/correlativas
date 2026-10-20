import base from './vite.config.mjs'
import { fileURLToPath } from 'node:url'
// Build C2 even though C1 UI deliberately does not import it.
export default { ...base, build: { outDir: 'dist/c2', lib: { entry: fileURLToPath(new URL('./academicClient.mjs', import.meta.url)), formats: ['es'], fileName: () => 'academic-client.mjs' } } }
