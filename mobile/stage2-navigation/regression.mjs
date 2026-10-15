// Reuse the frozen suite without modifying its file or the approved demos.
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root = fileURLToPath(new URL('../..', import.meta.url))
let suite = await fs.readFile(`${root}/prototypes/mobile-app/smoke.mjs`, 'utf8')
suite = suite.replace("const root = fileURLToPath(new URL('../..', import.meta.url))", `const root = ${JSON.stringify(root)}`)
assert.equal(suite.split("await call('Page.reload')").length, 2, 'Review adapter when frozen suite changes')
// The old demo always reloads Inicio. This app preserves its page hash, so
// explicitly return home before checking fixture reset on reload.
suite = suite.replace("await call('Page.reload')", "await nav('Inicio')\n  await call('Page.reload')")
const child = spawn(process.execPath, ['--input-type=module', '--eval', suite], {
  cwd: root, stdio: 'inherit', env: { ...process.env, DEMO_VITE_CONFIG: 'mobile/stage2-navigation/vite.config.mjs' },
})
child.on('exit', code => { process.exitCode = code ?? 1 })
