import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/env';
import { redactSecrets } from '../src/lib/redact';
import { buildAiContext } from '../src/services/aiIntelligence';
import { decryptJson, encryptJson } from '../src/services/credentials';
import { toIntelligencePost } from '../src/services/intelligence';
import { IntelligenceSnapshot } from '../src/services/intelligenceSnapshot';

const BASE = {
	NODE_ENV: 'development',
	PORT: '8787',
	HOST: '0.0.0.0',
	TRUST_PROXY: '0',
	MONGODB_URI: 'mongodb+srv://cluster.example.net/media_navigator',
	CORS_ALLOWED_ORIGINS: '',
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
	MAX_MEDIA_PAGES: '8',
	FACEBOOK_POSTS_PAGE_SIZE: '25',
	FACEBOOK_MAX_POST_PAGES: '8',
	YOUTUBE_MAX_VIDEOS: '200',
	LINKEDIN_MAX_POSTS: '100',
	OAUTH_STATE_TTL_MS: '600000',
	PENDING_CONNECTION_TTL_MS: '900000',
	AI_CACHE_TTL_MS: '604800000',
	AUTH_RATE_LIMIT: '30',
	API_RATE_LIMIT: '300',
	AI_REQUESTS_PER_HOUR: '40',
};

describe('configuration safety', () => {
	it('requires MONGODB_URI', () => {
		expect(() => loadConfig({})).toThrow(/MONGODB_URI/);
	});

	it('refuses production with a local MongoDB or a weak encryption key, without printing values', () => {
		expect(() => loadConfig({ ...BASE, NODE_ENV: 'production', ENCRYPTION_KEY: 'short' })).toThrow(/ENCRYPTION_KEY/);
		const key = 'k'.repeat(40);
		expect(() => loadConfig({ ...BASE, NODE_ENV: 'production', ENCRYPTION_KEY: key, MONGODB_URI: 'mongodb://127.0.0.1:27017/media_navigator' })).toThrow(
			/remotely reachable/,
		);
		try {
			loadConfig({ ...BASE, NODE_ENV: 'production', ENCRYPTION_KEY: key, MONGODB_URI: 'mongodb://127.0.0.1:27017/x' });
		} catch (error) {
			expect(String(error)).not.toContain(key);
		}
		expect(loadConfig({ ...BASE, NODE_ENV: 'production', ENCRYPTION_KEY: key }).PORT).toBe(8787);
		expect(loadConfig({ ...BASE, PORT: '10000' }).PORT).toBe(10000);
	});
});

describe('credential encryption', () => {
	it('uses AES-256-GCM with a fresh IV and detects tampering', async () => {
		const a = await encryptJson({ accessToken: 'SECRET_A' });
		const b = await encryptJson({ accessToken: 'SECRET_A' });
		expect(a.iv).not.toBe(b.iv);
		expect(a.ciphertext).not.toContain('SECRET_A');
		expect(await decryptJson(a)).toEqual({ accessToken: 'SECRET_A' });
		const tampered = { ...a, ciphertext: a.ciphertext.slice(0, -2) + (a.ciphertext.endsWith('A') ? 'BB' : 'AA') };
		await expect(decryptJson(tampered)).rejects.toThrow();
	});
});

describe('redaction', () => {
	it('removes tokens and connection strings from error text', () => {
		const text = redactSecrets(
			'GET https://graph.facebook.com/v21.0/me?access_token=EAAB123&x=1 failed; Authorization: Bearer abc.def; mongodb+srv://user:pass@host/db',
		);
		expect(text).not.toMatch(/EAAB123|abc\.def|user:pass/);
		expect(text).toContain('access_token=[redacted]');
	});
});

describe('Gemini context', () => {
	it('contains only sanitized analytics: no tokens, ids of the user, emails, URLs or credential references', () => {
		const row = {
			id: 'post_1', connected_account_id: 'acc_1', platform: 'instagram' as const, provider_media_id: '1789', format: 'REEL' as const,
			media_type: 'VIDEO', media_product_type: 'REELS', title: null, caption: 'x'.repeat(400), permalink: 'https://instagram.com/p/abc',
			media_url: 'https://cdn.example/secret-media-url', thumbnail_url: 'https://cdn.example/thumb', timestamp: '2026-09-01T10:00:00+0000',
			published_at: '2026-09-01T10:00:00.000Z', like_count: 10, comments_count: 1, views: 100, reach: null, saved: null, shares: null,
			total_interactions: null, extra_metrics: null, insights_synced_at: null, created_at: 0, updated_at: 0,
		};
		const post = toIntelligencePost(row, 1000, 11);
		const snapshot = {
			account: {
				id: 'acc_1', user_id: 'user_secret_id', platform: 'instagram', platform_account_id: 'ig_1', account_name: 'Name', account_username: 'handle',
				status: 'connected', token_reference: 'cred_secret_reference', token_expires_at: null, created_at: 0, updated_at: 0, last_synced_at: 1,
			},
			rows: [row],
			posts: [post],
			profile: { followers: 1000, following: 10, mediaCount: 1, reach: null, impressions: null },
			baseline: { avgInteractions: 11, medianInteractions: 11, sampleSize: 1 },
			archive: { syncedCount: 1, profileMediaCount: 1, formatCounts: [], totalViews: 100, viewsAvailableCount: 1, totalInteractions: 11, avgEngagementRate: 1.1, oldestPublishedAt: null, newestPublishedAt: null },
			formats: [],
			ranking: { sufficient: false, working: [], attention: [] },
			timing: { timezone: 'UTC', sufficient: false, postsAnalyzed: 1, minimumRequired: 30, heatmap: [], windows: [] },
		} as unknown as IntelligenceSnapshot;

		const context = JSON.stringify(buildAiContext(snapshot));
		for (const forbidden of ['user_secret_id', 'cred_secret_reference', 'https://', 'cdn.example', '@', 'ig_1']) expect(context).not.toContain(forbidden);
		// Captions are shortened.
		expect(context).not.toContain('x'.repeat(281));
		expect(context).toContain('"likes":10');
	});
});
