import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function validatedFirebaseConfig() {
  const missing = Object.entries(firebaseConfig).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) throw new Error(`Konfigurasi Firebase belum lengkap: ${missing.join(', ')}`);
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/i.test(firebaseConfig.projectId || '')) throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID tidak valid.');
  if (!/^[a-z0-9.-]+$/i.test(firebaseConfig.authDomain || '') || firebaseConfig.authDomain?.includes('..')) throw new Error('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN tidak valid.');
  return firebaseConfig as Required<typeof firebaseConfig>;
}

export function getFirebaseAuth() {
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(validatedFirebaseConfig());
  return getAuth(app);
}

export function getFirebaseFirestore() {
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(validatedFirebaseConfig());
  return getFirestore(app);
}
