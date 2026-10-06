import { z } from 'zod';

// Server configuration, read once from process.env (Backend/.env locally, the Render dashboard in
// production). Secrets live only here on the server: nothing in this file is ever sent to the app,
// written to logs, or included in a Gemini prompt.

const optionalString = z
	.string()
	.optional()
	.transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

const schema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production'], {
		message: 'NODE_ENV is required and must be development, test, or production.',
	}),
	PORT: z.coerce.number().int().positive({ message: 'PORT is required and must be a positive integer.' }),
	HOST: z.string().min(1, 'HOST is required.'),

	/** Local: mongodb://127.0.0.1:27017/media_navigator. Production: a remotely reachable deployment (e.g. Atlas). */
	MONGODB_URI: z.string().min(1, 'MONGODB_URI is required.'),

	/** Comma-separated browser origins (Expo web only; native apps send no Origin). Empty = none. */
	CORS_ALLOWED_ORIGINS: z.string(),
	/** Number of proxy hops in front of the app (Render: 1) so req.ip is the client address. */
	TRUST_PROXY: z.coerce.number().int().min(0, 'TRUST_PROXY is required.'),

	/** Key material for AES-256-GCM encryption of platform tokens. */
	ENCRYPTION_KEY: optionalString,

	GEMINI_API_KEY: optionalString,
	GEMINI_MODEL: z.string().min(1, 'GEMINI_MODEL is required.'),
	GEMINI_API_BASE_URL: z.string().url('GEMINI_API_BASE_URL must be a valid URL.'),
	GEMINI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive('GEMINI_REQUEST_TIMEOUT_MS must be a positive integer.'),

	META_APP_ID: optionalString,
	META_APP_SECRET: optionalString,
	/** Instagram OAuth callback, e.g. https://api.example.com/api/accounts/callback/instagram */
	META_REDIRECT_URI: optionalString,
	/** Facebook Pages OAuth callback, e.g. https://api.example.com/api/accounts/callback/facebook */
	FACEBOOK_REDIRECT_URI: optionalString,
	META_API_VERSION: z.string().min(1, 'META_API_VERSION is required.'),
	META_GRAPH_BASE_URL: z.string().url('META_GRAPH_BASE_URL must be a valid URL.'),
	FACEBOOK_OAUTH_BASE_URL: z.string().url('FACEBOOK_OAUTH_BASE_URL must be a valid URL.'),
	INSTAGRAM_GRAPH_BASE_URL: z.string().url('INSTAGRAM_GRAPH_BASE_URL must be a valid URL.'),

	GOOGLE_CLIENT_ID: optionalString,
	GOOGLE_CLIENT_SECRET: optionalString,
	GOOGLE_REDIRECT_URI: optionalString,
	YOUTUBE_DATA_API_BASE_URL: z.string().url('YOUTUBE_DATA_API_BASE_URL must be a valid URL.'),
	YOUTUBE_ANALYTICS_API_BASE_URL: z.string().url('YOUTUBE_ANALYTICS_API_BASE_URL must be a valid URL.'),
	GOOGLE_OAUTH_TOKEN_URL: z.string().url('GOOGLE_OAUTH_TOKEN_URL must be a valid URL.'),
	GOOGLE_OAUTH_AUTH_URL: z.string().url('GOOGLE_OAUTH_AUTH_URL must be a valid URL.'),

	LINKEDIN_CLIENT_ID: optionalString,
	LINKEDIN_CLIENT_SECRET: optionalString,
	LINKEDIN_REDIRECT_URI: optionalString,
	/** LinkedIn versioned REST API version header (YYYYMM). */
	LINKEDIN_API_VERSION: z.string().min(1, 'LINKEDIN_API_VERSION is required.'),
	LINKEDIN_API_BASE_URL: z.string().url('LINKEDIN_API_BASE_URL must be a valid URL.'),
	LINKEDIN_OAUTH_BASE_URL: z.string().url('LINKEDIN_OAUTH_BASE_URL must be a valid URL.'),

	/** Deep-link schemes the OAuth callback may redirect back to. `exp` is Expo Go during development. */
	APP_REDIRECT_SCHEMES: z.string().min(1, 'APP_REDIRECT_SCHEMES is required.'),
	DEFAULT_RETURN_URL: z.string().min(1, 'DEFAULT_RETURN_URL is required.'),

	R2_ACCOUNT_ID: optionalString,
	R2_ACCESS_KEY_ID: optionalString,
	R2_SECRET_ACCESS_KEY: optionalString,
	R2_BUCKET_NAME: optionalString,
	R2_ENDPOINT: optionalString,

	/** Network & pagination settings */
	HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive('HTTP_REQUEST_TIMEOUT_MS must be a positive integer.'),
	MEDIA_PAGE_SIZE: z.coerce.number().int().positive('MEDIA_PAGE_SIZE must be a positive integer.'),
	MAX_MEDIA_PAGES: z.coerce.number().int().positive('MAX_MEDIA_PAGES must be a positive integer.'),
	/**
	 * Sync cadence. Defaults let existing deployments start without new settings.
	 * A full sync walks every page (Instagram returns at most the 10,000 most recent media) and refreshes
	 * every post's metrics; incremental syncs in between fetch new posts and refresh posts published in
	 * the last METRICS_REFRESH_DAYS.
	 */
	FULL_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),
	METRICS_REFRESH_DAYS: z.coerce.number().int().positive().default(30),
	/** Background sync for every connected account when its last sync is older than this. 0 disables it. */
	AUTO_SYNC_INTERVAL_MS: z.coerce.number().int().min(0).default(6 * 60 * 60 * 1000),
	SYNC_SCHEDULER_TICK_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
	SYNC_LEASE_MS: z.coerce.number().int().positive().default(20 * 60 * 1000),
	/** Per-Reel watch-time insight requests per sync (one request per Reel; the rest follow on later syncs). */
	REEL_WATCH_METRICS_PER_SYNC: z.coerce.number().int().min(0).default(60),
	/** Largest video downloaded for Deep Video Analysis. */
	VIDEO_ANALYSIS_MAX_BYTES: z.coerce.number().int().positive().default(80 * 1024 * 1024),
	FACEBOOK_POSTS_PAGE_SIZE: z.coerce.number().int().positive('FACEBOOK_POSTS_PAGE_SIZE must be a positive integer.'),
	FACEBOOK_MAX_POST_PAGES: z.coerce.number().int().positive('FACEBOOK_MAX_POST_PAGES must be a positive integer.'),
	YOUTUBE_MAX_VIDEOS: z.coerce.number().int().positive('YOUTUBE_MAX_VIDEOS must be a positive integer.'),
	LINKEDIN_MAX_POSTS: z.coerce.number().int().positive('LINKEDIN_MAX_POSTS must be a positive integer.'),

	/** TTL settings */
	OAUTH_STATE_TTL_MS: z.coerce.number().int().positive('OAUTH_STATE_TTL_MS must be a positive integer.'),
	PENDING_CONNECTION_TTL_MS: z.coerce.number().int().positive('PENDING_CONNECTION_TTL_MS must be a positive integer.'),
	AI_CACHE_TTL_MS: z.coerce.number().int().positive('AI_CACHE_TTL_MS must be a positive integer.'),

	/** Requests per 15 minutes per IP for signup/login. */
	AUTH_RATE_LIMIT: z.coerce.number().int().positive('AUTH_RATE_LIMIT must be a positive integer.'),
	/** Requests per minute per IP across the API. */
	API_RATE_LIMIT: z.coerce.number().int().positive('API_RATE_LIMIT must be a positive integer.'),
	/** Gemini calls per user per hour. */
	AI_REQUESTS_PER_HOUR: z.coerce.number().int().positive('AI_REQUESTS_PER_HOUR must be a positive integer.'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
	const parsed = schema.safeParse(source);
	if (!parsed.success) {
		// Names only; values are never printed.
		const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
		throw new Error(`Invalid server configuration: ${problems}`);
	}
	const config = parsed.data;
	if (config.NODE_ENV === 'production') {
		if (!config.ENCRYPTION_KEY || config.ENCRYPTION_KEY.length < 32) {
			throw new Error('Invalid server configuration: ENCRYPTION_KEY must be set to at least 32 characters in production.');
		}
		if (/^mongodb:\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(config.MONGODB_URI)) {
			throw new Error('Invalid server configuration: production MONGODB_URI must point to a remotely reachable MongoDB deployment.');
		}
	}
	return config;
}

let current: AppConfig | null = null;

export function getConfig(): AppConfig {
	current ??= loadConfig();
	return current;
}

/** Replaces the active configuration (server start-up and tests). */
export function setConfig(config: AppConfig): void {
	current = config;
}

/** Applies overrides to the active configuration and returns a function that restores it (tests). */
export function overrideConfig(overrides: Partial<AppConfig>): () => void {
	const previous = getConfig();
	current = { ...previous, ...overrides };
	return () => {
		current = previous;
	};
}

export function allowedCorsOrigins(config: AppConfig = getConfig()): string[] {
	return config.CORS_ALLOWED_ORIGINS.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
}
