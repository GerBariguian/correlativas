const fs = require('node:fs')
module.exports = sdk => {
  let dependencies = { ...sdk }
  for (const file of ['src/careerInstanceLogic.js', 'src/careerInstancePersistenceLogic.js', 'src/projectionPersistenceLogic.js',
    'src/userDataAuthorityLogic.js', 'src/services/academicBridge.js', 'src/services/careerInstances.js', 'src/services/careerLifecycle.js']) {
    const source = fs.readFileSync(file, 'utf8')
    const exports = [...source.matchAll(/export (?:function|const) (\w+)/g)].map(match => match[1])
    const body = source.replace(/^import .*$/gm, '').replace(/export /g, '')
    Object.assign(dependencies, new Function(...Object.keys(dependencies), `${body}\nreturn {${exports.join(',')}}`)(...Object.values(dependencies)))
  }
  return dependencies
}
