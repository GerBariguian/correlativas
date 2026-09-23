// No SDK or environment side effects. In emulator mode, real VITE_FIREBASE_* values
// are deliberately never read, even when Vite has loaded the normal .env file.
export function selectFirebaseRuntime(env, location) {
  const emulator = env.MODE === 'emulator'
  if (emulator) {
    if (env.DEV !== true) throw new Error('EMULATOR_REQUIRES_DEV')
    if (!location || location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || location.port !== '5174') {
      throw new Error('EMULATOR_REQUIRES_HTTP_127_0_0_1_5174')
    }
    return {
      emulator: true,
      config: {
        apiKey: 'fake-api-key-correlativas-manual',
        authDomain: 'demo-correlativas-manual.firebaseapp.com',
        projectId: 'demo-correlativas-manual',
        storageBucket: 'demo-correlativas-manual.appspot.com',
        messagingSenderId: '000000000000',
        appId: '1:000000000000:web:correlativas-manual',
      },
      authUrl: 'http://127.0.0.1:9099',
      firestoreHost: '127.0.0.1',
      firestorePort: 8088,
    }
  }
  if (location?.port === '5174') throw new Error('PORT_5174_RESERVED_FOR_EMULATOR')
  return {
    emulator: false,
    config: {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    },
  }
}
