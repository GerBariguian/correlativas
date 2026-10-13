// Local artifacts only. Original rules and deployment configurations are untouched.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
function render(source, full, strict) {
  const old = full
    ? `      match /careers/{careerId} {\n        allow read: if signedIn() && request.auth.uid == uid;\n        allow write: if signedIn() && request.auth.uid == uid && legacyAuthority(uid);\n      }`
    : `      match /careers/{careerId} {\n        allow read, write: if signedIn() && request.auth.uid == uid;\n      }`
  const owner = `signedIn() && request.auth.uid == uid${full ? ' && legacyAuthority(uid)' : ''}`
  const block = `      match /careers/{careerId} {
        function revisionWrite() {
          let d = request.resource.data;
          let old = resource == null ? {} : resource.data;
          return d.keys().hasAll(['statusMap', 'updatedAt', 'writeRevision'])
            && d.statusMap is map
            && d.statusMap.values().toSet().hasOnly(['Pendiente', 'Cursando', 'Regularizada', 'Aprobada'])
            && d.updatedAt == request.time
            && d.writeRevision is int && d.writeRevision >= 1 && d.writeRevision <= 9007199254740991
            && (!('writeRevision' in old) || (old.writeRevision is int && old.writeRevision >= 1))
            && d.writeRevision == old.get('writeRevision', 0) + 1
            && (resource == null ? d.keys().hasOnly(['statusMap', 'updatedAt', 'writeRevision'])
              : d.diff(old).affectedKeys().hasOnly(['statusMap', 'updatedAt', 'writeRevision']))
            && consentedSnapshot();
        }
        function consentedSnapshot() {
          let consent = getAfter(/databases/$(database)/documents/planningSharing/$(uid));
          return consent == null || consent.data.enabled != true || consent.data.sharedCareerId != careerId
            || (getAfter(/databases/$(database)/documents/planningSnapshots/$(uid)/careers/$(careerId)).data.sourceUpdatedAt == request.time
              && getAfter(/databases/$(database)/documents/planningSnapshots/$(uid)/careers/$(careerId)).data.schemaVersion == consent.data.get('consentVersion', 1));
        }
        allow read: if signedIn() && request.auth.uid == uid;
        allow create, update: if ${owner} && (${strict ? '' : `((resource == null || !('writeRevision' in resource.data)) && !('writeRevision' in request.resource.data)) || `}revisionWrite());
        allow delete: if ${strict ? 'false' : owner + " && !('writeRevision' in resource.data)"};
      }`
  const normalized = source.replace(/\r\n/g, '\n')
  if (normalized.split(old).length !== 2) throw Error('Expected exactly one legacy grant')
  return normalized.replace(old, block)
}
function artifacts() {
  return ['hotfix', 'full'].flatMap(base => ['transition', 'strict'].map(mode => ({
    file: `rules/legacy-write-revision/${base}-${mode}.rules`,
    content: render(fs.readFileSync(path.join(root, base === 'full' ? 'firestore.rules' : 'firestore.migration-users-hotfix.rules'), 'utf8'), base === 'full', mode === 'strict'),
  })))
}
if (require.main === module) for (const a of artifacts()) fs.writeFileSync(path.join(root, a.file), a.content)
module.exports = { artifacts }
