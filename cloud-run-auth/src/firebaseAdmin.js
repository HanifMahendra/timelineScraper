import admin from 'firebase-admin';

function getServiceAccountCredential() {
  const value = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!value) return undefined;

  const json = value.trim().startsWith('{')
    ? value
    : Buffer.from(value, 'base64').toString('utf8');

  return admin.credential.cert(JSON.parse(json));
}

export function getAdminApp() {
  if (admin.apps.length > 0) return admin.app();

  return admin.initializeApp({
    credential: getServiceAccountCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export function getFirestore() {
  return getAdminApp().firestore();
}

export function getAuth() {
  return getAdminApp().auth();
}
