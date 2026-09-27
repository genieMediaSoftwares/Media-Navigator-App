// CORS only matters for browser clients (the Expo web target). Native apps send no Origin
// header and are unaffected. Allowed origins come from CORS_ALLOWED_ORIGINS (comma-separated);
// when it is empty, no cross-origin browser access is granted. Auth uses bearer tokens, not
// cookies, so credentials mode is never enabled.

function allowedOrigin(request: Request, env: Env): string | null {
	const origin = request.headers.get('Origin');
	if (!origin) return null;
	const allowed = env.CORS_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
	return allowed.includes(origin) ? origin : null;
}

export function preflightResponse(request: Request, env: Env): Response {
	const headers = new Headers({ Vary: 'Origin' });
	const origin = allowedOrigin(request, env);
	if (origin) {
		headers.set('Access-Control-Allow-Origin', origin);
		headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
		headers.set('Access-Control-Max-Age', '600');
	}
	return new Response(null, { status: 204, headers });
}

export function withCors(response: Response, request: Request, env: Env): Response {
	const origin = allowedOrigin(request, env);
	if (!origin) return response;
	const withHeaders = new Response(response.body, response);
	withHeaders.headers.set('Access-Control-Allow-Origin', origin);
	withHeaders.headers.append('Vary', 'Origin');
	return withHeaders;
}
