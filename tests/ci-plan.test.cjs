const { test } = require('node:test')
const assert = require('node:assert/strict')
const { classify, gate } = require('../scripts/ci-plan.cjs')
test('docs skip Rules; manual dispatch always runs both', () => {
  assert.deepEqual(classify(['docs/guide.md']), { stage6: false, hotfix: false })
  assert.deepEqual(classify([], true), { stage6: true, hotfix: true })
})
test('conservative dependency filters', () => {
  for (const p of ['src/services/academicBridge.js', 'tests/rules/helpers.cjs', 'scripts/ci-plan.cjs', 'package-lock.json', '.gitattributes', '.github/workflows/ci.yml'])
    assert.deepEqual(classify([p]), { stage6: true, hotfix: true })
  assert.deepEqual(classify(['firestore.rules']), { stage6: true, hotfix: false })
  assert.deepEqual(classify(['firestore.migration-users-hotfix.rules']), { stage6: true, hotfix: true })
})
const needs = (required = 'true') => ({ changes: { result: 'success', outputs: { stage6: required, hotfix: required } },
  'node-build': { result: 'success' }, 'rules-stage6': { result: 'success' }, 'rules-hotfix': { result: 'success' } })
test('gate accepts success and intentional skips', () => {
  gate(needs()); const n = needs('false'); n['rules-stage6'].result = n['rules-hotfix'].result = 'skipped'; gate(n)
})
test('gate rejects failure, cancellation and unexpected skips', () => {
  for (const job of ['changes', 'node-build', 'rules-stage6', 'rules-hotfix']) for (const result of ['failure', 'cancelled', 'skipped']) {
    const n = needs(); n[job].result = result; assert.throws(() => gate(n))
  }
  const n = needs(); delete n.changes.outputs.hotfix; assert.throws(() => gate(n))
})

test('real Git PR merge-base excludes base-only changes; dispatch covers main and branch', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
  const { execFileSync } = require('node:child_process')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'correlativas-ci-plan-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commit = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), content)
    git('add', '--', file); git('commit', '-m', 'fixture')
    return git('rev-parse', 'HEAD')
  }
  git('init', '-b', 'main'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'fixture@example.invalid')
  const root = commit('README.md', 'base\n')
  git('checkout', '-b', 'feature')
  const head = commit('docs/change.md', 'docs\n')
  git('checkout', 'main')
  const baseTip = commit('src/base-only.js', '// base only\n')
  git('update-ref', 'refs/remotes/origin/main', baseTip)
  function run(eventName, sha) {
    const event = path.join(dir, 'event.json'), output = path.join(dir, 'output.txt')
    fs.writeFileSync(event, JSON.stringify({ pull_request: { head: { sha: head }, base: { sha: baseTip } } }))
    fs.writeFileSync(output, '')
    return JSON.parse(execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/ci-plan.cjs')], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_SHA: sha,
        GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output },
    }))
  }
  const pr = run('pull_request', head)
  assert.equal(pr.base, root); assert.equal(pr.head, head)
  assert.deepEqual(pr.paths, ['docs/change.md']); assert.equal(pr.stage6, false); assert.equal(pr.hotfix, false)
  const branch = run('workflow_dispatch', head)
  assert.equal(branch.base, root); assert.equal(branch.stage6, true); assert.equal(branch.hotfix, true)
  const main = run('workflow_dispatch', baseTip)
  assert.equal(main.base, root); assert.deepEqual(main.paths, ['src/base-only.js'])
})
