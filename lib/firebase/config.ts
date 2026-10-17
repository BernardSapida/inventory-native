import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBmVyf1FkEQbSHRSL2ZQ3Ydo-frrqq7ats',
  authDomain: 'pinnochiotagaytay-63d26.firebaseapp.com',
  projectId: 'pinnochiotagaytay-63d26',
  storageBucket: 'pinnochiotagaytay-63d26.firebasestorage.app',
  messagingSenderId: '643486155467',
  appId: '1:643486155467:web:87cc23bb80e5a95b08914e',
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
