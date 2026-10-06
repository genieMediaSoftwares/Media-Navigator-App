import { getConfig } from '../config/env';
import { HttpError } from '../lib/http';

// Minimal Gemini client. Called only from the Node server; the API key never leaves the server and
// is sent as a header (never in a URL, log line, or response). Callers pass sanitized analytics
// only: no Meta tokens, credential references, session tokens or other secrets.

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

export function isAiConfigured(): boolean {
	const configured = Boolean(getConfig().GEMINI_API_KEY);
	if (!configured && !warnedMissingKey) {
		warnedMissingKey = true;
		// Operator-facing only (server logs). The key's value is never logged.
		console.warn('AI disabled: GEMINI_API_KEY is not set. Add it to Backend/.env locally, or to the Render environment in production.');
	}
	return configured;
}

/** Media sent with a prompt: small files inline (base64), large ones as an uploaded Files API reference. */
export type GeminiMedia = { mimeType: string; data: string } | { mimeType: string; fileUri: string };

function mediaPart(media: GeminiMedia) {
	return 'data' in media ? { inline_data: { mime_type: media.mimeType, data: media.data } } : { file_data: { mime_type: media.mimeType, file_uri: media.fileUri } };
}

/** Requests above this size use the Files API instead of inline data (Gemini's inline limit is 20 MB per request). */
export const GEMINI_INLINE_LIMIT_BYTES = 15 * 1024 * 1024;

/**
 * Uploads a file with the Files API (resumable protocol) and waits until Gemini has processed it.
 * Returns the file reference and its resource name (for deletion).
 */
export async function uploadGeminiFile(
	bytes: Uint8Array,
	mimeType: string,
	fetchImpl: typeof fetch = fetch,
	pollIntervalMs = 2_000,
	maxWaitMs = 90_000,
): Promise<{ fileUri: string; name: string }> {
	if (!isAiConfigured()) throw aiUnavailable();
	const config = getConfig();
	const key = config.GEMINI_API_KEY as string;
	try {
		const start = await fetchImpl(`${config.GEMINI_API_BASE_URL}/upload/v1beta/files`, {
			method: 'POST',
			headers: {
				'x-goog-api-key': key,
				'X-Goog-Upload-Protocol': 'resumable',
				'X-Goog-Upload-Command': 'start',
				'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
				'X-Goog-Upload-Header-Content-Type': mimeType,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ file: { display_name: 'media-navigator-video' } }),
		});
		const uploadUrl = start.headers.get('x-goog-upload-url');
		if (!start.ok || !uploadUrl) throw new Error(`upload start failed (${start.status})`);
		const upload = await fetchImpl(uploadUrl, {
			method: 'POST',
			headers: { 'Content-Length': String(bytes.byteLength), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
			body: bytes as unknown as BodyInit,
		});
		const uploaded = (await upload.json()) as { file?: { uri?: string; name?: string; state?: string } };
		if (!upload.ok || !uploaded.file?.uri || !uploaded.file.name) throw new Error(`upload failed (${upload.status})`);
		let state = uploaded.file.state;
		const deadline = Date.now() + maxWaitMs;
		while (state === 'PROCESSING' && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
			const poll = await fetchImpl(`${config.GEMINI_API_BASE_URL}/v1beta/${uploaded.file.name}`, { headers: { 'x-goog-api-key': key } });
			state = ((await poll.json()) as { state?: string }).state;
		}
		if (state !== 'ACTIVE') throw new Error(`file not ready (${state ?? 'unknown'})`);
		return { fileUri: uploaded.file.uri, name: uploaded.file.name };
	} catch (error) {
		console.error('Gemini file upload failed', { error: error instanceof Error ? error.message : 'unknown' });
		throw aiUnavailable();
	}
}

/** Best-effort deletion of an uploaded file (Gemini also deletes files after 48 hours). */
export async function deleteGeminiFile(name: string, fetchImpl: typeof fetch = fetch): Promise<void> {
	const config = getConfig();
	try {
		await fetchImpl(`${config.GEMINI_API_BASE_URL}/v1beta/${name}`, { method: 'DELETE', headers: { 'x-goog-api-key': config.GEMINI_API_KEY as string } });
	} catch {
		// Expires on its own.
	}
}

/** Sends one prompt and returns Gemini's JSON output parsed (unvalidated: callers validate). */
export async function generateStructured(
	request: { systemInstruction: string; prompt: string; schema: GeminiSchema; media?: GeminiMedia[]; timeoutMs?: number },
	fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
	if (!isAiConfigured()) throw aiUnavailable();

	const config = getConfig();
	const model = config.GEMINI_MODEL.trim();
	let response: Response;
	try {
		response = await fetchImpl(`${config.GEMINI_API_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY as string },
			signal: AbortSignal.timeout(request.timeoutMs ?? config.GEMINI_REQUEST_TIMEOUT_MS),
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: request.systemInstruction }] },
				contents: [{ role: 'user', parts: [...(request.media ?? []).map(mediaPart), { text: request.prompt }] }],
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
