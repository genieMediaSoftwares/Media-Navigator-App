export type FieldErrors = Record<string, string>;

/** An error that maps directly to a JSON error response. Its message is shown to the client. */
export class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly fields?: FieldErrors,
		readonly headers?: HeadersInit,
	) {
		super(message);
		this.name = 'HttpError';
	}
}

function json(body: unknown, status: number, headers?: HeadersInit): Response {
	const responseHeaders = new Headers(headers);
	responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
	responseHeaders.set('Cache-Control', 'no-store');
	return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function ok(data: unknown, status = 200): Response {
	return json({ success: true, data }, status);
}

export function errorResponse(error: HttpError): Response {
	const body = {
		success: false,
		error: { code: error.code, message: error.message, ...(error.fields && { fields: error.fields }) },
	};
	return json(body, error.status, error.headers);
}

const MAX_JSON_BODY_BYTES = 16 * 1024;

/** Reads a small JSON object body. Rejects wrong content types, oversized and malformed bodies. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
	const contentType = request.headers.get('Content-Type') ?? '';
	if (!contentType.toLowerCase().startsWith('application/json')) {
		throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body must be JSON.');
	}

	const buffer = await request.arrayBuffer();
	if (buffer.byteLength > MAX_JSON_BODY_BYTES) {
		throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(buffer));
	} catch {
		throw new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object.');
	}
	return parsed as Record<string, unknown>;
}
