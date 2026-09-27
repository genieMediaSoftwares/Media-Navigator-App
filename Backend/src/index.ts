import { preflightResponse, withCors } from './lib/cors';
import { errorResponse, HttpError } from './lib/http';
import { RequestContext, Route } from './lib/router';
import {
	connectAccount,
	connectInstagram,
	disconnectAccount,
	getAccountDashboard,
	instagramCallback,
	listAccounts,
	syncAccount,
} from './routes/accounts';
import { forgotPassword, login, logout, me, signup } from './routes/auth';
import { listNotifications, overview, plannerInsights } from './routes/features';
import { handleHealth } from './routes/health';
import {
	intelligenceAsk,
	intelligenceAskHistory,
	intelligenceInsights,
	intelligenceMedia,
	intelligenceOverview,
	intelligencePost,
	intelligencePostAnalysis,
} from './routes/intelligence';

const routes: Route[] = [
	{ method: 'GET', path: '/health', handler: handleHealth },
	{ method: 'POST', path: '/api/auth/signup', handler: signup },
	{ method: 'POST', path: '/api/auth/login', handler: login },
	{ method: 'POST', path: '/api/auth/logout', handler: logout },
	{ method: 'GET', path: '/api/auth/me', handler: me },
	{ method: 'POST', path: '/api/auth/forgot-password', handler: forgotPassword },

	// Accounts & Instagram OAuth
	{ method: 'GET', path: '/api/accounts', handler: listAccounts },
	{ method: 'GET', path: '/api/accounts/connect/instagram', handler: connectInstagram },
	{ method: 'POST', path: '/api/accounts/connect', handler: connectAccount },
	{ method: 'GET', path: '/api/accounts/callback/instagram', handler: (ctx) => instagramCallback(ctx) },
	{ method: 'DELETE', path: '/api/accounts/:id', handler: disconnectAccount },
	{ method: 'POST', path: '/api/accounts/:id/sync', handler: syncAccount },
	{ method: 'GET', path: '/api/accounts/:id/dashboard', handler: getAccountDashboard },

	// Intelligence
	{ method: 'GET', path: '/api/intelligence/overview', handler: intelligenceOverview },
	{ method: 'GET', path: '/api/intelligence/insights', handler: intelligenceInsights },
	{ method: 'GET', path: '/api/intelligence/media', handler: intelligenceMedia },
	{ method: 'GET', path: '/api/intelligence/media/:id', handler: intelligencePost },
	{ method: 'GET', path: '/api/intelligence/media/:id/analysis', handler: intelligencePostAnalysis },
	{ method: 'GET', path: '/api/intelligence/ask', handler: intelligenceAskHistory },
	{ method: 'POST', path: '/api/intelligence/ask', handler: intelligenceAsk },

	// Overview, planner, notifications
	{ method: 'GET', path: '/api/overview', handler: overview },
	{ method: 'GET', path: '/api/planner/insights', handler: plannerInsights },
	{ method: 'GET', path: '/api/notifications', handler: listNotifications },
];

function matchRoutePath(routePath: string, requestPath: string): Record<string, string> | null {
	if (routePath === requestPath) return {};
	const routeParts = routePath.split('/');
	const requestParts = requestPath.split('/');
	if (routeParts.length !== requestParts.length) return null;

	const params: Record<string, string> = {};
	for (let i = 0; i < routeParts.length; i++) {
		if (routeParts[i].startsWith(':')) {
			params[routeParts[i].slice(1)] = requestParts[i];
		} else if (routeParts[i] !== requestParts[i]) {
			return null;
		}
	}
	return params;
}

async function dispatch(context: RequestContext): Promise<Response> {
	const { request, url } = context;

	let matchedRoute: Route | null = null;
	let matchedParams: Record<string, string> | undefined = undefined;
	const allowedMethods: string[] = [];

	for (const route of routes) {
		const params = matchRoutePath(route.path, url.pathname);
		if (params !== null) {
			allowedMethods.push(route.method);
			if (route.method === request.method) {
				matchedRoute = route;
				matchedParams = params;
				break;
			}
		}
	}

	if (matchedRoute) {
		return matchedRoute.handler({ ...context, params: matchedParams });
	}

	if (allowedMethods.length > 0) {
		throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${request.method} is not allowed on ${url.pathname}.`, undefined, {
			Allow: allowedMethods.join(', '),
		});
	}
	throw new HttpError(404, 'NOT_FOUND', `No route for ${request.method} ${url.pathname}.`);
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method === 'OPTIONS') return preflightResponse(request, env);

		const url = new URL(request.url);
		let response: Response;
		try {
			response = await dispatch({ request, env, ctx, url, now: Date.now() });
		} catch (error) {
			if (error instanceof HttpError) {
				response = errorResponse(error);
			} else {
				// Log diagnostics only: never request bodies, headers, passwords or tokens.
				console.error('Unhandled error', {
					method: request.method,
					path: url.pathname,
					error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});
				response = errorResponse(new HttpError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.'));
			}
		}
		return withCors(response, request, env);
	},
} satisfies ExportedHandler<Env>;
