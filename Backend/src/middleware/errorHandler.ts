import type { ErrorRequestHandler, RequestHandler } from 'express';

import { HttpError, sendError } from '../lib/http';
import { redactSecrets } from '../lib/redact';

/** JSON 404 for unknown paths; 405 with Allow when the path exists under another method. */
export function notFoundHandler(knownPaths: () => Array<{ pattern: RegExp; methods: string[] }>): RequestHandler {
	return (req, res) => {
		const allowed = knownPaths()
			.filter((route) => route.pattern.test(req.path))
			.flatMap((route) => route.methods);
		if (allowed.length > 0) {
			sendError(
				res,
				new HttpError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not allowed on ${req.path}.`, undefined, {
					Allow: [...new Set(allowed)].join(', '),
				}),
			);
			return;
		}
		sendError(res, new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}.`));
	};
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
	if (error instanceof HttpError) {
		sendError(res, error);
		return;
	}
	// body-parser errors (express.json)
	const bodyError = error as { type?: string; status?: number };
	if (bodyError?.type === 'entity.too.large') {
		sendError(res, new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
		return;
	}
	if (bodyError?.type === 'entity.parse.failed') {
		sendError(res, new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON.'));
		return;
	}
	if (bodyError?.type === 'encoding.unsupported' || bodyError?.type === 'charset.unsupported') {
		sendError(res, new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body must be UTF-8 JSON.'));
		return;
	}

	// Diagnostics only: never request bodies, headers, query strings, passwords or tokens. Messages are
	// redacted in case an HTTP client error ever echoes a URL that carried a token.
	console.error('Unhandled error', {
		method: req.method,
		path: req.path,
		error: redactSecrets(error instanceof Error ? `${error.name}: ${error.message}` : String(error)),
		stack: error instanceof Error && error.stack ? redactSecrets(error.stack, 2000) : undefined,
	});
	sendError(res, new HttpError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.'));
};
