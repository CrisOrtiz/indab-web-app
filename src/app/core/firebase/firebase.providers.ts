import {
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { FirebaseApp, FirebaseOptions, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export interface FirebaseConfig {
  options: FirebaseOptions;
  useEmulators: boolean;
}

/** Loads the Firestore SDK on first use; `instance()` is null until then. */
export interface FirestoreLoader {
  load(): Promise<Firestore>;
  instance(): Firestore | null;
}

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE_LOADER = new InjectionToken<FirestoreLoader>('FIRESTORE_LOADER');
/**
 * The Firestore instance, for the services of signed-in pages. `AuthService` loads it before the
 * route guards let a signed-in user in, so it is ready by the time those pages ask for it.
 */
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');

/**
 * Registers the Firebase app, Auth and Firestore instances for injection.
 * Uses the modular Firebase JS SDK directly, so it works with the latest Angular release.
 * Firestore is loaded lazily (see `FIRESTORE_LOADER`), so the public pages stay light.
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
      provide: FIRESTORE_LOADER,
      useFactory: (): FirestoreLoader => {
        const app = inject(FIREBASE_APP);
        let firestore: Firestore | null = null;
        let pending: Promise<Firestore> | undefined;
        return {
          instance: () => firestore,
          load: () =>
            (pending ??= import('./firestore').then(
              (m) => (firestore = m.connectFirestore(app, config.useEmulators)),
            )),
        };
      },
    },
    {
      provide: FIRESTORE,
      useFactory: () => {
        const firestore = inject(FIRESTORE_LOADER).instance();
        if (!firestore) {
          throw new Error('Firestore is not loaded yet: await FIRESTORE_LOADER.load() first.');
        }
        return firestore;
      },
    },
  ]);
}
