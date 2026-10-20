import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const path = relative => fileURLToPath(new URL(relative, import.meta.url)).replaceAll('\\', '/')
// C4.1 has a narrower, independent runtime graph: no Firebase or writer modules.
export const C4_RUNTIME_FILES = Object.freeze([
  './c4.mjs', './catalogRegistry.mjs', './academicViewModel.mjs',
  '../../src/academicOnboardingLogic.js', '../../src/logic.js',
  '../../src/data/utn/sistemas2023.js', '../../src/data/utn/industrial2023.js', '../../src/data/utn/industrial2007.js',
].map(path))
export function assertC4Module(id) {
  if (id.startsWith('\0')) return
  const normalized = resolve(id.replaceAll('\\', '/').split('?')[0]).replaceAll('\\', '/')
  if (!C4_RUNTIME_FILES.includes(normalized)) throw Error('C4_OUTSIDE_READ_ONLY_GRAPH: ' + id)
}
export function assertC4Source(code, id) {
  assertC4Module(id)
  if (/import\.meta\.env|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|\binitializeApp\s*\(/.test(code)) throw Error('C4_ENV_STORAGE_OR_NETWORK')
}
