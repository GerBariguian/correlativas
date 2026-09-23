const fs = require('node:fs')
const source = files => files.map(file => fs.readFileSync(file, 'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export /g, '')).join('\n')
module.exports = {
  loadRepository(sdk, db, auth) {
    return new Function('sdk','db','auth','const {'+Object.keys(sdk).join(',')+'}=sdk;\n'+source(['src/activityLogic.js','src/services/activity.js'])+'\nreturn {activityRepository,activityNow}')(sdk,db,auth)
  },
  loadSession() { return new Function(source(['src/activityLogic.js','src/activitySession.js'])+'\nreturn {createActivitySession,normalizeActivityItem} ')() },
}
