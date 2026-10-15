// No deployment/network operations. Run after the Vite build and npm audit.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = process.cwd(), output = path.join(root, '.tools/safari-demo-dist')
const hash = data => crypto.createHash('sha256').update(data).digest('hex')
const modules = JSON.parse(await fs.readFile(path.join(output, 'reviewed-modules.json')))
const audit = JSON.parse(await fs.readFile(process.argv[2] || '/tmp/correlativas-safari-audit.json'))
assert.ok(audit.metadata && !audit.error, 'npm audit must complete successfully (advisories are allowed)')
const affected = Object.values(audit.vulnerabilities || {}).filter(v => v.nodes.some(n => modules.some(m => m.startsWith(`${n}/`))))
assert.equal(affected.length, 0, 'Audited vulnerable package included in browser bundle: review before release')
const files = async dir => (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map(async e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]))).flat()
const source = [...new Set([...modules.filter(m => !m.startsWith('\0')), 'package.json', 'package-lock.json', ...(await files(path.join(root, 'mobile/safari-demo'))).map(p => path.relative(root, p)), 'prototypes/mobile-app/vite.config.mjs', 'prototypes/mobile-app/smoke.mjs'])].sort()
const sourceHashes = Object.fromEntries(await Promise.all(source.map(async file => [file, hash(await fs.readFile(path.join(root, file)))])))
const packages = [...new Set(modules.filter(m => m.startsWith('node_modules/')).map(m => {
  const parts = m.slice('node_modules/'.length).split('/'); return parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/')
}))].sort()
const headers = JSON.parse(await fs.readFile('mobile/safari-demo/security-headers.json'))
await fs.writeFile(path.join(output, '_headers'), '/*\n' + Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`).join('\n') + '\n')
await fs.writeFile(path.join(output, 'integrity.json'), JSON.stringify({
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  node: process.version, target: 'safari15.4', sourceHashes,
  browserPackages: Object.fromEntries(await Promise.all(packages.map(async name => [name, JSON.parse(await fs.readFile(`node_modules/${name}/package.json`)).version]))),
  audit: { repository: audit.metadata.vulnerabilities, includedAffectedPackages: affected.map(v => v.name) },
  note: 'sourceCommit identifies the reviewed source commit; sourceHashes verify exact input bytes. Virtual compiler helpers are listed in reviewed-modules.json; lockfile pins compiler dependencies. SHA-256 detects changes, not authorship.'
}, null, 2) + '\n')
const published = (await files(output)).filter(p => path.basename(p) !== 'SHA256SUMS').sort()
for (const file of published) {
  assert.ok(/^(index\.html|_headers|integrity\.json|reviewed-modules\.json|assets\/[\w.-]+\.(js|css|png))$/.test(path.relative(output, file)), `Unexpected publication file: ${file}`)
}
await fs.writeFile(path.join(output, 'SHA256SUMS'), (await Promise.all(published.map(async p => `${hash(await fs.readFile(p))}  ${path.relative(output, p)}`))).join('\n') + '\n')
console.log(JSON.stringify({ output, packages, audit: audit.metadata.vulnerabilities, affectedBrowserPackages: affected, files: published.length }, null, 2))
