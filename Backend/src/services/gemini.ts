import { HttpError } from '../lib/http';

// Minimal Gemini client. Called only from the Worker; the API key never leaves the server and
// is sent as a header (never in a URL, log line, or response). Callers pass sanitized analytics
// only: no Meta tokens, credential references, session tokens or other secrets.

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 30_000;

/** OpenAPI-subset schema accepted by Gemini's `responseSchema`. */
export interface GeminiSchema {
	type: 'OBJECT' | 'ARRAY' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN';
	description?: string;
	enum?: string[];
	properties?: Record<string, GeminiSchema>;
	required?: string[];
	items?: GeminiSchema;
}

export function aiUnavailable(): HttpError {
	return new HttpError(503, 'AI_UNAVAILABLE', 'AI analysis is temporarily unavailable.');
}

let warnedMissingKey = false;

export function isAiConfigured(env: Env): boolean {
	const configured = typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim() !== '';
	if (!configured && !warnedMissingKey) {
		warnedMissingKey = true;
		// Operator-facing only (Worker logs). The key's value is never logged.
		console.warn('AI disabled: GEMINI_API_KEY is not set. Add it to Backend/.dev.vars locally, or `wrangler secret put GEMINI_API_KEY` in production.');
	}
	return configured;
}

/** Sends one prompt and returns Gemini's JSON output parsed (unvalidated: callers validate). */
export async function generateStructured(
	env: Env,
	request: { systemInstruction: string; prompt: string; schema: GeminiSchema },
	fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
	if (!isAiConfigured(env)) throw aiUnavailable();

	const model = env.GEMINI_MODEL && env.GEMINI_MODEL.trim() !== '' ? env.GEMINI_MODEL.trim() : DEFAULT_GEMINI_MODEL;
	let response: Response;
	try {
		response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
			signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: request.systemInstruction }] },
				contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
				generationConfig: {
					temperature: 0.3,
					responseMimeType: 'application/json',
					responseSchema: request.schema,
				},
			}),
		});
	} catch (error) {
		console.error('Gemini request failed', { model, error: error instanceof Error ? error.name : 'unknown' });
		throw aiUnavailable();
	}

	if (!response.ok) {
		// Google's error message (e.g. "models/x is not found", "API key not valid") never contains the key.
		let reason = '';
		try {
			const body = (await response.json()) as { error?: { status?: string; message?: string } };
			reason = `${body.error?.status ?? ''} ${body.error?.message ?? ''}`.trim().slice(0, 300);
		} catch {
			// non-JSON error body
		}
		console.error('Gemini returned an error status', { model, status: response.status, reason });
		throw aiUnavailable();
	}

	try {
		const body = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
		const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
		return JSON.parse(text);
	} catch {
		console.error('Gemini returned unparseable output', { model });
		throw aiUnavailable();
	}
}
