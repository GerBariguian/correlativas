export default function config({ command, mode }) {
  const maintenance = process.env.CORRELATIVAS_SOCIAL_MAINTENANCE
  if (maintenance !== undefined && maintenance !== '1') throw new Error('INVALID_SOCIAL_MAINTENANCE_BUILD')
  if (maintenance && command !== 'build') throw new Error('SOCIAL_MAINTENANCE_BUILD_ONLY')
  if (mode === 'emulator' && command !== 'serve') {
    throw new Error('EMULATOR_BUILD_FORBIDDEN: use npm run dev:emulator only')
  }
  // Do not expose the real VITE_* configuration in the emulator dev bundle.
  return mode === 'emulator' ? { envPrefix: 'CORRELATIVAS_EMULATOR_PUBLIC_' }
    : { define: { __SOCIAL_MAINTENANCE__: maintenance === '1' } }
}
