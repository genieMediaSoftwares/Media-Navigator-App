// Removes token-like values from text that may be stored or shown (sync error messages, logs).
// Platform tokens only ever travel in request URLs/headers, but error text from HTTP clients can echo a URL.

const PATTERNS: Array<[RegExp, string]> = [
	[/(access_token|refresh_token|client_secret|fb_exchange_token|code)=([^&\s"']+)/gi, '$1=[redacted]'],
	[/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]'],
	[/mongodb(\+srv)?:\/\/[^\s"']+/gi, 'mongodb://[redacted]'],
];

export function redactSecrets(text: string): string {
	return PATTERNS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text).slice(0, 500);
}
