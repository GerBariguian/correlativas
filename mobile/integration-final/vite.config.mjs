import { mergeConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import base from '../stage2-navigation/vite.config.mjs'
const root = fileURLToPath(new URL('.', import.meta.url))
const securityHeaders = fs.readFileSync(new URL('../safari-demo-site/_headers', import.meta.url), 'utf8')
const headers = Object.fromEntries(securityHeaders.split('\n').filter(line => line.startsWith('  ')).map(line => {
  const split = line.indexOf(': ')
  return [line.slice(0, split).trim(), line.slice(split + 2)]
}))
export default mergeConfig(base, {
  root,
  preview: { headers },
  plugins: [{
    name: 'isolated-academic-contexts-security',
    generateBundle(_, bundle) {
      const modules = [...this.getModuleIds()]
      if (modules.some(id => /\/node_modules\/(?:firebase|@firebase|@capacitor)\//.test(id))) throw new Error('Forbidden backend/native SDK')
      const audit = new URL('../../.tools/mobile-integration-audit/', import.meta.url)
      fs.mkdirSync(audit, { recursive: true })
      const included = [...new Set(Object.values(bundle).flatMap(chunk => chunk.type === 'chunk' ? Object.keys(chunk.modules) : []))]
      fs.writeFileSync(new URL('modules.json', audit), JSON.stringify({ included }, null, 2))
      this.emitFile({ type: 'asset', fileName: '_headers', source: securityHeaders })
    },
  }],
  build: { outDir: '../../.tools/mobile-integration-dist' },
})
