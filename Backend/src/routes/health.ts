import { Router } from 'express';

import { pingMongo } from '../db/mongo';
import { HttpError, ok, sendError } from '../lib/http';

export function healthRouter(): Router {
	const router = Router();

	/** GET /health — server liveness plus a real database round trip. Reveals no configuration. */
	router.get('/', async (_req, res) => {
		if (await pingMongo()) {
			ok(res, { status: 'ok', database: 'connected' });
			return;
		}
		sendError(res, new HttpError(503, 'DATABASE_UNAVAILABLE', 'The server is running but cannot reach the database.'));
	});

	return router;
}
