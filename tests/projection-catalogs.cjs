const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// Load the actual app registry and its imports, without Firebase or a bundler.
module.exports = function loadProjectionCatalogs() {
  const root = path.join(__dirname, '../src/data')
  const context = vm.createContext({})
  const source = fs.readFileSync(path.join(root, 'careers.js'), 'utf8')
    .replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g, (_, bindings, relative) => {
      const catalog = vm.createContext({})
      vm.runInContext(fs.readFileSync(path.join(root, `${relative}.js`), 'utf8').replace(/export const /g, 'var '), catalog)
      for (const binding of bindings.split(',').map(s => s.trim()).filter(Boolean)) {
        const [exported, local] = binding.split(/\s+as\s+/)
        context[local || exported] = catalog[exported]
      }
      return ''
    }).replace(/export const /g, 'var ')
  vm.runInContext(source, context)
  return JSON.parse(JSON.stringify(context.careers))
}
