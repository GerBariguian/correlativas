const fs = require('node:fs')
module.exports = (sdk = {}) => {
  const api = { ...sdk }
  for (const file of ['src/finalGradeLogic.js', 'src/userDataAuthorityLogic.js', 'src/services/finalGrades.js']) {
    const source = fs.readFileSync(file, 'utf8')
    const names = [...source.matchAll(/export function (\w+)/g)].map(m => m[1])
    Object.assign(api, new Function(...Object.keys(api), source.replace(/^import .*$/gm, '').replace(/export /g, '') + `;return {${names.join(',')}}`)(...Object.values(api)))
  }
  return api
}
