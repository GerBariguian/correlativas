import './test-source-loader.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { useAcademicRead } from './useAcademicRead.js'
// Real React server rendering only: this does not run effects or exercise a browser.
test('hook renders safe initial states under React SSR without initiating reads', () => {
  const scope = { uid: 'lab-instances', model: 'instances', id: 'lab-systems', catalogId: 'utn-sistemas-2023' }
  let reads = 0
  const connection = { id: {}, isCurrent: () => true, readProgress() { reads++ } }
  function Probe({ input, conn }) { const result = useAcademicRead(conn, input); assert.equal(Object.hasOwn(result, 'progress'), false); return React.createElement('span', null, result.state) }
  assert.match(renderToString(React.createElement(Probe, { input: scope, conn: connection })), /loading/)
  assert.match(renderToString(React.createElement(Probe, { input: scope, conn: null })), /idle/)
  assert.match(renderToString(React.createElement(Probe, { input: {}, conn: connection })), /error/)
  assert.equal(reads, 0)
})

import { readFileSync } from 'node:fs'
import { assertModule } from './importPolicy.mjs'
test('C3 runtime imports stay within the audited boundary and expose no Firebase listeners or persistence', () => {
  for (const name of ['academicQueryController.mjs', 'academicSessionController.mjs', 'useAcademicRead.js', 'c3.mjs']) {
    const url = new URL(name, import.meta.url), source = readFileSync(url, 'utf8')
    assertModule(decodeURIComponent(url.pathname.replace(/^\/([A-Za-z]:)/, '$1')))
    assert.doesNotMatch(source, /from\s+['"]firebase|onSnapshot|setInterval|setTimeout|localStorage|sessionStorage|indexedDB|initializeApp|import\.meta\.env/)
    for (const [, specifier] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (specifier === 'react') continue
      assertModule(decodeURIComponent(new URL(specifier, url).pathname.replace(/^\/([A-Za-z]:)/, '$1')))
    }
  }
})
