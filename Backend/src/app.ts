import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { allowedCorsOrigins, getConfig } from './config/env';
import { MAX_JSON_BODY_BYTES, ok } from './lib/http';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimit } from './middleware/rateLimit';
import './models';
import { accountsRouter } from './routes/accounts';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { intelligenceRouter } from './routes/intelligence';
import { notificationsRouter } from './routes/notifications';
import { overviewRouter } from './routes/overview';
import { plannerRouter } from './routes/planner';
import { profileRouter } from './routes/profile';

/** Path patterns and methods, used only to answer 405 (with Allow) instead of 404 for a wrong method. */
const KNOWN_ROUTES: Array<{ pattern: RegExp; methods: string[] }> = [
	{ pattern: /^\/$/, methods: ['GET'] },
	{ pattern: /^\/health$/, methods: ['GET'] },
	{ pattern: /^\/api\/auth\/(signup|login|logout|forgot-password|change-password|logout-others|delete-account)$/, methods: ['POST'] },
	{ pattern: /^\/api\/auth\/(me|sessions)$/, methods: ['GET'] },
	{ pattern: /^\/api\/accounts$/, methods: ['GET'] },
	{ pattern: /^\/api\/accounts\/connect$/, methods: ['POST'] },
	{ pattern: /^\/api\/accounts\/(connect|callback)\/[^/]+$/, methods: ['GET'] },
	{ pattern: /^\/api\/accounts\/pending\/[^/]+$/, methods: ['GET'] },
	{ pattern: /^\/api\/accounts\/pending\/[^/]+\/select$/, methods: ['POST'] },
	{ pattern: /^\/api\/accounts\/[^/]+$/, methods: ['DELETE'] },
	{ pattern: /^\/api\/accounts\/[^/]+\/sync$/, methods: ['POST'] },
	{ pattern: /^\/api\/accounts\/[^/]+\/dashboard$/, methods: ['GET'] },
	{ pattern: /^\/api\/intelligence\/(overview|insights|media)$/, methods: ['GET'] },
	{ pattern: /^\/api\/intelligence\/media\/[^/]+(\/analysis)?$/, methods: ['GET'] },
	{ pattern: /^\/api\/intelligence\/ask$/, methods: ['GET', 'POST'] },
	{ pattern: /^\/api\/overview$/, methods: ['GET'] },
	{ pattern: /^\/api\/planner\/insights$/, methods: ['GET'] },
	{ pattern: /^\/api\/notifications$/, methods: ['GET'] },
	{ pattern: /^\/api\/notifications\/read$/, methods: ['POST'] },
	{ pattern: /^\/api\/profile$/, methods: ['PATCH'] },
	{ pattern: /^\/api\/profile\/preferences$/, methods: ['GET', 'PATCH'] },
	{ pattern: /^\/api\/profile\/avatar$/, methods: ['GET', 'DELETE'] },
	{ pattern: /^\/api\/profile\/avatar\/(upload-url|confirm)$/, methods: ['POST'] },
];

export function createApp(): Express {
	const config = getConfig();
	const app = express();

	app.disable('x-powered-by');
	app.set('trust proxy', config.TRUST_PROXY);
	app.use((req, _res, next) => {
		req.now = Date.now();
		next();
	});

	app.use(helmet());

	// CORS matters only for browser clients (the Expo web target). Native apps send no Origin header.
	// Auth uses bearer tokens, not cookies, so credentials mode is never enabled.
	const origins = allowedCorsOrigins(config);
	app.use(
		cors({
			origin: (origin, callback) => callback(null, origin !== undefined && origins.includes(origin) ? origin : false),
			methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
			allowedHeaders: ['Authorization', 'Content-Type'],
			maxAge: 600,
			credentials: false,
		}),
	);

	if (config.NODE_ENV !== 'test') {
		// Path only: query strings can carry OAuth codes and state. Never headers or bodies.
		morgan.token('path', (req) => (req as express.Request).originalUrl.split('?')[0]);
		app.use(morgan(':method :path :status :res[content-length] - :response-time ms'));
	}

	app.use('/api', apiRateLimit(config.API_RATE_LIMIT));
	app.use(express.json({ limit: MAX_JSON_BODY_BYTES }));

	/** GET / — what this server is, for anyone opening the base URL in a browser. Reveals no configuration. */
	app.get('/', (_req, res) => {
		ok(res, { service: 'Media Navigator API', status: 'running', health: '/health' });
	});
	app.use('/health', healthRouter());
	app.use('/api/auth', authRouter());
	app.use('/api/accounts', accountsRouter());
	app.use('/api/intelligence', intelligenceRouter());
	app.use('/api/overview', overviewRouter());
	app.use('/api/planner', plannerRouter());
	app.use('/api/notifications', notificationsRouter());
	app.use('/api/profile', profileRouter());

	app.use(notFoundHandler(() => KNOWN_ROUTES));
	app.use(errorHandler);
	return app;
}
