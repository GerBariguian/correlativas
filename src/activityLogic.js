// Platform-neutral activity v1. Timestamp sentinels are supplied by the adapter.
export const ACTIVITY_SCHEMA = 1
export const ACTIVITY_TYPES = Object.freeze(['FRIEND_REQUEST_RECEIVED', 'FRIEND_REQUEST_ACCEPTED', 'JOINT_PLAN_INVITATION'])
const prefixes = Object.freeze({ FRIEND_REQUEST_RECEIVED: 'fr_', FRIEND_REQUEST_ACCEPTED: 'fa_', JOINT_PLAN_INVITATION: 'jp_' })
export function activityTarget(type, id) {
  if (!ACTIVITY_TYPES.includes(type) || typeof id !== 'string') throw new Error('INVALID_ACTIVITY_TARGET')
  const plan = type === 'JOINT_PLAN_INVITATION'
  if (!(plan ? /^[A-Za-z0-9_-]{1,100}$/.test(id) : /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(id) && id.length <= 257)) throw new Error('INVALID_ACTIVITY_TARGET')
  return { kind: plan ? 'jointPlan' : 'friendship', id }
}
export function activityId(type, id) { activityTarget(type, id); return prefixes[type] + id }
export function newActivity(type, actorUid, id, serverTime) {
  if (typeof actorUid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(actorUid) || serverTime == null) throw new Error('INVALID_ACTIVITY')
  return { schemaVersion: ACTIVITY_SCHEMA, type, actorUid, createdAt: serverTime, target: activityTarget(type, id), readAt: null }
}
// IDs identify a slot. A plan reinvitation has a new server createdAt after removal.
// Future read commands must compare the observed createdAt in a transaction before
// marking the slot, so a stale command cannot mark a later invitation as read.

export const ACTIVITY_KINDS = Object.freeze(['friendship', 'jointPlan'])
export const ACTIVITY_FILTERS = Object.freeze(['all', 'unread'])
export const ACTIVITY_HORIZON_SECONDS = 90 * 24 * 60 * 60

// Read boundary: resolved timestamps only, never sentinels, dates or guessed units.
// Firebase Timestamp and JSON fixtures both expose these numeric components.
export function normalizeActivityTimestamp(value) {
  if (!value || typeof value !== 'object'
    || !Number.isInteger(value.seconds) || value.seconds < -62135596800 || value.seconds > 253402300799
    || !Number.isInteger(value.nanoseconds) || value.nanoseconds < 0 || value.nanoseconds >= 1000000000) return null
  return { seconds: value.seconds, nanoseconds: value.nanoseconds }
}
function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}
function compareTime(a, b) { return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds }

export function getActivityInstanceKey(item) {
  return JSON.stringify([item.itemId, item.createdAt.seconds, item.createdAt.nanoseconds])
}

// Returns only a closed diagnostic code on failure, never raw document values.
export function normalizeActivityItem(itemId, data) {
  const invalid = diagnostic => ({ ok: false, diagnostic })
  try {
    if (!exactKeys(data, ['schemaVersion', 'type', 'actorUid', 'createdAt', 'target', 'readAt'])) return invalid('INVALID_FIELDS')
    if (data.schemaVersion !== ACTIVITY_SCHEMA) return invalid('UNSUPPORTED_SCHEMA')
    if (!ACTIVITY_TYPES.includes(data.type)) return invalid('UNKNOWN_TYPE')
    if (typeof data.actorUid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(data.actorUid)) return invalid('INVALID_ACTOR')
    if (!exactKeys(data.target, ['kind', 'id'])) return invalid('INVALID_TARGET')
    let target
    try { target = activityTarget(data.type, data.target.id) } catch { return invalid('INVALID_TARGET') }
    if (data.target.kind !== target.kind) return invalid('INVALID_TARGET')
    if (itemId !== activityId(data.type, target.id)) return invalid('INVALID_ITEM_ID')
    const createdAt = normalizeActivityTimestamp(data.createdAt)
    if (!createdAt) return invalid('INVALID_CREATED_AT')
    const readAt = data.readAt === null ? null : normalizeActivityTimestamp(data.readAt)
    if (data.readAt !== null && !readAt) return invalid('INVALID_READ_AT')
    const item = { itemId, schemaVersion: ACTIVITY_SCHEMA, type: data.type, actorUid: data.actorUid,
      createdAt, target, readAt, isRead: readAt !== null }
    return { ok: true, item: { ...item, instanceKey: getActivityInstanceKey(item) } }
  } catch { return invalid('INVALID_DOCUMENT') }
}

// Entries are { itemId, data }. One malformed entry does not discard its neighbors.
export function normalizeActivityItems(entries) {
  if (!Array.isArray(entries)) return { items: [], diagnostics: [{ diagnostic: 'INVALID_COLLECTION' }] }
  const items = [], diagnostics = []
  entries.forEach((entry, index) => {
    let result
    try { result = normalizeActivityItem(entry?.itemId, entry?.data) }
    catch { result = { ok: false, diagnostic: 'INVALID_DOCUMENT' } }
    if (result.ok) items.push(result.item)
    else diagnostics.push({ index, diagnostic: result.diagnostic })
  })
  return { items, diagnostics }
}

// Following helpers accept normalized items. Copies are returned, never in-place edits.
export function sortActivityItems(items) {
  return [...items].sort((a, b) => compareTime(b.createdAt, a.createdAt)
    || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
}
export function filterActivityItems(items, mode) {
  if (!ACTIVITY_FILTERS.includes(mode)) throw new Error('INVALID_ACTIVITY_FILTER')
  return items.filter(item => mode === 'all' || !item.isRead)
}
export function isActivityWithinHorizon(item, now) {
  const time = normalizeActivityTimestamp(now)
  if (!time) throw new Error('INVALID_ACTIVITY_NOW')
  const cutoff = { seconds: time.seconds - ACTIVITY_HORIZON_SECONDS, nanoseconds: time.nanoseconds }
  return compareTime(item.createdAt, cutoff) >= 0 && compareTime(item.createdAt, time) <= 0
}
// Counts the supplied scope only; no global count or inference about unloaded pages.
export function getUnreadBadgeCount(items, max = 50) {
  if (!Number.isSafeInteger(max) || max < 1) throw new Error('INVALID_ACTIVITY_CAP')
  const count = items.reduce((total, item) => total + (item.isRead ? 0 : 1), 0)
  return { count: Math.min(count, max), isCapped: count > max }
}
