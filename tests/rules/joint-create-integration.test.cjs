// Identical max-fanout data, but NO candidate Rules overrides: full source only.
const fs = require('node:fs')
let source = fs.readFileSync(require.resolve('./joint-create-budget.test.cjs'), 'utf8')
const start = source.indexOf('const legacyNotice =')
const end = source.indexOf('before(async () =>')
if (start < 0 || end < start) throw Error('Budget test seam changed')
source = source.slice(0, start) + source.slice(end)
new Function('require', source)(require)
