// Diagnostic only: loads an isolated Rules fixture, never product authorization.
// The reduced-check control proves a budget boundary; it is NOT a proposed policy.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { doc, setDoc, getDocFromServer } = require('firebase/firestore')
const { initialize, seed, claims, TIME, assertSucceeds, assertFails } = require('./helpers.cjs')

const source = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8')
const authority = source.slice(source.indexOf('    function validAuthority('), source.indexOf('    function metadataWritable('))
const ids = ['owner', 'one', 'two', 'three', 'four']
function fixture(reducedControl = false, minimalAuthority = false) {
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    ${minimalAuthority ? `function instanceAuthority(uid) {
      return get(/databases/$(database)/documents/migrationUsers/$(uid)).data.authority == 'instances';
    }` : authority}
    function operational(p, uid) {
      let binding = p.participants[uid];
      let instance = get(/databases/$(database)/documents/users/$(uid)/careerInstances/$(binding.careerInstanceId)).data;
      return ${reducedControl ? "(uid == 'owner' || instanceAuthority(uid))" : 'instanceAuthority(uid)'}
        && binding.bindingState == 'resolved'
        && instance.catalogId == p.catalogId && instance.lifecycle == 'active';
    }
    function at(p, proposed, index) {
      return proposed.size() <= index || proposed[index] == request.auth.uid
        || operational(p, proposed[index]);
    }
    match /jointPlans/{planId}/subjects/{code} {
      function permitted() {
        let p = get(/databases/$(database)/documents/jointPlans/$(planId)).data;
        let ids = request.resource.data.proposedParticipantIds;
        return request.auth != null && request.auth.uid in p.memberIds
          && !p.closed && !p.deleting && operational(p, request.auth.uid)
          && ids.size() >= 2 && ids.size() <= 5 && ids.toSet().size() == ids.size()
          && p.memberIds.hasAll(ids)
          && at(p, ids, 0) && at(p, ids, 1) && at(p, ids, 2)
          && at(p, ids, 3) && at(p, ids, 4);
      }
      allow create: if permitted();
    }
  }
}`
}
async function run(reducedControl, check, patch = {}, minimalAuthority = false) {
  const env = await initialize(fixture(reducedControl, minimalAuthority))
  try {
    await env.clearFirestore()
    const entries = { 'jointPlans/budget': { catalogId: 'catalog', memberIds: ids,
      closed: false, deleting: false, participants: Object.fromEntries(ids.map(uid => [uid,
        { careerInstanceId: `instance_${uid}`, bindingState: 'resolved' }])) } }
    for (const uid of ids) {
      entries[`migrationUsers/${uid}`] = { schemaVersion: 1, generation: 'multicareer-v1',
        authority: 'instances', phase: 'complete', origin: 'legacy', manifestId: uid, updatedAt: TIME }
      entries[`users/${uid}/careerInstances/instance_${uid}`] = { catalogId: 'catalog', lifecycle: 'active' }
    }
    Object.assign(entries, patch)
    await seed(env, entries)
    const client = env.authenticatedContext('owner', claims('owner')).firestore()
    await check(client, env)
  } finally { await env.cleanup() }
}
const write = (client, participants) => setDoc(doc(client, 'jointPlans/budget/subjects/A'), {
  code: 'A', proposedParticipantIds: participants,
})

test('budget probe: actor included + three others succeeds (nine distinct documents)', async () => {
  await run(false, client => assertSucceeds(write(client, ids.slice(0, 4))))
})
test('budget probe: actor + four others is denied (eleven distinct documents), no partial subject', async () => {
  await run(false, async (client, env) => {
    await assertFails(write(client, ids))
    await env.withSecurityRulesDisabled(async context => {
      assert.equal((await getDocFromServer(doc(context.firestore(), 'jointPlans/budget/subjects/A'))).exists(), false)
    })
  })
})
test('diagnostic control ONLY: removing one authority lookup permits five (ten documents)', async () => {
  await run(true, client => assertSucceeds(write(client, ids)))
})
test('budget probe: four targets excluding actor also denied (eleven documents)', async () => {
  await run(false, client => assertFails(write(client, ids.slice(1))))
})
test('budget probe: archived target denied below budget', async () => {
  await run(false, client => assertFails(write(client, ids.slice(0, 2))), {
    'users/one/careerInstances/instance_one': { catalogId: 'catalog', lifecycle: 'archived' },
  })
})
test('budget probe: frozen target denied below budget', async () => {
  await run(false, client => assertFails(write(client, ids.slice(0, 2))), {
    'migrationUsers/one': { schemaVersion: 1, generation: 'multicareer-v1', authority: 'frozen',
      phase: 'copying', origin: 'legacy', manifestId: 'one', updatedAt: TIME },
  })
})
test('diagnostic control ONLY: minimal authority expression still denies eleven documents', async () => {
  await run(false, client => assertFails(write(client, ids)), {}, true)
})
test('diagnostic control ONLY: minimal authority expression allows ten documents', async () => {
  await run(true, client => assertSucceeds(write(client, ids)), {}, true)
})
