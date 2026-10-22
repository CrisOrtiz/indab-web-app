// Development environment, used by `ng serve`.
// By default it talks to the local Firebase emulators (`npm run emulators`), so the app
// runs without a real Firebase project. To use the real project instead, set
// `useEmulators` to false and paste the web app config from the Firebase console.
export const environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-indab.firebaseapp.com',
    projectId: 'demo-indab',
    storageBucket: 'demo-indab.firebasestorage.app',
    messagingSenderId: '000000000000',
    appId: 'demo-app-id',
  },
};
