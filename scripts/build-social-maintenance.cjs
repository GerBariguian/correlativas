// A production-mode build with ONLY the social-creation UX paused.
// Uses the same production env loading as the normal build. Never starts a server.
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
const root = resolve(__dirname, '..')
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'),
  'build', '--mode', 'production', '--outDir', '.tools/activity-rollout/web-maintenance'], {
  cwd: root, env: { ...process.env, CORRELATIVAS_SOCIAL_MAINTENANCE: '1' }, stdio: 'inherit', windowsHide: true,
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
