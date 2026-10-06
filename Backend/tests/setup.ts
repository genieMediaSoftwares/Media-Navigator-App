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
		PORT: '8787',
		HOST: '0.0.0.0',
		TRUST_PROXY: '0',
		MONGODB_URI: `${server}/${database}`,
		ENCRYPTION_KEY: 'test_encryption_key_32_bytes_len_0000',
		CORS_ALLOWED_ORIGINS: 'https://allowed.example',
		GEMINI_MODEL: 'gemini-3.5-flash',
		GEMINI_API_BASE_URL: 'https://generativelanguage.googleapis.com',
		GEMINI_REQUEST_TIMEOUT_MS: '30000',
		META_API_VERSION: 'v21.0',
		META_GRAPH_BASE_URL: 'https://graph.facebook.com',
		FACEBOOK_OAUTH_BASE_URL: 'https://www.facebook.com',
		INSTAGRAM_GRAPH_BASE_URL: 'https://graph.instagram.com',
		LINKEDIN_API_VERSION: '202509',
		LINKEDIN_API_BASE_URL: 'https://api.linkedin.com/rest',
		LINKEDIN_OAUTH_BASE_URL: 'https://www.linkedin.com/oauth/v2',
		YOUTUBE_DATA_API_BASE_URL: 'https://www.googleapis.com/youtube/v3',
		YOUTUBE_ANALYTICS_API_BASE_URL: 'https://youtubeanalytics.googleapis.com/v2/reports',
		GOOGLE_OAUTH_TOKEN_URL: 'https://oauth2.googleapis.com/token',
		GOOGLE_OAUTH_AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
		APP_REDIRECT_SCHEMES: 'medianavigator,exp',
		DEFAULT_RETURN_URL: 'medianavigator://oauth/callback',
		HTTP_REQUEST_TIMEOUT_MS: '20000',
		MEDIA_PAGE_SIZE: '25',
		MAX_MEDIA_PAGES: '400',
		FACEBOOK_POSTS_PAGE_SIZE: '25',
		FACEBOOK_MAX_POST_PAGES: '8',
		YOUTUBE_MAX_VIDEOS: '200',
		LINKEDIN_MAX_POSTS: '100',
		OAUTH_STATE_TTL_MS: '600000',
		PENDING_CONNECTION_TTL_MS: '900000',
		AI_CACHE_TTL_MS: '604800000',
		AUTH_RATE_LIMIT: '100000',
		API_RATE_LIMIT: '100000',
		AI_REQUESTS_PER_HOUR: '40',
	}),
);

beforeAll(async () => {
	await connectMongo(getConfig().MONGODB_URI);
});

afterAll(async () => {
	await mongoose.connection.dropDatabase();
	await mongoose.disconnect();
});
