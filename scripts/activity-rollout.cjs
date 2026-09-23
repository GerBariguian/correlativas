// Local artifact preparation only: no Firebase SDK, credentials, CLI or network.
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { resolve, join } = require('node:path')
const { createHash } = require('node:crypto')
const GATE = 'return true; // ACTIVITY_ROLLOUT_GATE'
function maintenanceRules(finalRules) {
  if (finalRules.split(GATE).length !== 2) throw new Error('Expected exactly one enabled rollout gate')
  return finalRules.replace(GATE, 'return false; // ACTIVITY_ROLLOUT_GATE')
}
function artifacts(finalRules, indexes) {
  const parsed = JSON.parse(indexes)
  if (!Array.isArray(parsed.indexes)) throw new Error('Invalid indexes artifact')
  const files = {
    'firestore.final.rules': finalRules,
    'firestore.maintenance.rules': maintenanceRules(finalRules),
    'firestore.indexes.json': indexes,
  }
  for (const state of ['final', 'maintenance']) {
    files[`firebase.${state}.json`] = JSON.stringify({ firestore: {
      rules: `firestore.${state}.rules`, indexes: 'firestore.indexes.json',
    } }, null, 2) + '\n'
  }
  files['manifest.json'] = JSON.stringify(Object.fromEntries(Object.entries(files).map(([name, value]) =>
    [name, createHash('sha256').update(value).digest('hex')])), null, 2) + '\n'
  return files
}
function prepare(check = false) {
  const root = resolve(__dirname, '..'), output = join(root, '.tools', 'activity-rollout')
  const files = artifacts(readFileSync(join(root, 'firestore.rules'), 'utf8'), readFileSync(join(root, 'firestore.indexes.json'), 'utf8'))
  if (!check) mkdirSync(output, { recursive: true })
  for (const [name, value] of Object.entries(files)) {
    const path = join(output, name)
    if (check) {
      if (readFileSync(path, 'utf8') !== value) throw new Error(`Stale rollout artifact: ${name}; regenerate and review`)
    } else writeFileSync(path, value, 'utf8')
  }
  console.log(check ? 'Rollout artifacts match current sources.' : 'Prepared local rollout artifacts in .tools/activity-rollout; nothing published.')
}
if (require.main === module) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Only --check is supported')
  prepare(process.argv.includes('--check'))
}
module.exports = { maintenanceRules, artifacts }
