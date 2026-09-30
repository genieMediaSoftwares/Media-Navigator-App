import { z } from 'zod';

// Server configuration, read once from process.env (Backend/.env locally, the Render dashboard in
// production). Secrets live only here on the server: nothing in this file is ever sent to the app,
// written to logs, or included in a Gemini prompt.

const optionalString = z
	.string()
	.optional()
	.transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

const schema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(8787),
	HOST: z.string().default('0.0.0.0'),

	/** Local: mongodb://127.0.0.1:27017/media_navigator. Production: a remotely reachable deployment (e.g. Atlas). */
	MONGODB_URI: z.string().min(1, 'MONGODB_URI is required.'),

	/** Comma-separated browser origins (Expo web only; native apps send no Origin). Empty = none. */
	CORS_ALLOWED_ORIGINS: z.string().default(''),
	/** Number of proxy hops in front of the app (Render: 1) so req.ip is the client address. */
	TRUST_PROXY: z.coerce.number().int().min(0).default(0),

	/** Key material for AES-256-GCM encryption of platform tokens. */
	ENCRYPTION_KEY: optionalString,

	GEMINI_API_KEY: optionalString,
	GEMINI_MODEL: z.string().default('gemini-3.5-flash'),

	META_APP_ID: optionalString,
	META_APP_SECRET: optionalString,
	/** Instagram OAuth callback, e.g. https://api.example.com/api/accounts/callback/instagram */
	META_REDIRECT_URI: optionalString,
	/** Facebook Pages OAuth callback, e.g. https://api.example.com/api/accounts/callback/facebook */
	FACEBOOK_REDIRECT_URI: optionalString,
	META_API_VERSION: z.string().default('v21.0'),

	GOOGLE_CLIENT_ID: optionalString,
	GOOGLE_CLIENT_SECRET: optionalString,
	GOOGLE_REDIRECT_URI: optionalString,

	LINKEDIN_CLIENT_ID: optionalString,
	LINKEDIN_CLIENT_SECRET: optionalString,
	LINKEDIN_REDIRECT_URI: optionalString,
	/** LinkedIn versioned REST API version header (YYYYMM). */
	LINKEDIN_API_VERSION: z.string().default('202509'),

	/** Deep-link schemes the OAuth callback may redirect back to. `exp` is Expo Go during development. */
	APP_REDIRECT_SCHEMES: z.string().default('medianavigator,exp'),

	R2_ACCOUNT_ID: optionalString,
	R2_ACCESS_KEY_ID: optionalString,
	R2_SECRET_ACCESS_KEY: optionalString,
	R2_BUCKET_NAME: optionalString,
	R2_ENDPOINT: optionalString,

	/** Requests per 15 minutes per IP for signup/login. */
	AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(30),
	/** Requests per minute per IP across the API. */
	API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
	/** Gemini calls per user per hour. */
	AI_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(40),
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
