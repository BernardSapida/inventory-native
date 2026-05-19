import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCuDx2u6ismS9sDuXHCG8RVtYQUyxtVMdU',
  authDomain: 'smartstock-6fb23.firebaseapp.com',
  projectId: 'smartstock-6fb23',
  storageBucket: 'smartstock-6fb23.firebasestorage.app',
  messagingSenderId: '34425306401',
  appId: '1:34425306401:web:0aaff54be62a28af251260',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let _auth: ReturnType<typeof getAuth>;
try {
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  _auth = getAuth(app);
}

export const auth = _auth;
export const db = getFirestore(app);
