import { TestBed } from '@angular/core/testing';
import { deleteApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_AUTH, FIRESTORE, provideFirebase } from './firebase.providers';

const options = { apiKey: 'demo-key', projectId: 'demo-indab-unit', appId: 'demo-app' };

describe('provideFirebase', () => {
  afterEach(() => deleteApp(TestBed.inject(FIREBASE_APP)));

  it('points Auth and Firestore at the local emulators in development', () => {
    TestBed.configureTestingModule({
      providers: [provideFirebase({ options, useEmulators: true })],
    });
    expect(TestBed.inject(FIREBASE_APP).options.projectId).toBe('demo-indab-unit');
    expect(TestBed.inject(FIREBASE_AUTH).emulatorConfig).toMatchObject({
      host: '127.0.0.1',
      port: 9099,
    });
    expect(TestBed.inject(FIRESTORE).toJSON()).toMatchObject({
      settings: expect.objectContaining({ host: '127.0.0.1:8080', ssl: false }),
    });
  });

  it('talks to the real project in production', () => {
    TestBed.configureTestingModule({
      providers: [provideFirebase({ options, useEmulators: false })],
    });
    expect(TestBed.inject(FIREBASE_AUTH).emulatorConfig).toBeNull();
    expect(TestBed.inject(FIRESTORE).toJSON()).toMatchObject({
      settings: expect.objectContaining({ host: 'firestore.googleapis.com' }),
    });
  });
});
