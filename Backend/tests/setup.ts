import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';

import { getConfig, loadConfig, setConfig } from '../src/config/env';
import { connectMongo } from '../src/db/mongo';

// Every test file gets its own throwaway database on the local MongoDB server, dropped afterwards.
// Configuration is built here from fixed test values: tests never read Backend/.env, so no real
// secret (Gemini key, encryption key, Meta credentials) is ever used by the test suite.

const server = process.env.MONGODB_TEST_SERVER ?? 'mongodb://127.0.0.1:27017';
const database = `mn_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

setConfig(
	loadConfig({
		NODE_ENV: 'test',
		MONGODB_URI: `${server}/${database}`,
		ENCRYPTION_KEY: 'test_encryption_key_32_bytes_len_0000',
		CORS_ALLOWED_ORIGINS: 'https://allowed.example',
		AUTH_RATE_LIMIT: '100000',
		API_RATE_LIMIT: '100000',
		GEMINI_MODEL: 'gemini-3.5-flash',
		META_API_VERSION: 'v21.0',
	}),
);

beforeAll(async () => {
	await connectMongo(getConfig().MONGODB_URI);
});

afterAll(async () => {
	await mongoose.connection.dropDatabase();
	await mongoose.disconnect();
});
