import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// All keys persisted in the device keychain/keystore. Add new keys here.
export const SecureStorageKey = {
  AuthToken: 'auth_token',
} as const;

export type SecureStorageKey = (typeof SecureStorageKey)[keyof typeof SecureStorageKey];

// expo-secure-store has no web implementation. On the web target the session token lives in
// sessionStorage: it survives reloads of the tab and is gone when the tab closes (never localStorage).
const web = Platform.OS === 'web';

function webStorage(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export async function getSecureItem(key: SecureStorageKey): Promise<string | null> {
  if (web) return webStorage()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setSecureItem(key: SecureStorageKey, value: string): Promise<void> {
  if (web) {
    webStorage()?.setItem(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

export async function deleteSecureItem(key: SecureStorageKey): Promise<void> {
  if (web) {
    webStorage()?.removeItem(key);
    return;
  }
  return SecureStore.deleteItemAsync(key);
}
