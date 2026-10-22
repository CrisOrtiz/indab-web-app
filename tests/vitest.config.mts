import { defineConfig } from 'vitest/config';

// Firestore security rules tests. Run with `npm run test:rules`, which starts the emulator.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
  },
});
