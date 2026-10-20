import { fileURLToPath } from 'node:url'
export const contractFiles = Object.freeze([
  'userDataAuthorityLogic.js', 'careerInstancePersistenceLogic.js', 'careerInstanceLogic.js',
  'academicOnboardingLogic.js', 'logic.js', 'legacyWriteRevision.js', 'planningLogic.js',
  'projectionPersistenceLogic.js', 'services/academicBridge.js', 'services/academicOnboarding.js',
].map(name => fileURLToPath(new URL('../../src/' + name, import.meta.url)).replaceAll('\\', '/')))
