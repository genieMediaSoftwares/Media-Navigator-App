import { ok } from '../lib/http';

// Liveness check only; it does not touch D1, R2 or KV.
export function handleHealth(): Response {
	return ok({ status: 'ok' });
}
