import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDUrASbmBspvB-GosoDYvg1Tkql7vVjAFY',
  authDomain: 'smartstock-9594b.firebaseapp.com',
  projectId: 'smartstock-9594b',
  storageBucket: 'smartstock-9594b.firebasestorage.app',
  messagingSenderId: '904156496814',
  appId: '1:904156496814:web:9c9cf2f265fb5fb7d7fe3f',
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
