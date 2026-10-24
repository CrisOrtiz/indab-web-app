import { TestBed } from '@angular/core/testing';
import { deleteApp } from 'firebase/app';
import {
  FIREBASE_APP,
  FIREBASE_AUTH,
  FIRESTORE,
  FIRESTORE_LOADER,
  provideFirebase,
} from './firebase.providers';

const options = { apiKey: 'demo-key', projectId: 'demo-indab-unit', appId: 'demo-app' };

describe('provideFirebase', () => {
  afterEach(() => deleteApp(TestBed.inject(FIREBASE_APP)));

  it('points Auth and Firestore at the local emulators in development', async () => {
    TestBed.configureTestingModule({
      providers: [provideFirebase({ options, useEmulators: true })],
    });
    expect(TestBed.inject(FIREBASE_APP).options.projectId).toBe('demo-indab-unit');
    expect(TestBed.inject(FIREBASE_AUTH).emulatorConfig).toMatchObject({
      host: '127.0.0.1',
      port: 9099,
    });
    await TestBed.inject(FIRESTORE_LOADER).load();
    expect(TestBed.inject(FIRESTORE).toJSON()).toMatchObject({
      settings: expect.objectContaining({ host: '127.0.0.1:8080', ssl: false }),
    });
  });

  it('talks to the real project in production', async () => {
    TestBed.configureTestingModule({
      providers: [provideFirebase({ options, useEmulators: false })],
    });
    expect(TestBed.inject(FIREBASE_AUTH).emulatorConfig).toBeNull();
    await TestBed.inject(FIRESTORE_LOADER).load();
    expect(TestBed.inject(FIRESTORE).toJSON()).toMatchObject({
      settings: expect.objectContaining({ host: 'firestore.googleapis.com' }),
    });
  });

  it('loads Firestore only when asked, once', async () => {
    TestBed.configureTestingModule({
      providers: [provideFirebase({ options, useEmulators: true })],
    });
    const loader = TestBed.inject(FIRESTORE_LOADER);
    expect(loader.instance()).toBeNull();
    expect(() => TestBed.inject(FIRESTORE)).toThrow(/not loaded/);

    const [first, second] = await Promise.all([loader.load(), loader.load()]);
    expect(first).toBe(second);
    expect(loader.instance()).toBe(first);
  });
});
