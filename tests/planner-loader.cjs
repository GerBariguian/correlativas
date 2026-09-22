const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// Separate module scopes without a bundler or a dependency on React/Firebase.
module.exports = function loadPlanner({ reference = false, trace = false } = {}) {
  const context = vm.createContext({ structuredClone })
  const evaluated = []
  for (const file of ['logic.js', 'plannerLogic.js', 'plannerSuggestions.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    const names = [...source.matchAll(/export (?:function|const) (\w+)/g)].map(m => m[1])
    vm.runInContext(`(() => { ${source.replace(/^import .*\r?\n/gm, '').replace(/export /g, '')}\nObject.assign(globalThis, {${names.join(',')}}) })()`, context, { filename: file })
    if (file === 'plannerLogic.js' && reference) {
      context.preparePlannerEvaluationContext = args => args
      context.evaluatePreparedPlannerSelection = (ctx, selectedCodes) => context.evaluatePlannerSelection({ ...ctx, selectedCodes })
    }
    if (file === 'plannerLogic.js' && trace) {
      const original = context.evaluatePreparedPlannerSelection
      context.evaluatePreparedPlannerSelection = (ctx, codes) => { evaluated.push([...codes]); return original(ctx, codes) }
    }
  }
  return { api: context, evaluated }
}
