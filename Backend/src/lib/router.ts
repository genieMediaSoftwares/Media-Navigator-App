export interface RequestContext {
	request: Request;
	env: Env;
	ctx: ExecutionContext;
	url: URL;
	params?: Record<string, string>;
	/** Request time in epoch milliseconds, captured once per request. */
	now: number;
}

export type Handler = (context: RequestContext) => Promise<Response> | Response;

export interface Route {
	method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
	path: string;
	handler: Handler;
}
