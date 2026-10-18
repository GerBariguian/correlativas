import {initializeApp,deleteApp} from 'firebase/app'
import {initializeAuth,inMemoryPersistence,connectAuthEmulator} from 'firebase/auth'
import {initializeFirestore,memoryLocalCache,connectFirestoreEmulator} from 'firebase/firestore'
import {openClient,readiness} from './policy.mjs'
const sdk={initializeApp,deleteApp,initializeAuth,inMemoryPersistence,connectAuthEmulator,initializeFirestore,memoryLocalCache,connectFirestoreEmulator}
export const connectLab=()=>openClient({sdk,fetcher:globalThis.fetch.bind(globalThis),location:globalThis.location})
export const checkLab=()=>readiness(globalThis.fetch.bind(globalThis))
