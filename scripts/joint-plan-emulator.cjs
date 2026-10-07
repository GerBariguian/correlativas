// Local administrative transport ONLY. No ADC, .env, project aliases or remote fallback.
const { HOST, PROJECT, encode, decode } = require('./multicareer-emulator.cjs')
function jointPlanEmulator({ host, projectId, environment = process.env } = {}) {
  if (host !== HOST || projectId !== PROJECT || environment.FIRESTORE_EMULATOR_HOST !== HOST
    || ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','RULES_TEST_PROJECT'].some(k => environment[k] && environment[k] !== PROJECT)
    || ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN'].some(k => environment[k])) throw Error('UNSAFE_MIGRATION_ENVIRONMENT')
  const root = `projects/${PROJECT}/databases/(default)/documents`
  async function call(method, body, parent = '') {
    const response = await fetch(`http://${HOST}/v1/${root}${parent ? '/' + parent : ''}:${method}`, {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw Error(response.status === 409 ? 'MIGRATION_CONCURRENT_CONFLICT' : 'EMULATOR_REQUEST_FAILED')
    return response.json()
  }
  return { environment: 'emulator', async transaction(operation, { sourceId, targetId }) {
    if (![sourceId,targetId].every(x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x))) throw Error('INVALID_INPUT')
    const { transaction } = await call('beginTransaction', { options: { readWrite: {} } })
    if (!transaction) throw Error('INCOMPLETE_EMULATOR_RESPONSE')
    try {
      const docs = {}; let now
      function ingest(row) {
        now ??= row.readTime && decode({timestampValue:row.readTime})
        const d = row.found || row.document
        if (d) {
          if (!d.name.startsWith(root + '/')) throw Error('INVALID_DOCUMENT_PATH')
          docs[d.name.slice(root.length+1)] = decode({mapValue:{fields:d.fields||{}}})
          if (Object.keys(docs).length > 1000) throw Error('LOCAL_PLAN_TOO_LARGE')
        }
      }
      async function get(p) {
        const rows = await call('batchGet',{transaction,documents:[root+'/'+p]})
        if (!Array.isArray(rows) || rows.length !== 1 || (rows[0].found?.name || rows[0].missing) !== root+'/'+p) throw Error('INCOMPLETE_EMULATOR_RESPONSE')
        rows.forEach(ingest); return docs[p]
      }
      async function list(p, collectionId) {
        const rows = await call('runQuery',{transaction,structuredQuery:{from:[{collectionId}]}},p)
        if (!Array.isArray(rows) || !rows.length || rows.some(r=>r.error)) throw Error('INCOMPLETE_EMULATOR_RESPONSE')
        rows.forEach(ingest)
      }
      for (const p of [`jointPlans/${sourceId}`,`jointPlans/${targetId}`,`jointPlanLegacyControls/${sourceId}`,
        `jointPlanControls/${targetId}`,`jointPlanTombstones/${sourceId}`,`jointPlanTombstones/${targetId}`]) await get(p)
      for (const id of [sourceId,targetId]) {
        for (const collection of ['subjects','subjectChecks','slots','inviteeIndex','invitationOccurrences']) await list(`jointPlans/${id}`,collection)
        for (const p of Object.keys(docs).filter(p=>p.startsWith(`jointPlans/${id}/subjects/`)&&p.split('/').length===4)) await list(p,'memberEdges')
      }
      const source=docs[`jointPlans/${sourceId}`], catalog=source?.schemaVersion===2?source.catalogId:source?.careerId
      for (const uid of new Set([source?.ownerId,...(Array.isArray(source?.memberIds)?source.memberIds:[])])) {
        if (typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(uid)) continue // validator reports corruption
        await get(`migrationUsers/${uid}`);await get(`migrationManifests/${uid}`)
        await get(`users/${uid}/jointPlanRefs/${targetId}`)
        if (typeof catalog==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(catalog)) {
          const index=await get(`users/${uid}/catalogMemberships/${catalog}`)
          if (typeof index?.careerInstanceId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(index.careerInstanceId)) await get(`users/${uid}/careerInstances/${index.careerInstanceId}`)
        }
      }
      if (!now) throw Error('MISSING_SERVER_TIME')
      const {writes,result}=await operation(docs,now)
      const allowed=p=>p===`jointPlanLegacyControls/${sourceId}`||p===`jointPlanControls/${targetId}`
        ||p===`jointPlans/${targetId}`||new RegExp(`^jointPlans/${targetId}/(slots/slot[1-4]|inviteeIndex/[A-Za-z0-9_-]+)$`).test(p)
        ||new RegExp(`^users/[A-Za-z0-9_-]+/jointPlanRefs/${targetId}$`).test(p)
      if(Object.keys(writes).some(p=>!allowed(p)))throw Error('UNSAFE_MIGRATION_WRITE')
      await call('commit',{transaction,writes:Object.entries(writes).map(([p,d])=>({update:{name:root+'/'+p,fields:encode(d).mapValue.fields}}))})
      return result
    } catch(e){await call('rollback',{transaction}).catch(()=>{});throw e}
  }}
}
module.exports={jointPlanEmulator}
