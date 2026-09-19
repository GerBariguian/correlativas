'use strict'

// No Firebase SDK/configuration discovery. Only these two read RPCs are reachable.
const ORIGIN = 'https://firestore.googleapis.com'
const METHODS = new Set(['runQuery', 'batchGet'])
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024
const timestamp = value => typeof value === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value))
function ensure(condition) { if (!condition) throw new Error('INVALID_RESPONSE') }
function onlyKeys(value, keys) {
  ensure(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key)))
}
function redact(value, token) {
  if (typeof value === 'string') return value.split(token).join('[REDACTED]')
  if (Array.isArray(value)) return value.map(item => redact(item, token))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, token)]))
  return value
}

function createTransport({ projectId, databaseId, token, origin = ORIGIN, fetchImpl = globalThis.fetch }) {
  if (origin !== ORIGIN) throw new Error('INVALID_HOST')
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId || '')) throw new Error('INVALID_PROJECT_ID')
  if (!/^(?:\(default\)|[a-z][a-z0-9-]{2,61}[a-z0-9])$/.test(databaseId || '')) throw new Error('INVALID_DATABASE_ID')
  if (typeof token !== 'string' || !token || /\s/.test(token) || token.length > 16384) throw new Error('INVALID_TOKEN')
  const root = `projects/${projectId}/databases/${databaseId}/documents`
  return { root, async read(method, body) {
    if (!METHODS.has(method)) throw new Error('INVALID_METHOD')
    // Keep the deadline active through body consumption, not just response headers.
    const response = await fetchImpl(`${ORIGIN}/v1/${root}:${method}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    ensure(response.status === 200)
    ensure(!response.redirected && (!response.url || response.url === `${ORIGIN}/v1/${root}:${method}`))
    const reader = response.body.getReader()
    const chunks = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        ensure(size <= MAX_RESPONSE_BYTES)
        chunks.push(Buffer.from(value))
      }
    } catch {
      await reader.cancel().catch(() => {})
      throw new Error('RESPONSE_INCOMPLETE')
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    ensure(Array.isArray(result) && result.length > 0)
    return result
  } }
}

function query(collectionId, allDescendants, readTime, probe = false) {
  return { structuredQuery: {
    select: { fields: [{ fieldPath: '__name__' }] },
    from: [{ collectionId, allDescendants }],
    ...(probe ? { limit: 1 } : {}),
  }, ...(readTime ? { readTime } : {}) }
}

async function audit(options = {}) {
  const { projectId, databaseId, token } = options
  const report = { projectId: projectId ?? null, databaseId: databaseId ?? null, readTime: null,
    scanComplete: false, subjectsEnRutaObjetivo: 0, subjectsFueraDeAlcance: 0,
    padresUnicos: 0, padresComprobados: 0, padresSinResolver: 0, planesHuerfanos: 0,
    subjectsHuerfanos: 0, tombstonesExistentes: 0, errores: [], resultado: 'C', huerfanos: [] }
  const parents = new Map(), checked = new Set(), missing = new Set(), tombstones = new Set()
  let stage = 'configuration', tombstonesComplete = false
  try {
    const transport = createTransport(options)
    const pathOf = name => {
      ensure(typeof name === 'string' && name.startsWith(`${transport.root}/`))
      const parts = name.slice(transport.root.length + 1).split('/')
      ensure(parts.length % 2 === 0 && parts.every(p => p && p !== '.' && p !== '..'))
      return parts
    }
    const readQuery = async (body, expectedTime) => {
      const rows = await transport.read('runQuery', body)
      const names = [], seen = new Set()
      for (const row of rows) {
        onlyKeys(row, ['document', 'readTime', 'skippedResults', 'done'])
        ensure(row && typeof row === 'object' && !row.error && !row.transaction
          && !row.skippedResults && row.done !== false && timestamp(row.readTime))
        ensure(row.done === undefined || (row.done === true && row === rows.at(-1)))
        if (expectedTime) ensure(row.readTime === expectedTime)
        if (row.document) {
          onlyKeys(row.document, ['name', 'createTime', 'updateTime', 'fields'])
          ensure(!row.document.fields || Object.keys(row.document.fields).length === 0)
          pathOf(row.document.name)
          ensure(!seen.has(row.document.name))
          seen.add(row.document.name); names.push(row.document.name)
        }
      }
      return { names, time: rows.at(-1).readTime }
    }
    stage = 'readTime'
    const probe = await readQuery(query('subjects', true, null, true))
    ensure(probe.names.length <= 1)
    report.readTime = probe.time
    stage = 'subjects'
    const subjects = await readQuery(query('subjects', true, report.readTime), report.readTime)
    for (const name of subjects.names) {
      const parts = pathOf(name)
      ensure(parts.at(-2) === 'subjects')
      if (parts.length !== 4 || parts[0] !== 'jointPlans') { report.subjectsFueraDeAlcance++; continue }
      const parent = `${transport.root}/jointPlans/${parts[1]}`
      if (!parents.has(parent)) parents.set(parent, [])
      parents.get(parent).push(parts.join('/'))
      report.subjectsEnRutaObjetivo++
    }
    stage = 'parents'
    const parentNames = [...parents.keys()]
    for (let i = 0; i < parentNames.length; i += 100) {
      const documents = parentNames.slice(i, i + 100), received = new Set()
      const rows = await transport.read('batchGet', { documents, mask: { fieldPaths: [] }, readTime: report.readTime })
      for (const row of rows) {
        onlyKeys(row, ['found', 'missing', 'readTime'])
        ensure(row && !row.error && !row.transaction && row.readTime === report.readTime)
        ensure(Boolean(row.found) !== Boolean(row.missing))
        const name = row.found?.name || row.missing
        if (row.found) onlyKeys(row.found, ['name', 'createTime', 'updateTime', 'fields'])
        pathOf(name)
        ensure(documents.includes(name) && !received.has(name))
        ensure(!row.found?.fields || Object.keys(row.found.fields).length === 0)
        received.add(name)
        checked.add(name)
        if (row.missing) missing.add(name)
      }
      ensure(received.size === documents.length)
    }
    stage = 'tombstones'
    const result = await readQuery(query('jointPlanTombstones', false, report.readTime), report.readTime)
    for (const name of result.names) {
      const parts = pathOf(name)
      ensure(parts.length === 2 && parts[0] === 'jointPlanTombstones')
      tombstones.add(parts[1])
    }
    tombstonesComplete = true
    report.scanComplete = true
    report.resultado = missing.size ? 'B' : 'A'
  } catch {
    // Never serialize exception messages, response bodies, headers, or credentials.
    report.errores.push({ etapa: stage, codigo: 'AUDITORIA_INCOMPLETA' })
  }
  report.padresUnicos = parents.size
  report.padresComprobados = checked.size
  report.padresSinResolver = parents.size - checked.size
  report.planesHuerfanos = missing.size
  report.tombstonesExistentes = tombstones.size
  for (const parent of [...missing].sort()) {
    const planId = parent.split('/').at(-1), subjectPaths = parents.get(parent).sort()
    report.subjectsHuerfanos += subjectPaths.length
    report.huerfanos.push({ planId, parentPath: `jointPlans/${planId}`, parentExistsAtT: false,
      subjectCount: subjectPaths.length, subjectPaths,
      tombstoneExistsAtT: tombstonesComplete ? tombstones.has(planId) : null })
  }
  // Defense in depth, including malicious paths that echo the supplied secret.
  return typeof token === 'string' && token ? redact(report, token) : report
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 5 || args[0] !== '--project-id' || args[2] !== '--database-id' || args[4] !== '--token-stdin' || process.stdin.isTTY) {
    process.stderr.write('Uso: node scripts/audit-orphan-subjects.cjs --project-id PROJECT_ID --database-id DATABASE_ID --token-stdin\n')
    process.exitCode = 2
    return
  }
  let token = ''
  for await (const chunk of process.stdin) {
    token += chunk
    if (token.length > 16384) throw new Error('INVALID_INPUT')
  }
  const report = await audit({ projectId: args[1], databaseId: args[3], token: token.trim() })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = report.resultado === 'A' ? 0 : report.resultado === 'B' ? 1 : 2
}
if (require.main === module) main().catch(() => {
  process.stderr.write('Entrada invalida; auditoria no completada (C).\n')
  process.exitCode = 2
})
module.exports = { audit, createTransport }
