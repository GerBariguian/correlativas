import { careerInstancesRepository } from './careerInstances'
import { academicBridgeRepository } from './academicBridge'

// Product orchestration, never bootstrap. Registry and authenticated context are injected.
export function careerLifecycleRepository(context, uid, catalogs) {
  const metadata = careerInstancesRepository(context, uid, { catalogs })
  const bridge = academicBridgeRepository(context, uid)
  return {
    add: metadata.create,
    select: bridge.selectInstance,
    archive: metadata.archiveMetadata,
    restore: metadata.restoreMetadata,
  }
}
