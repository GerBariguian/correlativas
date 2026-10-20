import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { C4_RUNTIME_FILES, assertC4Module, assertC4Source } from './importPolicy.c4.mjs'
import { assertModule as assertPrevious } from './importPolicy.mjs'

test('C4 allows exactly three audited catalogs; C1–C3 keep rejecting them', () => {
  const catalogs = C4_RUNTIME_FILES.filter(f => f.includes('/src/data/'))
  assert.equal(catalogs.length, 3)
  for (const id of catalogs) { assertC4Module(id); assert.throws(() => assertPrevious(id), /OUTSIDE/) }
})
test('C4 rejects product initialization, writers, other catalogs and dependency SDKs', () => {
  for (const relative of ['../../src/App.jsx', '../../src/firebase.js', '../../src/hooks/useAcademicBridge.js', '../../src/services/academicBridge.js', '../../src/data/careers.js', '../../src/data/uade/informatica.js', './academicClient.mjs', '../../node_modules/firebase/app/dist/index.mjs']) {
    assert.throws(() => assertC4Module(new URL(relative, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), /OUTSIDE/)
  }
})
test('entire C4.1 runtime graph is local, audited and has no network or persistence', () => {
  for (const id of C4_RUNTIME_FILES) {
    const source = readFileSync(id, 'utf8'); assertC4Source(source, id)
    assert.doesNotMatch(source, /\bimport\s*\(|\brequire\s*\(|\b(?:setDoc|updateDoc|deleteDoc|runTransaction|onSnapshot)\s*\(/)
    for (const [, specifier] of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      assert.ok(specifier.startsWith('.'), specifier)
      assertC4Module(new URL(specifier, pathToFileURL(id)).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    }
  }
})
