'use strict'
const { spawnSync } = require('node:child_process')
const { resolve, join } = require('node:path')
const { cleanEnvironment } = require('../emulator-lab/policy.cjs')
const env = cleanEnvironment()
env.NODE_OPTIONS = '--require=' + JSON.stringify(join(__dirname, 'integration-network.cjs').replaceAll('\\', '/'))
const result = spawnSync(process.execPath, ['--test', '--test-force-exit', join(__dirname, 'c4.emulator.integration.test.mjs')], {
  cwd: resolve(__dirname, '../..'), env, stdio: 'inherit', windowsHide: true, timeout: 60000,
})
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 1
