// Same adversarial/recovery corpus, but exclusively the actual repository Rules.
const fs = require('node:fs')
let source = fs.readFileSync(require.resolve('./joint-create-distributed.test.cjs'), 'utf8')
if (!source.includes("['current', 'distributed']") || !source.includes('distributed(original)')) throw Error('Create corpus seam changed')
source = source.replace('tests/rules/fixtures/joint-create-pre-distribution.rules', 'firestore.rules')
  .replace("['current', 'distributed']", "['integrated']")
  .replaceAll('distributed(original)', 'original')
new Function('require', source)(require)
