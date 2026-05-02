import admin from 'firebase-admin';

export function getAdminApp() {
  if (admin.apps.length > 0) return admin.app();

  return admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export function getFirestore() {
  return getAdminApp().firestore();
}

export function getAuth() {
  return getAdminApp().auth();
}
