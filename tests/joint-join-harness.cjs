const fs = require('node:fs')
const dependencies = ['src/careerInstanceLogic.js', 'src/careerInstancePersistenceLogic.js', 'src/userDataAuthorityLogic.js', 'src/jointJoinLogic.js', 'src/services/jointJoin.js']
function load(sdk, db, auth) {
  const source = [...dependencies, 'src/jointPlanLogic.js', 'src/services/jointPlans.js'].map(f => fs.readFileSync(f, 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/export /g, '')).join('\n')
  return new Function('sdk', 'db', 'auth', `const {${Object.keys(sdk).join(',')}}=sdk;\n${source}\nreturn {updatePlanMembership,compatibleJoinAdvance,buildJointJoin}`)(sdk, db, auth)
}
module.exports = { dependencies, load }
