// Only this demo project and the local Firestore emulator are allowed.
const { spawn, spawnSync } = require('node:child_process')
const { readFileSync, readdirSync, existsSync } = require('node:fs')
const { resolve, join, delimiter } = require('node:path')
const { createHash } = require('node:crypto')
const root = resolve(__dirname, '..')
const project = 'demo-correlativas-rules'
const host = '127.0.0.1:8088'
if (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== host) {
  throw new Error(`Refusing unexpected FIRESTORE_EMULATOR_HOST; expected ${host}`)
}
const config = JSON.parse(readFileSync(join(root, 'firebase.rules-test.json')))
if (config.firestore.rules !== 'firestore.rules' || config.emulators.firestore.host !== '127.0.0.1'
  || config.emulators.firestore.port !== 8088 || config.emulators.ui.enabled !== false
  || Object.keys(config.emulators).some(k => !['firestore', 'ui', 'singleProjectMode'].includes(k))) {
  throw new Error('Unsafe emulator configuration')
}
const env = { ...process.env, CI: 'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' }
for (const key of Object.keys(env)) {
  if (key.startsWith('VITE_') || ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'GOOGLE_CLOUD_PROJECT',
    'GCLOUD_PROJECT', 'FIREBASE_CONFIG', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_PROJECT', 'DEBUG'].includes(key)) delete env[key]
}
env.GCLOUD_PROJECT = project
env.GOOGLE_CLOUD_PROJECT = project
env.RULES_TEST_PROJECT = project
// Optional portable Java runtime; no system installation or PATH modification.
const toolsDir = join(root, '.tools')
env.FIREBASE_EMULATORS_PATH = join(toolsDir, 'firebase-emulators')
const javaName = process.platform === 'win32' ? 'java.exe' : 'java'
const portable = existsSync(toolsDir) && readdirSync(toolsDir).map(name => join(toolsDir, name, 'bin'))
  .find(dir => existsSync(join(dir, javaName)))
const javaBin = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin') : portable
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH'
if (javaBin) env[pathKey] = javaBin + delimiter + (env[pathKey] || '')
const java = spawnSync('java', ['-version'], { env, encoding: 'utf8', windowsHide: true })
if (java.error || java.status !== 0) throw new Error(`Cannot execute Java (${java.error?.code || java.status}). Java 21+ and permission to spawn processes are required. Set JAVA_HOME or put a portable runtime in .tools/<runtime>/bin.`)
console.log(`Rules tests: ${project}, ${host}; ${java.stderr.trim().split('\n')[0]}`)
console.log('firestore.rules SHA256:', createHash('sha256').update(readFileSync(join(root, 'firestore.rules'))).digest('hex'))
const cli = require.resolve('firebase-tools/lib/bin/firebase.js')
const child = spawn(process.execPath, [cli, 'emulators:exec', '--only', 'firestore', '--project', project,
  '--config', 'firebase.rules-test.json', '--non-interactive',
  'node --test --test-concurrency=1 --test-timeout=120000 tests/rules/firestore.test.cjs'],
{ cwd: root, env, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
