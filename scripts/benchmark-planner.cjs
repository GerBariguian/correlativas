// Local CPU-only benchmark. No thresholds in functional tests and no files written.
const { performance } = require('node:perf_hooks')
const inspector = require('node:inspector')
const { api } = require('../tests/planner-loader.cjs')({ reference: process.argv.includes('--reference') })
const careers = require('../tests/projection-catalogs.cjs')()
const profile = process.argv.includes('--profile')
const session = new inspector.Session()
const post = (method, args = {}) => new Promise((resolve, reject) => session.post(method, args, (error, result) => error ? reject(error) : resolve(result)))

async function main() {
  if (profile) { session.connect(); await post('Profiler.enable'); await post('Profiler.start') }
  for (const id of ['uade-informatica', 'uade-industrial', 'uca-teologia-sistematica']) {
    const career = careers.find(c => c.id === id)
    const input = { subjects: career.subjects, statusMap: career.initialStatus, selectedCodes: [], targetPeriod: { year: 2027, term: '1C' }, desiredCount: 5 }
    // Warm up, then median of three measurements in the same process.
    api.suggestPlannerSelection(input)
    const times = []
    let result
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      result = api.suggestPlannerSelection(input)
      times.push(performance.now() - start)
    }
    const ms = times.sort((a, b) => a - b)[1]
    console.log(JSON.stringify({ id, candidateCount: result.candidateCount, totalCombinationCount: result.totalCombinationCount,
      method: result.method, evaluatedCount: result.evaluatedCount, medianMs: +ms.toFixed(2), evaluationsPerSecond: Math.round(result.evaluatedCount * 1000 / ms) }))
  }
  if (profile) {
    const { profile: cpu } = await post('Profiler.stop')
    session.disconnect()
    const nodes = new Map(cpu.nodes.map(n => [n.id, n]))
    const parent = new Map(cpu.nodes.flatMap(n => (n.children || []).map(id => [id, n.id])))
    const self = new Map(), inclusive = new Map()
    const label = id => { const f = nodes.get(id).callFrame; return `${f.functionName || '(anonymous)'} (${f.url.split(/[\\/]/).pop()}:${f.lineNumber + 1})` }
    for (let i = 0; i < cpu.samples.length; i++) {
      const time = cpu.timeDeltas[i], id = cpu.samples[i]
      self.set(label(id), (self.get(label(id)) || 0) + time)
      const seen = new Set()
      for (let next = id; next !== undefined; next = parent.get(next)) seen.add(label(next))
      for (const key of seen) inclusive.set(key, (inclusive.get(key) || 0) + time)
    }
    for (const [name, counts] of [['self', self], ['inclusive', inclusive]]) {
      console.log(name, JSON.stringify([...counts].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([fn, us]) => ({ fn, ms: Math.round(us / 1000) }))))
    }
  }
}
main().catch(error => { if (profile) session.disconnect(); console.error(error); process.exitCode = 1 })
