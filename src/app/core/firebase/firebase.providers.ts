import { EnvironmentProviders, InjectionToken, inject, makeEnvironmentProviders } from '@angular/core';
import { FirebaseApp, FirebaseOptions, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

export interface FirebaseConfig {
  options: FirebaseOptions;
  useEmulators: boolean;
}

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');

/**
 * Registers the Firebase app, Auth and Firestore instances for injection.
 * Uses the modular Firebase JS SDK directly, so it works with the latest Angular release.
 */
export function provideFirebase(config: FirebaseConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: FIREBASE_APP, useFactory: () => initializeApp(config.options) },
    {
      provide: FIREBASE_AUTH,
      useFactory: () => {
        const auth = getAuth(inject(FIREBASE_APP));
        if (config.useEmulators) {
          connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        }
        return auth;
      },
    },
    {
      provide: FIRESTORE,
      useFactory: () => {
        const firestore = getFirestore(inject(FIREBASE_APP));
        if (config.useEmulators) {
          connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
        }
        return firestore;
      },
    },
  ]);
}
