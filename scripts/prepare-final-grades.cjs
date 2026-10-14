// Additive, local Rules artifacts. Never replaces the deployed/base rulesets.
const fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '..')
const block = `
    // FINAL_GRADES_BEGIN: private records, independent of progress and social DTOs.
    function gradeControlValid(c, uid) {
      return c.keys().hasAll(['schemaVersion', 'generation', 'authority', 'phase', 'origin', 'manifestId', 'updatedAt'])
        && c.keys().hasOnly(['schemaVersion', 'generation', 'authority', 'phase', 'origin', 'manifestId', 'updatedAt'])
        && c.schemaVersion == 1 && c.generation == 'multicareer-v1'
        && c.origin in ['legacy', 'new'] && c.manifestId == uid && c.updatedAt is timestamp;
    }
    function gradeAuthority(uid, model) {
      let c = get(/databases/$(database)/documents/migrationUsers/$(uid));
      return c == null ? model == 'legacy' : (gradeControlValid(c.data, uid)
        && c.data.authority == model && c.data.phase == (model == 'legacy' ? 'pending' : 'complete'));
    }
    function gradeWrite() {
      let d = request.resource.data;
      let old = resource == null ? 0 : resource.data.revision;
      return d.keys().hasAll(['schemaVersion', 'grade', 'revision', 'updatedAt'])
        && d.keys().hasOnly(['schemaVersion', 'grade', 'revision', 'updatedAt'])
        && d.schemaVersion == 1 && (d.grade == null || (d.grade is int && d.grade >= 1 && d.grade <= 10))
        && old is int && old >= 0 && (resource == null || old >= 1)
        && d.revision is int && d.revision == old + 1 && d.revision <= 9007199254740991
        && d.updatedAt == request.time;
    }
    match /users/{uid}/careers/{careerId}/finalGrades/{code} {
      allow get, list: if signedIn() && request.auth.uid == uid;
      allow create, update: if signedIn() && request.auth.uid == uid && gradeAuthority(uid, 'legacy')
        && gradeWrite()
        && existsAfter(/databases/$(database)/documents/users/$(uid)/careers/$(careerId))
        && (request.resource.data.grade == null
          || getAfter(/databases/$(database)/documents/users/$(uid)/careers/$(careerId)).data.statusMap.get(code, null) == 'Aprobada');
      allow delete: if false;
    }
    // Instance permissions are added only to the full artifact; no multicareer rollout here.
    // FINAL_GRADES_END
`
const instances = `
    match /users/{uid}/careerInstances/{instanceId}/finalGrades/{code} {
      function activeGradeInstance() {
        let m = getAfter(/databases/$(database)/documents/users/$(uid)/careerInstances/$(instanceId)).data;
        return m.schemaVersion == 1 && m.lifecycle == 'active'
          && getAfter(/databases/$(database)/documents/users/$(uid)/catalogMemberships/$(m.catalogId)).data.careerInstanceId == instanceId;
      }
      allow get, list: if signedIn() && request.auth.uid == uid;
      allow create, update: if signedIn() && request.auth.uid == uid && gradeAuthority(uid, 'instances')
        && activeGradeInstance() && gradeWrite()
        && existsAfter(/databases/$(database)/documents/users/$(uid)/careerInstances/$(instanceId)/academic/progress)
        && (request.resource.data.grade == null
          || getAfter(/databases/$(database)/documents/users/$(uid)/careerInstances/$(instanceId)/academic/progress).data.statusMap.get(code, null) == 'Aprobada');
      allow delete: if false;
    }
`
function artifacts() {
  return ['hotfix', 'full'].map(base => {
    const original = fs.readFileSync(path.join(root, `rules/legacy-write-revision/${base}-strict.rules`), 'utf8').replace(/\r\n/g, '\n')
    const seam = '  match /databases/{database}/documents {'
    if (original.split(seam).length !== 2) throw Error('Rules seam changed')
    const addition = block + (base === 'full' ? instances : '')
    return { file: `rules/final-grades/${base}-strict.rules`, original, addition, content: original.replace(seam, seam + addition) }
  })
}
if (require.main === module) for (const a of artifacts()) {
  fs.mkdirSync(path.dirname(path.join(root, a.file)), { recursive: true })
  fs.writeFileSync(path.join(root, a.file), a.content)
}
module.exports = { artifacts }
