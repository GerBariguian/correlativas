const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const gitRaw = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const git = (...args) => gitRaw(...args).trim()
function classify(paths, manual = false) {
  const common = p => /^(package(-lock)?\.json|\.gitattributes|\.nvmrc)$/.test(p) || p.startsWith('.github/')
  return {
    stage6: manual || paths.some(p => common(p) || /^(src\/|tests\/|scripts\/|firebase.*\.json$|firestore.*\.(rules|json)$)/.test(p)),
    hotfix: manual || paths.some(p => common(p) || /^(src\/|tests\/|scripts\/)/.test(p)
      || /^(firebase\.migration-users-hotfix-test\.json|firestore\.migration-users-hotfix\.rules)$/.test(p)),
  }
}
function gate(needs) {
  if (needs.changes?.result !== 'success' || needs['node-build']?.result !== 'success') throw Error('Required changes/node-build job did not succeed')
  for (const [flag, job] of [['stage6', 'rules-stage6'], ['hotfix', 'rules-hotfix']]) {
    const value = needs.changes.outputs?.[flag]
    if (!['true', 'false'].includes(value)) throw Error(`Invalid output: ${flag}`)
    const result = needs[job]?.result
    if (value === 'true' ? result !== 'success' : !['success', 'skipped'].includes(result)) throw Error(`Unacceptable result: ${job}=${result}`)
  }
}
if (require.main === module) {
  if (process.argv[2] === 'gate') {
    gate(JSON.parse(process.env.CI_NEEDS)); console.log('All required checks succeeded')
  } else {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    if (!manual && process.env.GITHUB_EVENT_NAME !== 'pull_request') throw Error('Unsupported event')
    const head = manual ? process.env.GITHUB_SHA : event.pull_request.head.sha
    const baseTip = manual ? git('rev-parse', 'refs/remotes/origin/main') : event.pull_request.base.sha
    for (const sha of [head, baseTip]) if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Invalid commit SHA')
    // Manual dispatch on main checks the last commit; on a branch checks its main merge-base.
    const base = manual && head === baseTip ? git('rev-parse', `${head}^`) : git('merge-base', baseTip, head)
    const paths = gitRaw('diff', '--name-only', '--no-renames', '-z', base, head).split('\0').filter(Boolean)
    const flags = classify(paths, manual)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `base=${base}\nhead=${head}\nstage6=${flags.stage6}\nhotfix=${flags.hotfix}\n`)
    console.log(JSON.stringify({ base, head, ...flags, paths }, null, 2))
  }
}
module.exports = { classify, gate }
