// Test double only. Existing repository closures execute unchanged against snapshots.
export const documents = new Map()
export const reads = []
export function doc(_db, ...parts) { return parts.join('/') }
export function collection() { throw Error('UNEXPECTED_COLLECTION') }
export async function getDocFromServer(path) {
  reads.push(path)
  const value = documents.get(path)
  if (value instanceof Error) throw value
  return { exists: () => documents.has(path), data: () => value }
}
export function onSnapshot() { throw Error('UNEXPECTED_SUBSCRIPTION') }
export function runTransaction() { throw Error('WRITE_FORBIDDEN') }
export function serverTimestamp() { throw Error('WRITE_FORBIDDEN') }
