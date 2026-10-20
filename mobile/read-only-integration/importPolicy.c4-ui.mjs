import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { C4_RUNTIME_FILES } from './importPolicy.c4.mjs'
import { contractFiles } from './contractImports.mjs'
const path = relative => fileURLToPath(new URL(relative, import.meta.url)).replaceAll('\\', '/')
const dependencies = path('../../node_modules/')
export const C4_UI_FILES = Object.freeze(['./c4-ui.html', './c4-main.jsx', './C4App.jsx', './C4Subjects.jsx', './C4Home.jsx', './C4Map.jsx', './C4AcademicState.jsx', './c4-ui-model.mjs', './c4-ui.css'].map(path))
export const C4_UI_GRAPH = Object.freeze([...new Set([...C4_RUNTIME_FILES, ...contractFiles, ...C4_UI_FILES,
  ...['academicClient.mjs', 'policy.mjs', 'academicReadAdapter.mjs', 'academicReadRepository.mjs', 'academicQueryController.mjs', 'academicSessionController.mjs', 'useAcademicRead.js'].map(name => path('./' + name))])])
export function assertC4UIModule(id) {
  if (id.startsWith('\0')) return
  const normalized = resolve(id.replaceAll('\\', '/').split('?')[0]).replaceAll('\\', '/')
  if (normalized.startsWith(dependencies) || C4_UI_GRAPH.includes(normalized)) return
  throw Error('C4_UI_OUTSIDE_GRAPH: ' + id)
}
export function assertC4UISource(code, id) {
  assertC4UIModule(id)
  const normalized = id.replaceAll('\\', '/').split('?')[0]
  if (normalized.startsWith(dependencies)) return
  if (/import\.meta\.env|\b(?:localStorage|sessionStorage|indexedDB)\b/.test(code)) throw Error('C4_UI_PERSISTENCE_OR_ENV')
  if (C4_UI_FILES.includes(normalized) && /\b(?:setDoc|updateDoc|deleteDoc|runTransaction|onSnapshot|initializeApp|setInterval|fetch)\s*\(/.test(code)) throw Error('C4_UI_OPERATION_FORBIDDEN')
}
