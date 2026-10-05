// EXPO_PUBLIC_* variables are inlined at build time by Metro/Babel and must be read statically.
const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Validates and returns the base URL for the backend API.
 * The value must come strictly from EXPO_PUBLIC_API_BASE_URL (configured in Frontend/.env
 * for local development, or via EAS environment variables for production builds).
 *
 * Silently falling back to default URLs or LAN addresses is prohibited to prevent unintended runtime connections.
 */
export function getApiBaseUrl(): string {
  const url = rawApiBaseUrl?.trim();
  if (!url) {
    throw new Error('Missing required environment variable: EXPO_PUBLIC_API_BASE_URL');
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Invalid EXPO_PUBLIC_API_BASE_URL: must start with http:// or https:// (received: "${url}")`);
  }
  return url.replace(/\/+$/, '');
}
