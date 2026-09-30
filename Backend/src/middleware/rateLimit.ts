import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

import { HttpError, sendError } from '../lib/http';

function limiter(windowMs: number, limit: number, message: string): RequestHandler {
	return rateLimit({
		windowMs,
		limit,
		standardHeaders: 'draft-8',
		legacyHeaders: false,
		handler: (_req, res) => sendError(res, new HttpError(429, 'RATE_LIMITED', message)),
	});
}

/** Brute-force protection for signup/login (per IP). */
export function authRateLimit(limit: number): RequestHandler {
	return limiter(15 * 60 * 1000, limit, 'Too many attempts. Please wait a few minutes and try again.');
}

/** Coarse per-IP ceiling for the whole API. */
export function apiRateLimit(limit: number): RequestHandler {
	return limiter(60 * 1000, limit, 'Too many requests. Please slow down and try again.');
}
