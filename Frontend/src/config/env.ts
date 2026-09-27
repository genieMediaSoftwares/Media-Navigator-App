// EXPO_PUBLIC_* variables are inlined at build time and must be read statically.
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export function getApiBaseUrl(): string {
  if (!apiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not set. See Frontend/.env.example.');
  }
  return apiBaseUrl.replace(/\/+$/, '');
}
