import { defineConfig } from 'vitest/config';

// Tests run against the local MongoDB server (mongodb://127.0.0.1:27017, override with
// MONGODB_TEST_SERVER). Each test file uses its own throwaway database (tests/setup.ts).
export default defineConfig({
	test: {
		include: ['tests/**/*.spec.ts'],
		setupFiles: ['./tests/setup.ts'],
		environment: 'node',
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
