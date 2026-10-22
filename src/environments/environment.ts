// Production environment. Replace the placeholder values with the web app config
// from Firebase console > Project settings > General > Your apps.
// These values are public identifiers, not secrets: access is enforced by security rules.
export const environment = {
  production: true,
  useEmulators: false,
  firebase: {
    apiKey: 'REPLACE_ME',
    authDomain: 'REPLACE_ME.firebaseapp.com',
    projectId: 'REPLACE_ME',
    storageBucket: 'REPLACE_ME.firebasestorage.app',
    messagingSenderId: 'REPLACE_ME',
    appId: 'REPLACE_ME',
  },
};
