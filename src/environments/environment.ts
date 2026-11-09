// Production environment. Web app config from Firebase console > Project settings > Your apps.
// These values are public identifiers, not secrets: access is enforced by security rules.
export const environment = {
  production: true,
  // reCAPTCHA v3 site key for Firebase App Check (public, like the apiKey). Empty: App Check off.
  appCheckSiteKey: '',
  useEmulators: false,
  firebase: {
    apiKey: 'AIzaSyDic-cDvEjuUbdh7KZcHIH6LrHyIIiruGs',
    authDomain: 'indab-academy.firebaseapp.com',
    projectId: 'indab-academy',
    storageBucket: 'indab-academy.firebasestorage.app',
    messagingSenderId: '633819116863',
    appId: '1:633819116863:web:279ee1b9121e9cc9b90f8a',
    measurementId: 'G-7SY3VPH1ZM',
  },
};
