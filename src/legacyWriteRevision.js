// Missing means not enrolled yet; an invalid present value never means zero.
export function legacyWriteRevision(data) {
  if (!data || !Object.hasOwn(data, 'writeRevision')) return 0
  if (!Number.isSafeInteger(data.writeRevision) || data.writeRevision < 1) throw new Error('INVALID_LEGACY_WRITE_REVISION')
  return data.writeRevision
}
export function nextLegacyWriteRevision(data) {
  const revision = legacyWriteRevision(data)
  if (revision === Number.MAX_SAFE_INTEGER) throw new Error('LEGACY_WRITE_REVISION_EXHAUSTED')
  return revision + 1
}
