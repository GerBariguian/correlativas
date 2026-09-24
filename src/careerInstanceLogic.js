// Domain values, not Firestore documents. uid/id come from the owning context.
// No catalog lookup, clock, ID generation, consent or authorization lives here.
export const CAREER_LIFECYCLES = Object.freeze(['active', 'archived'])
export const CAREER_BINDING_STATES = Object.freeze(['resolved', 'unresolved', 'catalog-unavailable'])

function fail(code, detail) {
  throw Object.assign(new Error(`${code}: ${detail}`), { code })
}
function id(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0
    && !/[\s/\u0000-\u001f\u007f]/.test(value)
}
function fields(value, names) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every(key => Object.hasOwn(value, key))
}
function requireId(value, label) {
  if (!id(value)) fail('INVALID_ID', label)
}

export function validateCareerInstance(instance) {
  if (!fields(instance, ['uid', 'careerInstanceId', 'catalogId', 'lifecycle'])
    || !id(instance.uid) || !id(instance.careerInstanceId) || !id(instance.catalogId)
    || instance.careerInstanceId === instance.catalogId
    || !CAREER_LIFECYCLES.includes(instance.lifecycle)) {
    fail('INVALID_CAREER_INSTANCE', 'Expected distinct instance/catalog IDs, owner and active/archived lifecycle')
  }
  return instance
}

export function createCareerInstance(identity) {
  if (!fields(identity, ['uid', 'careerInstanceId', 'catalogId'])) {
    fail('INVALID_CAREER_INSTANCE', 'Expected explicit owner, instance ID and catalog ID')
  }
  const { uid, careerInstanceId, catalogId } = identity
  return Object.freeze(validateCareerInstance({ uid, careerInstanceId, catalogId, lifecycle: 'active' }))
}

// Boundary validation for a proposed replacement, not a general-purpose update API.
export function validateCareerInstanceTransition(before, after) {
  validateCareerInstance(before)
  validateCareerInstance(after)
  if (before.uid !== after.uid || before.careerInstanceId !== after.careerInstanceId
    || before.catalogId !== after.catalogId) fail('IMMUTABLE_CAREER_IDENTITY', 'Owner, instance ID and catalog cannot change')
  return after
}

export function isActiveCareerInstance(instance) {
  return validateCareerInstance(instance).lifecycle === 'active'
}
export function isArchivedCareerInstance(instance) {
  return validateCareerInstance(instance).lifecycle === 'archived'
}
export function archiveCareerInstance(instance) {
  return Object.freeze({ ...validateCareerInstance(instance), lifecycle: 'archived' })
}
export function restoreCareerInstance(instance) {
  return Object.freeze({ ...validateCareerInstance(instance), lifecycle: 'active' })
}

// Validate the entire owner's collection, including archived instances.
export function validateCareerInstances(uid, instances) {
  requireId(uid, 'uid')
  if (!Array.isArray(instances)) fail('INVALID_CAREER_COLLECTION', 'Expected an array')
  const catalogs = new Set(), identifiers = new Set()
  for (const instance of instances) {
    validateCareerInstance(instance)
    if (instance.uid !== uid) fail('CAREER_OWNER_MISMATCH', 'Collection contains another owner')
    if (catalogs.has(instance.catalogId)) fail('DUPLICATE_CATALOG_INSTANCE', 'More than one trajectory for a catalog')
    if (identifiers.has(instance.careerInstanceId)) fail('DUPLICATE_CAREER_INSTANCE_ID', 'Instance ID reused across catalogs')
    catalogs.add(instance.catalogId)
    identifiers.add(instance.careerInstanceId)
  }
  return instances
}

export function resolveCareerInstanceByCatalog(uid, instances, catalogId) {
  requireId(catalogId, 'catalogId')
  return validateCareerInstances(uid, instances).find(instance => instance.catalogId === catalogId) ?? null
}

// Navigation only: invalid/stale selection has no automatic replacement.
// Corrupt collections still throw rather than disguising ambiguous ownership.
export function resolveCareerSelection(uid, instances, activeCareerInstanceId) {
  validateCareerInstances(uid, instances)
  if (!id(activeCareerInstanceId)) return null
  return instances.find(instance => instance.careerInstanceId === activeCareerInstanceId
    && instance.lifecycle === 'active')?.careerInstanceId ?? null
}

// Academic compatibility is a necessary condition, NEVER an access permission.
export function areCareerInstancesAcademicallyCompatible(first, second) {
  if (first == null || second == null) return false
  validateCareerInstance(first)
  validateCareerInstance(second)
  return first.lifecycle === 'active' && second.lifecycle === 'active' && first.catalogId === second.catalogId
}

export function validateCareerBinding(binding) {
  if (!fields(binding, ['uid', 'careerInstanceId', 'bindingState']) || !id(binding.uid)
    || !CAREER_BINDING_STATES.includes(binding.bindingState)
    || (binding.bindingState === 'resolved' ? !id(binding.careerInstanceId) : binding.careerInstanceId !== null)) {
    fail('INVALID_BINDING', 'Resolved requires an instance ID; unresolved/unavailable require null')
  }
  return binding
}

export function validateResolvedCareerBinding(binding, planCatalogId, instance) {
  validateCareerBinding(binding)
  requireId(planCatalogId, 'planCatalogId')
  if (instance != null) validateCareerInstance(instance)
  if (binding.bindingState !== 'resolved' || !instance || instance.uid !== binding.uid
    || instance.careerInstanceId !== binding.careerInstanceId || instance.catalogId !== planCatalogId) {
    fail('INVALID_BINDING', 'Binding must identify the participant instance of the plan catalog')
  }
  // Archived instances remain valid historical bindings.
  return binding
}

// This derives only academic operability. Membership, closed/deleting, friendship
// and consent must be composed by their own layers; this does not authorize edits.
export function isCareerParticipantOperational(binding, planCatalogId, instance) {
  validateCareerBinding(binding)
  requireId(planCatalogId, 'planCatalogId')
  if (instance != null) validateCareerInstance(instance)
  return binding.bindingState === 'resolved' && instance != null
    && instance.uid === binding.uid && instance.careerInstanceId === binding.careerInstanceId
    && instance.catalogId === planCatalogId && instance.lifecycle === 'active'
}
