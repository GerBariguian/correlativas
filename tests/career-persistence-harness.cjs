const fs = require('node:fs')
const path = require('node:path')
module.exports = function load(sdk = {}) {
  const source = ['src/careerInstanceLogic.js', 'src/careerInstancePersistenceLogic.js', 'src/services/careerInstances.js']
    .map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
      .replace(/^import .*\r?\n/gm, '').replace(/export /g, '')).join('\n')
  return new Function('sdk', `const {${Object.keys(sdk).join(',')}} = sdk;\n${source}\nreturn {careerInstancesRepository,decodeCareerMetadata,decodeCatalogMembership,mapCareerPersistenceError};`)(sdk)
}
