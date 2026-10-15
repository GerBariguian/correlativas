import { mergeConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import base from '../../prototypes/mobile-app/vite.config.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
export default mergeConfig(base, {
  root,
  resolve: { alias: [{ find: /^\.\/androidRuntime(?:\.js)?$/, replacement: `${root}browserRuntime.js` }] },
  plugins: [{
    name: 'safari-reviewed-modules',
    generateBundle(_, bundle) {
      const modules = [...this.getModuleIds()].filter(id => !id.startsWith('\0'))
      if (modules.some(id => /node_modules\/(?:@capacitor|firebase|@firebase)\//.test(id))) {
        throw new Error('Native/Firebase SDK forbidden in Safari demo')
      }
      const included = [...new Set(Object.values(bundle).flatMap(chunk => chunk.type === 'chunk' ? Object.keys(chunk.modules) : []))]
      this.emitFile({ type: 'asset', fileName: 'reviewed-modules.json', source: JSON.stringify(included.map(id => id.replace(fileURLToPath(new URL('../..', import.meta.url)), '')).sort(), null, 2) })
    },
  }],
  build: { target: 'safari15.4', cssTarget: 'safari15.4', outDir: '../../.tools/safari-demo-dist', sourcemap: false },
})
