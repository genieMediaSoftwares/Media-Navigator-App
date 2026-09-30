import type { Request, Response } from 'express';

export type FieldErrors = Record<string, string>;

/** An error that maps directly to a JSON error response. Its message is shown to the client. */
export class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly fields?: FieldErrors,
		readonly headers?: Record<string, string>,
	) {
		super(message);
		this.name = 'HttpError';
	}
}

/** Sends the success envelope `{ success: true, data }`. Responses are never cached. */
export function ok(res: Response, data: unknown, status = 200): void {
	res.status(status).set('Cache-Control', 'no-store').json({ success: true, data });
}

export function sendError(res: Response, error: HttpError): void {
	if (error.headers) res.set(error.headers);
	res
		.status(error.status)
		.set('Cache-Control', 'no-store')
		.json({ success: false, error: { code: error.code, message: error.message, ...(error.fields && { fields: error.fields }) } });
}

export const MAX_JSON_BODY_BYTES = 16 * 1024;

/**
 * Returns the parsed JSON object body. Rejects wrong content types and non-object bodies; oversized
 * and malformed bodies are rejected earlier by express.json and mapped in the error handler.
 */
export function readJsonObject(req: Request): Record<string, unknown> {
	if (!req.is('application/json')) {
		throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body must be JSON.');
	}
	const body: unknown = req.body;
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object.');
	}
	return body as Record<string, unknown>;
}

/** Trimmed query-string value, or null when missing/blank/repeated. */
export function queryParam(req: Request, name: string): string | null {
	const value = req.query[name];
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
