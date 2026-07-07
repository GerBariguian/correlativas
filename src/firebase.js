import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyBKUOvxxpVCD7VFxYghaE_cQEDBk7jcP1A',
  authDomain: 'correlativas-40c27.firebaseapp.com',
  projectId: 'correlativas-40c27',
  storageBucket: 'correlativas-40c27.firebasestorage.app',
  messagingSenderId: '1061038184583',
  appId: '1:1061038184583:web:a411752d1f588d829d4022',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)